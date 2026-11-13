import { Client } from "@medusajs/js-sdk";
import {
  createScheduleTransport,
  ScheduleTransportError,
} from "../../admin/components/chef-chat/schedule-edit-transport";
const operationId = "00000000-0000-4000-8000-000000000001";
const local = {
  date: "2030-03-09",
  time: "11:00",
  timezone: "America/New_York",
  instant: "2030-03-09T16:00:00.000Z",
};
const receipt = (outcome = "saved") => ({
  outcome: {
    ...local,
    operationId,
    eventId: "event",
    outcome,
    committedRevision: outcome === "rejected" ? null : "a".repeat(32),
  },
  googleSync: outcome === "saved" ? "requested" : "not_requested",
  historical: true,
  reserved: false,
});
const nativeFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = nativeFetch;
});
function setup(
  status: number,
  body: unknown,
  authType: "session" | "jwt" = "session",
) {
  const fetch = jest.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        statusText: status === 409 ? "Conflict" : "Fixture",
      }),
  );
  globalThis.fetch = fetch;
  const getToken = jest.fn().mockResolvedValue("fixture-token");
  return {
    fetch,
    getToken,
    transport: createScheduleTransport({
      backendUrl: "https://backend.example.invalid/medusa/",
      authType,
      getToken,
    }),
  };
}
it.each(["confirm", "recover"] as const)(
  "actual installed SDK 2.22.6 loses the 409 receipt; feature adapter preserves it on %s",
  async (action) => {
    expect(
      require(
        require("node:path").resolve(
          require.resolve("@medusajs/js-sdk"),
          "../../package.json",
        ),
      ).version,
    ).toBe("2.22.6");
    const body = receipt("rejected");
    const { transport } = setup(409, body);
    const sdk = new Client({
      baseUrl: transport.backend,
      auth: { type: "session" },
    });
    let error: any;
    try {
      await sdk.fetch(`/admin/chef-events/schedule-edit/${action}`, {
        method: "POST",
        body: { reference: "fixture-ref" },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ message: "Conflict", status: 409 });
    expect(error.outcome).toBeUndefined();
    expect(error.response).toBeUndefined();
    expect(error.body).toBeUndefined();
    expect(await transport.attempt(action, "fixture-ref", () => true)).toEqual(
      body,
    );
  },
);
it.each(["saved", "no_change"])(
  "validates a 200 %s receipt",
  async (outcome) => {
    const { transport } = setup(200, receipt(outcome));
    expect(await transport.attempt("confirm", "ref", () => true)).toEqual(
      receipt(outcome),
    );
  },
);
it("keeps 202 uncertainty explicit", async () => {
  const { transport } = setup(202, {
    outcome: "unknown",
    operationId,
    message: "untrusted text",
  });
  expect(await transport.attempt("recover", "ref", () => true)).toEqual({
    outcome: "unknown",
    operationId,
  });
});
it.each([400, 404, 422, 401, 403, 503])(
  "classifies HTTP %i without exposing raw server text or reference",
  async (status) => {
    const { transport } = setup(status, {
      message: "private reference or SQL",
    });
    await expect(
      transport.attempt("recover", "ref", () => true),
    ).rejects.toMatchObject({
      status,
      kind: [401, 403].includes(status)
        ? "access"
        : status === 503
          ? "configuration"
          : "policy",
    });
  },
);
it.each([
  [409, receipt("saved")],
  [200, receipt("rejected")],
  [202, receipt()],
  [200, {}],
  [409, { outcome: { outcome: "rejected" } }],
  [500, receipt()],
  [200, { ...receipt(), reserved: true }],
])(
  "rejects malformed/status-inconsistent responses %s",
  async (status, body) => {
    const { transport } = setup(status as number, body);
    await expect(
      transport.attempt("confirm", "ref", () => true),
    ).rejects.toMatchObject({ kind: "malformed" });
  },
);
it("handles invalid JSON and network loss without passing through exception data", async () => {
  const { transport, fetch } = setup(200, {});
  fetch.mockResolvedValueOnce(new Response("invalid", { status: 200 }));
  await expect(
    transport.attempt("confirm", "ref", () => true),
  ).rejects.toMatchObject({ kind: "malformed" });
  fetch.mockRejectedValueOnce(new Error("private body"));
  await expect(transport.attempt("confirm", "ref", () => true)).rejects.toEqual(
    new ScheduleTransportError("network"),
  );
});
it.each(["session", "jwt"] as const)(
  "uses dashboard backend path and %s credentials, only reference payload",
  async (authType) => {
    const { transport, fetch, getToken } = setup(200, receipt(), authType);
    await transport.attempt("confirm", "exact-signed-ref", () => true);
    expect(fetch).toHaveBeenCalledWith(
      "https://backend.example.invalid/medusa/admin/chef-events/schedule-edit/confirm",
      expect.objectContaining({
        credentials: authType === "session" ? "include" : "omit",
        mode: "cors",
        cache: "no-store",
        redirect: "error",
        body: JSON.stringify({ reference: "exact-signed-ref" }),
      }),
    );
    expect(fetch.mock.calls[0][1].headers.authorization).toBe(
      authType === "jwt" ? "Bearer fixture-token" : undefined,
    );
    expect(getToken).toHaveBeenCalledTimes(authType === "jwt" ? 1 : 0);
  },
);
it("checks auth generation after asynchronous token lookup before dispatch", async () => {
  const { transport, fetch } = setup(200, receipt(), "jwt");
  await expect(
    transport.attempt("confirm", "ref", () => false),
  ).rejects.toMatchObject({ kind: "cancelled" });
  expect(fetch).not.toHaveBeenCalled();
});
it("validates preview event identity and saved IANA zone", async () => {
  const p = {
    reference: "ref",
    operationId,
    eventId: "event",
    expectedRevision: "a".repeat(32),
    expiresAt: "2030-03-01T00:05:00.000Z",
    current: local,
    proposed: local,
    reserved: false,
    googleAvailability: "advisory",
  };
  const { transport, fetch } = setup(200, p);
  expect(
    await transport.preview({ eventId: "event", time: "11:00" }, () => true),
  ).toEqual(p);
  await expect(
    transport.preview({ eventId: "wrong", time: "11:00" }, () => true),
  ).rejects.toMatchObject({ kind: "malformed" });
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ ...p, proposed: { ...local, timezone: "invented" } }),
    ),
  );
  await expect(
    transport.preview({ eventId: "event", time: "11:00" }, () => true),
  ).rejects.toMatchObject({ kind: "malformed" });
});
it("a preview policy refusal preserves the bounded server explanation without guessing alternatives", async () => {
  const message =
    "That arrival time is no longer available. Please choose another time.";
  const { transport } = setup(422, { message });
  await expect(
    transport.preview({ eventId: "event", date: "2026-11-29" }, () => true),
  ).rejects.toMatchObject({ kind: "policy", message });
});
