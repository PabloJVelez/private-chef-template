import { answerSchedule, chatInput } from "../chat";
import { resolveEditProposal } from "../edit-proposal";
import type { EditIntent, EditTask } from "../edit-intent";
import type { CalendarEntry } from "../../chef-workspace/contracts";
const now = new Date("2026-11-13T18:00:00Z");
const zone = "America/Chicago";
const revision = "a".repeat(32);
const base: EditIntent = {
  target: "context",
  targetDate: null,
  date: null,
  time: "14:00",
  clarification: "none",
  continuation: false,
};
const target: EditIntent = {
  ...base,
  target: "date",
  targetDate: { kind: "day_of_month", day: 30 },
};
const entry = (id = "exact", status = "pending"): CalendarEntry => ({
  id: "presentation:" + id,
  source: { type: "private-event", id },
  detailPath: "/chef-events/" + id,
  title: "QA ScheduleEdit",
  category: "dinner",
  status: status as CalendarEntry["status"],
  timeZone: zone,
  requestedTime: {
    start: "2026-11-30T17:00:00.000Z",
    end: "2026-11-30T19:00:00.000Z",
  },
  displayTime: {
    start: "2026-11-30T18:00:00.000Z",
    end: "2026-11-30T20:00:00.000Z",
  },
  appointmentTime: null,
  protectedTime: [],
});
let rows: CalendarEntry[], snapshot: jest.Mock, lookup: jest.Mock, scope: any;
beforeEach(() => {
  rows = [entry()];
  snapshot = jest.fn(async (id) => ({
    id,
    status: rows.find((e) => e.source.id === id)?.status,
    revision,
    requestedDate: "2026-11-30T17:00:00.000Z",
    requestedTime: "11:00",
    timeZone: zone,
  }));
  scope = { resolve: () => ({ readScheduleEditEvent: snapshot }) };
  lookup = jest.fn(async (range) => ({ range, complete: true, entries: rows }));
});
const resolve = (intent: EditIntent, context?: any) =>
  resolveEditProposal(scope, intent, context, zone, now, false, lookup);
const call = (intent: EditIntent) =>
  jest.fn(async () => ({
    calls: [
      {
        name: "propose_pending_event_date_time_edit",
        arguments: JSON.stringify(intent),
      },
    ],
  }));
