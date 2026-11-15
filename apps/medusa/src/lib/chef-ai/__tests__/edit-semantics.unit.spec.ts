import { answerSchedule } from "../chat";
import { resolveEditProposal } from "../edit-proposal";
import { editIntentTool, type EditIntent } from "../edit-intent";
const zone = "America/Chicago",
  now = new Date("2026-11-15T12:00:00Z");
const day = (day: number) => ({ kind: "day_of_month" as const, day });
const base: EditIntent = {
  target: "context",
  targetDate: null,
  date: day(29),
  time: null,
  clarification: "none",
  continuation: false,
};
const select = (intent: EditIntent) =>
  jest
    .fn()
    .mockResolvedValue({
      calls: [
        {
          name: "propose_pending_event_date_time_edit",
          arguments: JSON.stringify(intent),
        },
      ],
    });
it.each([
  { ...base, date: null, targetDate: day(29) },
  { ...base, targetDate: day(29) },
  { ...base, target: "clarify" as const, targetDate: day(29) },
])(
  "contradictory validated intent %j is clarified before any resolver/read",
  async (intent) => {
    const propose = jest.fn(),
      read = jest.fn();
    const result = await answerSchedule(
      { message: "Can you move it to the 29th?" },
      zone,
      select(intent),
      read,
      now,
      propose,
    );
    expect(result).toMatchObject({
      presentation: "clarification",
      entries: [],
    });
    expect(result.message).toContain("29th");
    expect(result.message).toContain("TO");
    expect(result.message).toContain("ON");
    expect(result.editProposal).toBeUndefined();
    expect(result.editTask).toBeUndefined();
    expect(result.editClarification).toBeUndefined();
    expect(propose).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  },
);
it("post-merge contradiction from an untrusted unfinished task is also clarified", async () => {
  const propose = jest.fn();
  const result = await answerSchedule(
    {
      message: "at 2 PM",
      task: {
        version: 1,
        intent: { ...base, date: null, targetDate: day(29) },
        expiresAt: now.getTime() + 60000,
      },
    },
    zone,
    select({ ...base, date: null, time: "14:00", continuation: true }),
    jest.fn(),
    now,
    propose,
  );
  expect(result.message).toContain("TO");
  expect(propose).not.toHaveBeenCalled();
});
it("direct exact selection cannot bypass semantic validation", async () => {
  const scope = { resolve: jest.fn() };
  const result = await resolveEditProposal(
    scope as any,
    { ...base, targetDate: day(29) },
    undefined,
    zone,
    now,
    true,
  );
  expect(result.message).toContain("TO");
  expect(scope.resolve).not.toHaveBeenCalled();
});
it.each([
  base,
  { ...base, date: { kind: "relative_day" as const, offset: 1 } },
  {
    ...base,
    target: "date" as const,
    targetDate: day(29),
    date: null,
    time: "14:00",
  },
  { ...base, target: "date" as const, targetDate: day(30) },
])("consistent ON/TO %j reaches the resolver unchanged", async (intent) => {
  const propose = jest
    .fn()
    .mockResolvedValue({ entries: [], message: "resolved" });
  await answerSchedule(
    { message: "fixed fixture phrase" },
    zone,
    select(intent),
    jest.fn(),
    now,
    propose,
  );
  expect(propose).toHaveBeenCalledWith(intent, undefined);
});
it.each(["fresh", "stale", "absent"])(
  "legitimate target-only continuation with %s task keeps existing lifetime rules",
  async (freshness) => {
    const propose = jest
      .fn()
      .mockResolvedValue({ entries: [], message: "resolved" });
    const task = {
      version: 1 as const,
      intent: { ...base, date: null, time: "14:00" },
      expiresAt: now.getTime() + (freshness === "stale" ? -1 : 60000),
    };
    const result = await answerSchedule(
      {
        message: "this is for the event on the 30th",
        ...(freshness === "absent" ? {} : { task }),
      },
      zone,
      select({
        ...base,
        target: "date",
        targetDate: day(30),
        date: null,
        continuation: true,
      }),
      jest.fn(),
      now,
      propose,
    );
    if (freshness === "fresh")
      expect(propose.mock.calls[0][0]).toMatchObject({
        target: "date",
        targetDate: day(30),
        date: null,
        time: "14:00",
      });
    else {
      expect(propose).not.toHaveBeenCalled();
      expect(result.message).toContain("No unfinished change");
    }
  },
);
it("the fixed tool describes existing ON and new TO roles separately", () => {
  const tool = editIntentTool();
  const p = tool.function.parameters.properties as any;
  expect(p.targetDate.description).toContain("EXISTING ON");
  expect(p.date.description).toContain("NEW TO");
  expect(p.target.description).toContain("targetDate must be null");
  expect(tool.function.strict).toBe(true);
  expect(tool.function.parameters.additionalProperties).toBe(false);
});
