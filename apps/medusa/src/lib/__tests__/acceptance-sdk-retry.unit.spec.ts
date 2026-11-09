import { RESOLVED_INVALID_TICKET_DETAILS, UNRESOLVED_INVALID_TICKET_DETAILS } from '../acceptance-messages';
import { AdminChefEventsResource } from "../../sdk/admin/admin-chef-events";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

it("replays original non-default input after response loss and a new SDK/page instance", async () => {
  const fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce({ success: true, pending: true })
    .mockResolvedValueOnce({ success: true, pending: false });
  const sdk = new AdminChefEventsResource({ fetch } as never);
  await expect(
    sdk.accept("event", { chefNotes: "No nuts", sendAcceptanceEmail: false }),
  ).rejects.toThrow("Lost response");
  const original = fetch.mock.calls[0][1].body;
  // The reloaded page has empty notes and email=true, but these are not a new authorized attempt.
  const reloaded = new AdminChefEventsResource({ fetch } as never);
  await reloaded.accept("event", { sendAcceptanceEmail: true });
  expect(fetch.mock.calls[1][1].body).toEqual(original);
  expect(storage.size).toBe(1);
  await reloaded.accept("event", { chefNotes: "Different notes" });
  expect(fetch.mock.calls[2][1].body).toEqual(original);
  expect(storage.size).toBe(0);
});
it("retains unresolved attempts but permits new input after a verified resolved failure", async () => {
  const fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error("Acceptance requires recovery."))
    .mockRejectedValueOnce(
      new Error(
        "This acceptance attempt failed. Submit a new attemptId to try again.",
      ),
    )
    .mockResolvedValueOnce({ success: true, pending: true });
  const sdk = new AdminChefEventsResource({ fetch } as never);
  await sdk.accept("event", { sendAcceptanceEmail: false }).catch(() => {});
  expect(storage.size).toBe(1);
  await sdk.accept("event", {}).catch(() => {});
  expect(storage.size).toBe(0);
  await sdk.accept("event", { sendAcceptanceEmail: true });
  expect(fetch.mock.calls[2][1].body.attemptId).not.toBe(
    fetch.mock.calls[0][1].body.attemptId,
  );
  expect(fetch.mock.calls[2][1].body.sendAcceptanceEmail).toBe(true);
});

it('clears a deterministic failure only after verified cleanup, preserving the immutable request before it', async () => {
  const fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error(UNRESOLVED_INVALID_TICKET_DETAILS))
    .mockRejectedValueOnce(new Error(RESOLVED_INVALID_TICKET_DETAILS))
    .mockResolvedValueOnce({ success: true, pending: false });
  const sdk = new AdminChefEventsResource({ fetch } as never);
  await expect(
    sdk.accept('event', { chefNotes: 'Original notes', sendAcceptanceEmail: false }),
  ).rejects.toThrow(UNRESOLVED_INVALID_TICKET_DETAILS);
  expect(storage.size).toBe(1);
  const original = fetch.mock.calls[0][1].body;
  await expect(new AdminChefEventsResource({ fetch } as never).accept('event', {})).rejects.toThrow(
    RESOLVED_INVALID_TICKET_DETAILS,
  );
  expect(fetch.mock.calls[1][1].body).toEqual(original);
  expect(storage.size).toBe(0);
  await sdk.accept('event', { sendAcceptanceEmail: true });
  expect(fetch.mock.calls[2][1].body.attemptId).not.toBe(original.attemptId);
});
