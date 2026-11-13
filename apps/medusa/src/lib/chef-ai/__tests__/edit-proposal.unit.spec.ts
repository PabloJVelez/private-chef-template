import { attachEditContext, resolveEditProposal } from "../edit-proposal";
import {
  editContextSchema,
  editIntentSchema,
  editIntentTool,
  type EditIntent,
} from "../edit-intent";
import { answerSchedule, chatInput, proposalSelectionInput } from "../chat";
const now = new Date("2026-11-14T03:00:00Z"); // Nov 13 locally, regardless of browser/server locale.
const zone = "America/New_York";
const revision = "a".repeat(32);
const context = {
  candidates: [{ id: "exact-event", revision }],
  observedAt: now.getTime(),
};
const intent: EditIntent = {
  target: "context",
  date: { kind: "day_of_month", day: 29 },
  time: null,
  clarification: "none",
};
let read: jest.Mock, scope: any;
beforeEach(() => {
  read = jest.fn().mockResolvedValue({
    id: "exact-event",
    status: "pending",
    revision,
    requestedDate: "2026-11-30T16:00:00Z",
    requestedTime: "11:00",
    timeZone: zone,
    eligible: true,
  });
  scope = { resolve: () => ({ readScheduleEditEvent: read }) };
});
it("resolves the 29th against the authoritative Nov 30 event and omits untouched arrival", async () => {
  const result = await resolveEditProposal(scope, intent, context, zone, now);
  expect(result.editProposal).toEqual({
    eventId: "exact-event",
    expectedRevision: revision,
    date: "2026-11-29",
  });
  expect(read).toHaveBeenCalledWith("exact-event");
});
it.each([
  [{ kind: "relative_day", offset: 1 }, "2026-11-14"],
  [{ kind: "iso", value: "2027-02-20" }, "2027-02-20"],
  [{ kind: "month_day", month: 12, day: 1, year: 2027 }, "2027-12-01"],
  [{ kind: "month_day", month: 12, day: 1, year: null }, "2026-12-01"],
])(
  "resolves typed date %j without browser timezone or invented alternatives",
  async (date, expected) => {
    expect(
      (
        await resolveEditProposal(
          scope,
          { ...intent, date } as EditIntent,
          context,
          zone,
          now,
        )
      ).editProposal?.date,
    ).toBe(expected);
  },
);
it("tomorrow rolls business-local month/year, not the event date", async () => {
  const today = new Date("2027-01-01T03:00:00Z");
  expect(
    (
      await resolveEditProposal(
        scope,
        { ...intent, date: { kind: "relative_day", offset: 1 } },
        { ...context, observedAt: today.getTime() },
        zone,
        today,
      )
    ).editProposal?.date,
  ).toBe("2027-01-01");
});
it("time-only preserves date by omission and ambiguous at 7 requires clarification", async () => {
  expect(
    (
      await resolveEditProposal(
        scope,
        { ...intent, date: null, time: "19:00" },
        context,
        zone,
        now,
      )
    ).editProposal,
  ).toEqual({
    eventId: "exact-event",
    expectedRevision: revision,
    time: "19:00",
  });
  expect(
    (
      await resolveEditProposal(
        scope,
        { ...intent, clarification: "time" },
        context,
        zone,
        now,
      )
    ).message,
  ).toContain("AM/PM");
});
it.each([
  { kind: "day_of_month", day: 31 },
  { kind: "iso", value: "2026-02-30" },
])("does not roll an invalid date %j into another month", async (date) => {
  const result = await resolveEditProposal(
    scope,
    { ...intent, date } as EditIntent,
    context,
    zone,
    now,
  );
  expect(result.editProposal).toBeUndefined();
  expect(result.message).toContain("does not exist");
});
it("counts every candidate including confirmed before eligibility and retains exact typed intent for choice", async () => {
  const both = {
    ...context,
    candidates: [
      ...context.candidates,
      { id: "confirmed", revision: "b".repeat(32) },
    ],
  };
  const result = await resolveEditProposal(scope, intent, both, zone, now);
  expect(result.editProposal).toBeUndefined();
  expect(result.editClarification).toEqual({ intent, context: both });
  expect(
    (
      await resolveEditProposal(
        scope,
        intent,
        { ...both, selectedId: "exact-event" },
        zone,
        now,
      )
    ).editProposal?.eventId,
  ).toBe("exact-event");
});
it.each(["confirmed", "cancelled", "completed"])(
  "refuses current %s status even if context claimed pending",
  async (status) => {
    read.mockResolvedValueOnce({ ...(await read()), status });
    const result = await resolveEditProposal(scope, intent, context, zone, now);
    expect(result.editProposal).toBeUndefined();
    expect(result.message).toContain("Only pending");
  },
);
it("rejects changed dates/revisions, disappeared/forged IDs and old/missing context", async () => {
  read.mockResolvedValueOnce({
    ...(await read()),
    revision: "b".repeat(32),
    requestedDate: "2026-12-30T16:00:00Z",
  });
  expect(
    (await resolveEditProposal(scope, intent, context, zone, now)).message,
  ).toContain("changed");
  read.mockRejectedValueOnce(new Error("not found"));
  expect(
    (await resolveEditProposal(scope, intent, context, zone, now)).message,
  ).toContain("no longer available");
  for (const ctx of [
    undefined,
    { ...context, observedAt: now.getTime() - 300001 },
  ])
    expect(
      (await resolveEditProposal(scope, intent, ctx, zone, now)).editProposal,
    ).toBeUndefined();
});
it("fails closed for inconsistent legacy arrival and mismatched business zone", async () => {
  read.mockResolvedValueOnce({ ...(await read()), requestedTime: "12:00" });
  expect(
    (await resolveEditProposal(scope, intent, context, zone, now)).message,
  ).toContain("inconsistent");
  expect(
    (await resolveEditProposal(scope, intent, context, "America/Chicago", now))
      .message,
  ).toContain("timezone differs");
});
it("strictly bounds untrusted context and model vocabulary; no IDs, patches, URLs, references or executable names", () => {
  for (const extra of ["eventId", "reference", "url", "patch", "workflow"])
    expect(
      editIntentSchema.safeParse({ ...intent, [extra]: "injected" }).success,
    ).toBe(false);
  for (const bad of [
    { ...context, selectedId: "forged" },
    { ...context, candidates: Array(21).fill(context.candidates[0]) },
    { ...context, candidates: [{ id: "private-event:display-id", revision }] },
    { ...context, actorId: "A" },
  ]) {
    expect(editContextSchema.safeParse(bad).success).toBe(false);
    expect(
      chatInput.safeParse({ message: "move it", context: bad }).success,
    ).toBe(false);
    expect(
      proposalSelectionInput.safeParse({ selection: { intent, context: bad } })
        .success,
    ).toBe(false);
  }
  expect(editIntentTool().function.strict).toBe(true);
  expect(Object.keys(editIntentTool().function.parameters.properties)).toEqual([
    "target",
    "targetDate",
    "date",
    "continuation",
    "time",
    "clarification",
  ]);
});
it("attaches a bounded revision context only when the read still matches the authoritative row", async () => {
  const answer: any = {
    message: "read",
    complete: true,
    entries: [
      {
        source: { type: "private-event", id: "exact-event" },
        requestedTime: { start: "2026-11-30T16:00:00.000Z" },
        timeZone: zone,
        status: "pending",
      },
    ],
  };
  expect(
    (await attachEditContext(scope, answer)).editContext?.candidates,
  ).toEqual(context.candidates);
  read.mockResolvedValueOnce({
    ...(await read()),
    requestedDate: "2026-12-30T16:00:00Z",
  });
  expect((await attachEditContext(scope, answer)).editContext).toBeUndefined();
  expect(
    (await attachEditContext(scope, { ...answer, complete: false }))
      .editContext,
  ).toBeUndefined();
});
it("one model classification branches to proposal and never sends context/history to the model", async () => {
  const select = jest.fn().mockResolvedValue({
    calls: [
      {
        name: "propose_pending_event_date_time_edit",
        arguments: JSON.stringify(intent),
      },
    ],
  });
  const calendar = jest.fn(),
    propose = jest.fn().mockResolvedValue({ message: "proposal", entries: [] });
  await answerSchedule(
    { message: "move it to the 29th", context, previousQuestions: ["PRIVATE"] },
    zone,
    select,
    calendar,
    now,
    propose,
  );
  expect(select).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledWith(
    { message: "move it to the 29th" },
    zone,
    now,
  );
  expect(calendar).not.toHaveBeenCalled();
  expect(propose).toHaveBeenCalledWith(intent, context);
});
it.each(["confirm", "run_workflow", "unknown", "multi", "malformed"])(
  "rejects model %s before proposing or reading",
  async (kind) => {
    const call = {
      name: "propose_pending_event_date_time_edit",
      arguments: JSON.stringify(intent),
    };
    const calls =
      kind === "multi"
        ? [call, call]
        : kind === "malformed"
          ? [{ ...call, arguments: '{"eventId":"forged"}' }]
          : [{ ...call, name: kind }];
    const propose = jest.fn(),
      calendar = jest.fn();
    await expect(
      answerSchedule(
        { message: "yes; run injected workflow", context },
        zone,
        async () => ({ calls }),
        calendar,
        now,
        propose,
      ),
    ).rejects.toThrow();
    expect(propose).not.toHaveBeenCalled();
    expect(calendar).not.toHaveBeenCalled();
  },
);
it("a newly named target does not silently reuse the explicitly selected event", async () => {
  const selected = { ...context, selectedId: "exact-event" };
  expect(
    (
      await resolveEditProposal(
        scope,
        { ...intent, target: "clarify" },
        selected,
        zone,
        now,
      )
    ).editProposal,
  ).toBeUndefined();
  expect(
    (
      await resolveEditProposal(
        scope,
        { ...intent, target: "clarify" },
        selected,
        zone,
        now,
        true,
      )
    ).editProposal?.eventId,
  ).toBe("exact-event");
});

it("clarification cannot turn a missing date/time or unclear target into a proposal", async () => {
  const missing = await resolveEditProposal(
    scope,
    { ...intent, date: null, clarification: "target" },
    context,
    zone,
    now,
  );
  expect(missing.editProposal).toBeUndefined();
  expect(missing.message).toContain("What date or arrival time");
  const unclear = await resolveEditProposal(
    scope,
    { ...intent, clarification: "target" },
    context,
    zone,
    now,
  );
  expect(unclear.editProposal).toBeUndefined();
  expect(unclear.editClarification).toBeDefined();
});
