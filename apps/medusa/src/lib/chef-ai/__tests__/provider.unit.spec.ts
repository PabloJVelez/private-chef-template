import { selectSchedule } from "../provider";
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
    { role: "user", content: "tomorrow" },
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
