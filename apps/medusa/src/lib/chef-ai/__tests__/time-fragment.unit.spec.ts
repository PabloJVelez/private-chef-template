import { answerSchedule } from "../chat";
import type { EditIntent, EditTask } from "../edit-intent";
const now = new Date("2026-11-15T12:00:00Z"),
  zone = "America/Chicago";
const fragment: EditIntent = {
  target: "context",
  targetDate: null,
  date: null,
  time: "17:00",
  clarification: "none",
  continuation: true,
};
const task: EditTask = {
  version: 1,
  expiresAt: now.getTime() + 60000,
  intent: {
    ...fragment,
    date: { kind: "day_of_month", day: 29 },
    time: "14:00",
    continuation: false,
  },
  context: {
    candidates: [{ id: "A", revision: "a".repeat(32) }],
    selectedId: "A",
    observedAt: now.getTime(),
  },
};
const selection = (intent: EditIntent) =>
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

it.each(["absent", "expired", "future"])(
  "fragment with %s task cannot use page or history to reach resolver",
  async (freshness) => {
    for (const intent of [
      fragment,
      { ...fragment, time: null, clarification: "time" as const },
    ]) {
      const propose = jest.fn(),
        read = jest.fn(),
        select = selection(intent);
      const result = await answerSchedule(
        {
          message: intent.time ? "At 5 PM." : "at 7",
          previousQuestions: ["PRIVATE_HISTORY"],
          page: {
            version: 1,
            surface: "chef-events",
            view: "detail",
            resource: { kind: "private-event", id: "B" },
          },
          context: task.context,
          ...(freshness === "absent"
            ? {}
            : {
                task: {
                  ...task,
                  expiresAt:
                    now.getTime() + (freshness === "expired" ? -1 : 300001),
                },
              }),
        },
        zone,
        select,
        read,
        now,
        propose,
      );
      expect(result.message).toContain("No unfinished change");
      expect(result.editProposal).toBeUndefined();
      expect(propose).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(select.mock.calls[0][0]).toEqual({
        message: intent.time ? "At 5 PM." : "at 7",
      });
    }
  },
);
it.each([false, true])(
  "fresh fragment preserves date and clears only ambiguous time: %s",
  async (ambiguous) => {
    const propose = jest
        .fn()
        .mockResolvedValue({ entries: [], message: "fixture" }),
      read = jest.fn();
    await answerSchedule(
      { message: ambiguous ? "at 7" : "At 5 PM.", task },
      zone,
      selection(
        ambiguous
          ? { ...fragment, time: null, clarification: "time" }
          : fragment,
      ),
      read,
      now,
      propose,
    );
    expect(propose).toHaveBeenCalledWith(
      {
        ...task.intent,
        time: ambiguous ? null : "17:00",
        clarification: ambiguous ? "time" : "none",
      },
      task.context,
    );
    expect(read).not.toHaveBeenCalled();
  },
);
it("complete time request remains independent of an unfinished date", async () => {
  const propose = jest
    .fn()
    .mockResolvedValue({ entries: [], message: "fixture" });
  const intent = { ...fragment, continuation: false };
  await answerSchedule(
    { message: "Change its arrival time to 5 PM.", task },
    zone,
    selection(intent),
    jest.fn(),
    now,
    propose,
  );
  expect(propose).toHaveBeenCalledWith(intent, undefined);
});
it.each([
  "At 5 PM.",
  "yes",
  "confirm",
  "Send an email at 5 PM.",
  "Accept the booking at 5 PM.",
  "Cancel the booking at 5 PM.",
])("no-tool replay for %s is safe even with a fresh task", async (message) => {
  const propose = jest.fn(),
    read = jest.fn();
  const result = await answerSchedule(
    { message, task },
    zone,
    async () => ({ calls: [] }),
    read,
    now,
    propose,
  );
  expect(result.editProposal).toBeUndefined();
  expect(propose).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
