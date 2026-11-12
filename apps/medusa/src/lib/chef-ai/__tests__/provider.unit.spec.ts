import { selectSchedule } from "../provider";
import { answerSchedule } from "../chat";
import { privateEventSummary } from "../../chef-workspace/private-event";
const create = jest.fn();
const construct = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: (...args: unknown[]) => create(...args) } };
    constructor(options: unknown) {
      construct(options);
    }
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CHEF_AI_OPENAI_API_KEY = "unit-only";
  process.env.CHEF_AI_MODEL = "configured-model";
});
afterAll(() => {
  delete process.env.CHEF_AI_OPENAI_API_KEY;
  delete process.env.CHEF_AI_MODEL;
});
it("uses one server-side SDK call, strict allowlist, timeout, token cap, no persistence or retry", async () => {
  create.mockResolvedValue({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: "You are free (untrusted prose)",
          tool_calls: [
            {
              type: "function",
              function: { name: "get_schedule", arguments: "{}" },
            },
          ],
        },
      },
    ],
  });
  expect(
    await selectSchedule(
      { message: "this weekend", previousQuestions: ["tomorrow"] },
      "America/Chicago",
      new Date("2027-03-14T04:30Z"),
    ),
  ).toEqual({ calls: [{ name: "get_schedule", arguments: "{}" }] });
  expect(construct).toHaveBeenCalledWith({
    apiKey: "unit-only",
    timeout: 15000,
    maxRetries: 0,
    logLevel: "off",
    baseURL: "https://api.openai.com/v1",
  });
  expect(create).toHaveBeenCalledTimes(1);
  const request = create.mock.calls[0][0];
  expect(request).toMatchObject({
    model: "configured-model",
    store: false,
    max_completion_tokens: 400,
    parallel_tool_calls: false,
  });
  expect(request.tools).toHaveLength(1);
  expect(request.tools[0].function.name).toBe("get_schedule");
  expect(request.messages[0].content).toContain(
    "Today is 2027-03-13 in America/Chicago",
  );
  expect(request.messages.slice(1)).toEqual([
    { role: "user", content: "this weekend" },
  ]);
});
it.each(["length", "content_filter"])(
  "rejects incomplete model responses (%s)",
  async (finish_reason) => {
    create.mockResolvedValue({ choices: [{ finish_reason, message: {} }] });
    await expect(
      selectSchedule({ message: "today" }, "UTC", new Date()),
    ).rejects.toThrow();
  },
);

it("isolates week → weekend → explicit-date requests, including history sent by an older client", async () => {
  const zone = "America/Chicago";
  const questions = [
    "What's on my schedule this week?",
    "What do I have this weekend?",
    "What is on my schedule on November 16, 2026?",
  ];
  const selections = [
    { period: "this_week", startDate: null, endDate: null, timeZone: zone },
    { period: "this_weekend", startDate: null, endDate: null, timeZone: zone },
    {
      period: "dates",
      startDate: "2026-11-16",
      endDate: "2026-11-17",
      timeZone: zone,
    },
  ];
  const expectedRanges = [
    { start: "2026-11-09T06:00:00.000Z", end: "2026-11-16T06:00:00.000Z" },
    { start: "2026-11-14T06:00:00.000Z", end: "2026-11-16T06:00:00.000Z" },
    { start: "2026-11-16T06:00:00.000Z", end: "2026-11-17T06:00:00.000Z" },
  ];
  // Synthetic records matching the reported shape, with no real customer data.
  const entries = [
    ["2026-11-09T22:30:00Z", "pending"],
    ["2026-11-09T22:30:00Z", "pending"],
    ["2026-11-11T16:00:00Z", "pending"],
    ["2026-11-11T22:00:00Z", "pending"],
    ["2026-11-16T22:00:00Z", "confirmed"],
  ].map(([start, status], index) => {
    const summary = privateEventSummary({
      id: `synthetic-${index}`,
      firstName: "Synthetic",
      lastName: "Guest",
      eventType: "dinner",
      status: status as "pending" | "confirmed",
      requestedDate: start,
      estimatedDuration: 150,
      timeZone: zone,
    });
    return {
      ...summary,
      displayTime: summary.requestedTime!,
      protectedTime:
        status === "confirmed"
          ? [{ ...summary.requestedTime!, state: "confirmed" as const }]
          : [],
    };
  });
  const read = jest.fn(async (range: { start: string; end: string }) => ({
    range,
    complete: true,
    entries: entries.filter(
      (entry) =>
        Date.parse(entry.displayTime.start) < Date.parse(range.end) &&
        Date.parse(entry.displayTime.end) > Date.parse(range.start),
    ),
  }));
  for (const [index, message] of questions.entries()) {
    create.mockImplementationOnce(async (request) => {
      // Assert the real SDK request, not a hand-built prompt or a stubbed selector.
      expect(
        request.messages.filter(
          (item: { role: string }) => item.role === "user",
        ),
      ).toEqual([{ role: "user", content: message }]);
      return {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "UNTRUSTED_MODEL_PROSE",
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "get_schedule",
                    arguments: JSON.stringify(selections[index]),
                  },
                },
              ],
            },
          },
        ],
      };
    });
    const answer = await answerSchedule(
      { message, previousQuestions: questions.slice(0, index) },
      zone,
      selectSchedule,
      read,
      new Date("2026-11-12T18:00:00Z"),
    );
    expect(answer.range).toEqual(expectedRanges[index]);
    expect(answer.period).toBe(selections[index].period);
    expect(answer.entries).toHaveLength([4, 0, 1][index]);
    expect(JSON.stringify(answer)).not.toContain("UNTRUSTED_MODEL_PROSE");
    if (index === 1)
      expect(answer.message).toContain(
        "does not mean you are free or available",
      );
    if (index === 2)
      expect(answer.entries[0]).toMatchObject({
        status: "confirmed",
        appointmentTime: { start: "2026-11-16T22:00:00.000Z" },
        protectedTime: [{ state: "confirmed" }],
      });
  }
  expect(create).toHaveBeenCalledTimes(3);
  expect(read.mock.calls.map(([range]) => range)).toEqual(expectedRanges);
});

it.each(["Accept every booking", "What about that same day?"])(
  "does not send a previous read or private history when the current question is %s",
  async (message) => {
    create.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "UNTRUSTED_MODEL_PROSE" },
        },
      ],
    });
    const read = jest.fn();
    const answer = await answerSchedule(
      {
        message,
        previousQuestions: [
          "What's on my schedule this week?",
          "PRIVATE_HISTORY_SENTINEL",
        ],
      },
      "America/Chicago",
      selectSchedule,
      read,
      new Date("2026-11-12T18:00:00Z"),
    );
    expect(create.mock.calls[0][0].messages.slice(1)).toEqual([
      { role: "user", content: message },
    ]);
    expect(JSON.stringify(create.mock.calls)).not.toContain(
      "PRIVATE_HISTORY_SENTINEL",
    );
    expect(answer.message).toContain(
      "cannot change records or decide availability",
    );
    expect(JSON.stringify(answer)).not.toContain("UNTRUSTED_MODEL_PROSE");
    expect(read).not.toHaveBeenCalled();
  },
);