it("retains 2 PM through the exact owner clarification, and independently handles the standalone request", async () => {
  const first = await answerSchedule(
    { message: "can you update the time to 2pm?" },
    zone,
    call(base),
    jest.fn(),
    now,
    resolve,
  );
  expect(first.message).toBe("Which event should I move to 2 PM?");
  expect(first.editTask?.intent.time).toBe("14:00");
  expect(lookup).not.toHaveBeenCalled();
  const classify = call({ ...target, time: null, continuation: true });
  const second = await answerSchedule(
    { message: "this is for the event on the 30th", task: first.editTask },
    zone,
    classify,
    jest.fn(),
    now,
    resolve,
  );
  expect(second.editProposal).toEqual({
    eventId: "exact",
    expectedRevision: revision,
    time: "14:00",
  });
  expect(classify).toHaveBeenCalledWith(
    { message: "this is for the event on the 30th" },
    zone,
    now,
  );
  expect(lookup).toHaveBeenCalledWith({
    start: "2026-11-30T06:00:00.000Z",
    end: "2026-12-01T06:00:00.000Z",
  });
  const third = await answerSchedule(
    { message: "Can you update the event I have on the 30th to 2pm?" },
    zone,
    call(target),
    jest.fn(),
    now,
    resolve,
  );
  expect(third.editProposal).toEqual(second.editProposal);
  expect(snapshot).toHaveBeenCalledTimes(4); // Context snapshot plus fresh selected-event validation each time.
});
it.each([
  { kind: "day_of_month", day: 29 },
  { kind: "iso", value: "2026-12-01" },
])("separates event ON Nov30 from proposed date %j", async (date) => {
  const answer = await resolve({
    ...target,
    date: date as EditIntent["date"],
    time: null,
  });
  expect(answer.editProposal).toEqual({
    eventId: "exact",
    expectedRevision: revision,
    date: date.kind === "iso" ? "2026-12-01" : "2026-11-29",
  });
});
it.each(["pending", "confirmed"])(
  "counts a second %s record before eligibility and retains time for exact-ID selection",
  async (status) => {
    rows = [entry(), entry("other", status)];
    const answer = await resolve(target);
    expect(answer.editProposal).toBeUndefined();
    expect(
      answer.editClarification?.context.candidates.map((c) => c.id),
    ).toEqual(["exact", "other"]);
    expect(answer.editTask?.intent.time).toBe("14:00");
    const chosen = await resolveEditProposal(
      scope,
      answer.editClarification!.intent,
      { ...answer.editClarification!.context, selectedId: "exact" },
      zone,
      now,
      true,
      lookup,
    );
    expect(chosen.editProposal?.eventId).toBe("exact");
    expect(lookup).toHaveBeenCalledTimes(1);
  },
);
it.each(["confirmed", "cancelled", "completed"])(
  "sole %s is ineligible, not a guessed pending event",
  async (status) => {
    rows = [entry("exact", status)];
    expect((await resolve(target)).message).toContain("Only pending");
  },
);
it("zero matches is concise and retains the typed request; no estimated displayTime matching", async () => {
  rows = [];
  const answer = await resolve(target);
  expect(answer.message).toBe(
    "No event on Nov 30, 2026. Which date did you mean?",
  );
  expect(answer.editTask?.intent.time).toBe("14:00");
});
it("does not roll an impossible target day into another month or guess an omitted month from history", async () => {
  const answer = await resolve({
    ...target,
    targetDate: { kind: "day_of_month", day: 31 },
  });
  expect(answer.editProposal).toBeUndefined();
  expect(lookup).not.toHaveBeenCalled();
  expect(answer.message).toContain("month, day and year");
});
it("relative target tomorrow uses business-local today and DST single-day bounds", async () => {
  rows = [];
  await resolveEditProposal(
    scope,
    { ...target, targetDate: { kind: "relative_day", offset: 1 } },
    undefined,
    zone,
    new Date("2027-03-13T18:00:00Z"),
    false,
    lookup,
  );
  expect(lookup).toHaveBeenCalledWith({
    start: "2027-03-14T06:00:00.000Z",
    end: "2027-03-15T05:00:00.000Z",
  });
});
it("does not use partial/oversized lookup or changed snapshot", async () => {
  lookup.mockImplementationOnce(async (range) => ({
    range,
    complete: false,
    entries: rows,
  }));
  expect((await resolve(target)).editProposal).toBeUndefined();
  lookup.mockImplementationOnce(async (range) => ({
    range,
    complete: true,
    entries: Array(21).fill(entry()),
  }));
  expect((await resolve(target)).editProposal).toBeUndefined();
  snapshot
    .mockResolvedValueOnce({ ...(await snapshot("exact")), revision })
    .mockResolvedValueOnce({
      ...(await snapshot("exact")),
      revision: "b".repeat(32),
    });
  expect((await resolve(target)).message).toContain("changed");
});
it("only a fresh typed continuation can inherit proposed fields; schedule reads see latest question alone", async () => {
  const task: EditTask = {
    version: 1,
    intent: base,
    expiresAt: now.getTime() + 1000,
  };
  for (const value of [
    undefined,
    { ...task, expiresAt: now.getTime() - 1 },
    { ...task, expiresAt: now.getTime() + 300001 },
  ]) {
    const result = await answerSchedule(
      { message: "this is for the event on the 30th", task: value },
      zone,
      call({ ...target, time: null, continuation: true }),
      jest.fn(),
      now,
      resolve,
    );
    expect(result.editProposal).toBeUndefined();
  }
  const independent = await answerSchedule(
    { message: "Move it to December 1 2026", task },
    zone,
    call({ ...target, time: null, date: { kind: "iso", value: "2026-12-01" } }),
    jest.fn(),
    now,
    resolve,
  );
  expect(independent.editProposal?.time).toBeUndefined();
  const read = jest.fn(async (range) => ({
    range,
    entries: [],
    complete: true,
  }));
  const select = jest.fn(async () => ({
    calls: [
      {
        name: "get_schedule",
        arguments: JSON.stringify({ period: "tomorrow", timeZone: zone }),
      },
    ],
  }));
  const answer = await answerSchedule(
    { message: "What is on tomorrow?", task, previousQuestions: ["PRIVATE"] },
    zone,
    select,
    read,
    now,
    resolve,
  );
  expect(answer.editTask).toBeUndefined();
  expect(answer.editProposal).toBeUndefined();
  expect(select).toHaveBeenCalledWith(
    { message: "What is on tomorrow?" },
    zone,
    now,
  );
  expect(
    chatInput.safeParse({
      message: "move",
      task: { ...task, reference: "injected" },
    }).success,
  ).toBe(false);
});
it("bare target day uses re-fetched context month and asks for month when candidates cross months", async () => {
  const context = {
    candidates: [
      { id: "exact", revision },
      { id: "other", revision },
    ],
    observedAt: now.getTime(),
  };
  snapshot.mockImplementation(async (id) => ({
    id,
    status: "pending",
    revision,
    requestedDate:
      id === "other" ? "2026-12-30T17:00:00Z" : "2026-11-30T17:00:00Z",
    requestedTime: "11:00",
    timeZone: zone,
  }));
  const ambiguous = await resolve(target, context);
  expect(ambiguous.message).toContain("Which month and year");
  expect(lookup).not.toHaveBeenCalled();
  rows = [];
  await resolve(target, { ...context, selectedId: "other" });
  expect(lookup).toHaveBeenCalledWith({
    start: "2026-12-30T06:00:00.000Z",
    end: "2026-12-31T06:00:00.000Z",
  });
});
it("single date lookup resolves target ambiguity even when the model cannot know the day has one event", async () => {
  expect(
    (await resolve({ ...target, clarification: "target" })).editProposal?.time,
  ).toBe("14:00");
});
