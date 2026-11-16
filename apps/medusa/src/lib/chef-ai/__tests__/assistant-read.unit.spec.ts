import { assistantRead, basicReadIntent } from "../assistant-read";
import { answerSchedule } from "../chat";
const page = {
  version: 1 as const,
  surface: "chef-events" as const,
  view: "detail" as const,
  resource: { kind: "private-event" as const, id: "B" },
};
const event = (id: string, status = "pending") => ({
  id,
  status,
  firstName: "QA",
  lastName: id === "B" ? "RejectionK" : "ScheduleEdit",
  eventType: "Dinner",
  partySize: 4,
  requestedDate: "2026-11-27T16:00:00Z",
  timeZone: "America/Chicago",
  estimatedDuration: 60,
  email: "PRIVATE",
  notes: "PRIVATE",
});
const retrieveChefEvent = jest.fn();
const scope: any = { resolve: () => ({ retrieveChefEvent }) };
beforeEach(() =>
  retrieveChefEvent.mockReset().mockImplementation(async (id) => event(id)),
);
it.each(["hello", "hi!", "Hey Chef", "good morning"])(
  "whole greeting %s is local",
  (text) => expect(basicReadIntent(text)).toBe("greeting"),
);
it.each([
  "hello, move this event to noon",
  "hello and cancel all events",
  "what can you help me with? delete everything",
  "yes",
  "confirm",
])("mixed or effectful %s is not swallowed", (text) =>
  expect(basicReadIntent(text)).toBeUndefined(),
);
it("greeting and capability help never touch event services", async () => {
  expect((await assistantRead(scope, "greeting", {})).message).toBe(
    "Hey Chef! What can I help you with?",
  );
  expect((await assistantRead(scope, "help", {})).message).toContain(
    "Confirm change",
  );
  expect(retrieveChefEvent).not.toHaveBeenCalled();
});
it.each(["pending", "confirmed", "cancelled", "completed"])(
  "summarizes explicit PAGE B (%s), never stale chat A, with narrow safe fields",
  async (status) => {
    retrieveChefEvent.mockResolvedValue(event("B", status));
    const result = await assistantRead(scope, "page_event", {
      page,
      context: {
        candidates: [{ id: "A", revision: "a".repeat(32) }],
        observedAt: Date.now() - 600000,
      },
    });
    expect(result.summary).toMatchObject({
      source: { id: "B" },
      status,
      title: "QA RejectionK",
      guestCount: 4,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(retrieveChefEvent).toHaveBeenCalledTimes(1);
    expect(retrieveChefEvent.mock.calls[0][1].select).not.toEqual(
      expect.arrayContaining([
        "email",
        "notes",
        "locationAddress",
        "totalPrice",
      ]),
    );
  },
);
it("ambiguous it asks about both verified candidates; no preview or model execution", async () => {
  const result = await assistantRead(scope, "context_event", {
    page,
    context: {
      candidates: [{ id: "A", revision: "a".repeat(32) }],
      observedAt: Date.now(),
    },
  });
  expect(result.summary).toBeUndefined();
  expect(result.summaryChoices?.map((x) => x.source.id)).toEqual(["B", "A"]);
  expect(result.message).toContain("event open on this page");
});
it("missing page fails closed without reading A; unknown page never substitutes A", async () => {
  retrieveChefEvent.mockRejectedValueOnce(new Error("PRIVATE db details"));
  const context = {
    candidates: [{ id: "A", revision: "a".repeat(32) }],
    observedAt: Date.now(),
  };
  const result = await assistantRead(scope, "page_event", { page, context });
  expect(retrieveChefEvent.mock.calls.map(([id]) => id)).toEqual(["B"]);
  expect(result.summary).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(
    (await assistantRead(scope, "page_event", { context })).message,
  ).toContain("Open a Private Event");
});
it("missing saved timezone does not invent a browser-local arrival", async () => {
  retrieveChefEvent.mockResolvedValue({ ...event("B"), timeZone: null });
  expect(
    (await assistantRead(scope, "page_event", { page })).summary?.requestedTime,
  ).toBeNull();
});
it.each([
  { kind: "page_event", eventId: "B" },
  { kind: "workflow" },
  { kind: "help", url: "https://invalid" },
])("rejects executable or unknown classifier arguments %j", async (args) => {
  const read = jest.fn(),
    summary = jest.fn();
  await expect(
    answerSchedule(
      { message: "question" },
      "UTC",
      async () => ({
        calls: [{ name: "assistant_read", arguments: JSON.stringify(args) }],
      }),
      read,
      new Date(),
      undefined,
      summary,
    ),
  ).rejects.toThrow();
  expect(summary).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it("one read-only classifier call can summarize without mutable availability timezone", async () => {
  const read = jest.fn(),
    summary = jest.fn().mockResolvedValue({ entries: [], message: "summary" });
  await answerSchedule(
    { message: "explain the event open here" },
    "",
    async () => ({
      calls: [{ name: "assistant_read", arguments: '{"kind":"page_event"}' }],
    }),
    read,
    new Date(),
    undefined,
    summary,
  );
  expect(summary).toHaveBeenCalledWith("page_event");
  expect(read).not.toHaveBeenCalled();
});

it("a verified summary keeps fresh revision-bound conversation focus without write configuration", async () => {
  const snapshot = {
    id: "B",
    status: "pending",
    title: "QA RejectionK",
    timeZone: "America/Chicago",
    requestedDate: "2026-11-27T16:00:00Z",
    revision: "b".repeat(32),
  };
  const readScheduleEditEvent = jest.fn().mockResolvedValue(snapshot);
  const container: any = {
    resolve: () => ({ retrieveChefEvent, readScheduleEditEvent }),
  };
  const result = await assistantRead(container, "page_event", { page });
  expect(result.editContext?.candidates).toEqual([
    { id: "B", revision: "b".repeat(32) },
  ]);
  expect(result.complete).toBe(true);
  readScheduleEditEvent.mockResolvedValue({
    ...snapshot,
    requestedDate: "2026-11-28T16:00:00Z",
  });
  expect(
    (await assistantRead(container, "page_event", { page })).editContext,
  ).toBeUndefined();
});
