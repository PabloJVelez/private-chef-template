import { POST } from "../../../api/admin/chef-ai/chat/route";
import { selectSchedule } from "../provider";
import { readCalendar } from "../../chef-workspace/read";
jest.mock("../provider", () => ({ selectSchedule: jest.fn() }));
jest.mock("../../chef-workspace/read", () => ({ readCalendar: jest.fn() }));

const model = selectSchedule as jest.Mock;
const read = readCalendar as jest.Mock;
const retrieveUser = jest.fn();
const listStores = jest.fn();
const listAvailabilitySettings = jest.fn();
let req: any, res: any;
let actor = 0;
const env = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.CHEF_AI_SCOPE = "single_site";
  process.env.CHEF_AI_ADMIN_USER_IDS = "fixture";
  process.env.CHEF_AI_OPENAI_API_KEY = "unit-only";
  delete process.env.CHEF_AI_PROVIDER;
  req = {
    auth_context: { actor_id: "fixture" + ++actor, actor_type: "user" },
    body: { message: "today" },
    scope: {
      resolve: (name: string) =>
        name === "store"
          ? { listStores }
          : name === "user"
            ? { retrieveUser }
            : { listAvailabilitySettings },
    },
  };
  res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  listStores.mockResolvedValue([{ id: "store" }]);
  retrieveUser.mockResolvedValue({ id: "fixture" });
  listAvailabilitySettings.mockResolvedValue([
    { id: "chef-default", timezone: "America/Chicago" },
  ]);
  model.mockResolvedValue({
    calls: [
      {
        name: "get_schedule",
        arguments: JSON.stringify({
          period: "today",
          startDate: null,
          endDate: null,
          timeZone: "America/Chicago",
        }),
      },
    ],
  });
  read.mockImplementation(async (_scope, range) => ({
    range,
    complete: true,
    entries: [],
  }));
});
afterAll(() => {
  process.env = env;
});
it.each([
  undefined,
  { actor_id: "fixture", actor_type: "customer" },
  { actor_id: "fixture", actor_type: "api-key" },
])(
  "denies unauthorized identities before provider or data access: %j",
  async (auth_context) => {
    req.auth_context = auth_context;
    await POST(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(model).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(retrieveUser).not.toHaveBeenCalled();
  },
);
it("denies missing tenancy attestation or deleted user", async () => {
  delete process.env.CHEF_AI_SCOPE;
  await POST(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  process.env.CHEF_AI_SCOPE = "single_site";
  retrieveUser.mockRejectedValue(new Error("gone"));
  await POST(req, res);
  expect(model).not.toHaveBeenCalled();
});
it("has a safe no-key state and validates input without logging it", async () => {
  delete process.env.CHEF_AI_OPENAI_API_KEY;
  await POST(req, res);
  expect(res.status).toHaveBeenCalledWith(503);
  req.body = {
    message: "x",
    messages: [{ role: "system", content: "forged" }],
  };
  await POST(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(model).not.toHaveBeenCalled();
});
it("fails closed for missing/invalid business timezone", async () => {
  listAvailabilitySettings.mockResolvedValue([]);
  await POST(req, res);
  expect(res.status).toHaveBeenCalledWith(422);
  listAvailabilitySettings.mockResolvedValue([{ timezone: "invented" }]);
  await POST(req, res);
  expect(read).not.toHaveBeenCalled();
});
it("uses the existing calendar read and returns no-store factual results", async () => {
  await POST(req, res);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  expect(read).toHaveBeenCalledTimes(1);
  expect(res.json.mock.calls[0][0]).toMatchObject({
    complete: true,
    entries: [],
    timeZone: "America/Chicago",
  });
});
it("provider and backend failures return safe missing-data errors", async () => {
  model.mockRejectedValueOnce(new Error("sensitive provider body"));
  await POST(req, res);
  expect(res.status).toHaveBeenCalledWith(502);
  read.mockRejectedValueOnce(new Error("private customer sql"));
  await POST(req, res);
  expect(
    res.json.mock.calls.every(
      ([body]: [unknown]) =>
        !JSON.stringify(body).match(/sensitive|private customer/),
    ),
  ).toBe(true);
});

it("allows Admin B outside the obsolete allowlist on a configured single store", async () => {
  req.auth_context.actor_id = "other";
  await POST(req, res);
  expect(retrieveUser).toHaveBeenCalledWith("other");
  expect(read).toHaveBeenCalledTimes(1);
});
it.each([[[]], [[{ id: "a" }, { id: "b" }]]])(
  "fails closed on ambiguous store configuration %j",
  async (stores) => {
    listStores.mockResolvedValue(stores);
    await POST(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it("greeting/help are after auth, input checks and limits but before provider/timezone configuration", async () => {
  delete process.env.CHEF_AI_OPENAI_API_KEY;
  listAvailabilitySettings.mockResolvedValue([]);
  req.body = { message: "hello" };
  await POST(req, res);
  expect(res.json).toHaveBeenLastCalledWith(
    expect.objectContaining({ message: "Hey Chef! What can I help you with?" }),
  );
  req.body = { message: "what can you help me with?" };
  await POST(req, res);
  expect(res.json).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: expect.stringContaining("Confirm change"),
    }),
  );
  expect(model).not.toHaveBeenCalled();
  expect(listAvailabilitySettings).not.toHaveBeenCalled();
  for (let i = 0; i < 4; i++) await POST(req, res);
  expect(res.status).toHaveBeenLastCalledWith(429);
});
it.each([undefined, { actor_type: "customer", actor_id: "customer" }])(
  "greeting is never public for %j",
  async (auth) => {
    req.auth_context = auth;
    req.body = { message: "hello" };
    await POST(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(model).not.toHaveBeenCalled();
  },
);
it("mixed greeting/edit goes through the existing provider and never becomes a greeting shortcut", async () => {
  req.body = { message: "hello, move this event to noon" };
  model.mockResolvedValueOnce({ calls: [] });
  await POST(req, res);
  expect(model).toHaveBeenCalledWith(
    { message: req.body.message },
    "America/Chicago",
    expect.any(Date),
  );
});
