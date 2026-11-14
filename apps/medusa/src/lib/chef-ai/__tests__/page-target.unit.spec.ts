import { resolveEditProposal } from "../edit-proposal";
const now = new Date("2026-11-14T03:00:00Z");
const zone = "America/Chicago";
const a = {
  id: "event-A",
  title: "QA ScheduleEdit",
  status: "pending",
  revision: "a".repeat(32),
  requestedDate: "2026-11-30T20:00:00Z",
  requestedTime: "14:00",
  timeZone: zone,
  eligible: true,
};
const b = {
  ...a,
  id: "event-B",
  title: "QA RejectionK",
  revision: "b".repeat(32),
  requestedDate: "2026-11-27T16:00:00Z",
  requestedTime: "10:00",
};
const intent = {
  target: "context",
  date: { kind: "day_of_month", day: 26 },
  time: null,
  clarification: "none",
};
const context = {
  candidates: [{ id: a.id, revision: a.revision }],
  observedAt: now.getTime(),
};
const page = {
  version: 1,
  surface: "chef-events",
  view: "detail",
  resource: { kind: "private-event", id: b.id },
};
it("RED/GREEN: page B plus a fresh single answer A must clarify before any proposal", async () => {
  const read = jest.fn(async (id) => (id === b.id ? b : a));
  const answer = await (resolveEditProposal as any)(
    { resolve: () => ({ readScheduleEditEvent: read }) },
    intent,
    context,
    zone,
    now,
    false,
    undefined,
    page,
  );
  expect(answer.editProposal).toBeUndefined();
  expect(answer.message).toBe(
    "The event open on this page, or the event we just discussed?",
  );
  expect(
    answer.editClarification.context.candidates.map((c: any) => c.id),
  ).toEqual([b.id, a.id]);
  expect(read).toHaveBeenCalledWith(b.id);
  expect(read).toHaveBeenCalledWith(a.id);
});
const solve = (
  read: jest.Mock,
  hint: any = page,
  ctx: any = context,
  explicit = false,
  edit: any = intent,
  lookup?: any,
) =>
  (resolveEditProposal as any)(
    { resolve: () => ({ readScheduleEditEvent: read }) },
    edit,
    ctx,
    zone,
    now,
    explicit,
    lookup,
    hint,
  );
it.each([
  undefined,
  { ...context, candidates: [{ id: b.id, revision: b.revision }] },
])("page B alone or discussed B resolves B", async (ctx) => {
  const read = jest.fn(async (id) => (id === b.id ? b : a));
  const result = await solve(read, page, ctx ?? null);
  expect(result.editProposal).toMatchObject({
    eventId: b.id,
    date: "2026-11-26",
  });
});
it.each(["confirmed", "cancelled", "completed"])(
  "page %s refuses without substituting another pending record",
  async (status) => {
    const read = jest.fn(async () => ({ ...b, status }));
    const result = await solve(read, page, null);
    expect(result.editProposal).toBeUndefined();
    expect(result.message).toContain("Only pending");
  },
);
it.each(["missing", "inaccessible", "deleted"])(
  "%s page cannot fall back to discussed A",
  async () => {
    const read = jest.fn(async (id) => {
      if (id === b.id) throw new Error();
      return a;
    });
    const result = await solve(read);
    expect(result.editProposal).toBeUndefined();
    expect(result.editClarification).toBeUndefined();
    expect(result.message).not.toContain(a.title);
  },
);
it("a past selectedId cannot silently override page conflict; explicit choices can choose either exact ID", async () => {
  const read = jest.fn(async (id) => (id === b.id ? b : a));
  const result = await solve(read, page, { ...context, selectedId: a.id });
  expect(result.editProposal).toBeUndefined();
  for (const id of [a.id, b.id]) {
    const selected = await solve(
      read,
      page,
      { ...result.editClarification.context, selectedId: id },
      true,
    );
    expect(selected.editProposal?.eventId).toBe(id);
  }
});
it("same names/times remain distinct; changed chat revision does not leak stale choice", async () => {
  const read = jest.fn(async (id) =>
    id === b.id
      ? {
          ...b,
          title: a.title,
          requestedDate: a.requestedDate,
          requestedTime: a.requestedTime,
        }
      : a,
  );
  const result = await solve(read);
  expect(result.editClarification.targets.map((t: any) => t.id)).toEqual([
    b.id,
    a.id,
  ]);
  expect(
    (
      await solve(read, page, {
        ...context,
        candidates: [{ id: a.id, revision: "c".repeat(32) }],
      })
    ).editProposal,
  ).toBeUndefined();
});
it("menu and unknown pages retain chat rules without event-domain lookup for menu ID", async () => {
  const read = jest.fn(async () => a);
  for (const hint of [
    { version: 1, surface: "generic", view: "unknown" },
    {
      version: 1,
      surface: "menus",
      view: "detail",
      resource: { kind: "menu", id: "menu-1" },
    },
  ])
    expect((await solve(read, hint)).editProposal?.eventId).toBe(a.id);
  expect(read).not.toHaveBeenCalledWith("menu-1");
});
it("incompatible/forged hint shapes fail closed before reads", async () => {
  const read = jest.fn();
  for (const hint of [
    { ...page, resource: { kind: "menu", id: b.id } },
    { ...page, resource: { kind: "private-event", id: "../secret" } },
    { ...page, url: "https://bad" },
  ])
    await expect(solve(read, hint)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("explicit target date uses the existing lookup even on inaccessible page B", async () => {
  const read = jest.fn(async () => a);
  const lookup = jest.fn(async (range) => ({
    complete: true,
    range,
    entries: [
      {
        source: { type: "private-event", id: a.id },
        requestedTime: { start: new Date(a.requestedDate).toISOString() },
        timeZone: zone,
        status: "pending",
        protectedTime: [],
      },
    ],
  }));
  const result = await solve(
    read,
    page,
    undefined,
    false,
    {
      ...intent,
      target: "date",
      targetDate: { kind: "iso", value: "2026-11-30" },
    },
    lookup,
  );
  expect(result.editProposal?.eventId).toBe(a.id);
  expect(read).not.toHaveBeenCalledWith(b.id);
  expect(lookup).toHaveBeenCalledTimes(1);
});
