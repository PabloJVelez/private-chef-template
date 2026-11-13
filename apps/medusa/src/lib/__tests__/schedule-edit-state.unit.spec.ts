/** @jest-environment jsdom */
import { ScheduleEditState } from "../../admin/components/chef-chat/schedule-edit-state";
import {
  ScheduleTransportError,
  type SchedulePreview,
  type ScheduleReceipt,
  type ScheduleTransport,
} from "../../admin/components/chef-chat/schedule-edit-transport";
const operationId = "00000000-0000-4000-8000-000000000001";
const local = {
  date: "2030-03-09",
  time: "11:00",
  timezone: "America/New_York",
  instant: "2030-03-09T16:00:00.000Z",
};
const p = (): SchedulePreview => ({
  reference: "exact-original-reference",
  operationId,
  eventId: "event",
  expectedRevision: "a".repeat(32),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  current: local,
  proposed: local,
  reserved: false,
  googleAvailability: "advisory",
});
const receipt: ScheduleReceipt = {
  outcome: {
    ...local,
    operationId,
    eventId: "event",
    outcome: "saved",
    committedRevision: "b".repeat(32),
  },
  googleSync: "requested",
  historical: true,
  reserved: false,
};
let state: ScheduleEditState,
  transport: ScheduleTransport,
  preview: jest.Mock,
  attempt: jest.Mock,
  onReceipt: jest.Mock;
beforeEach(() => {
  sessionStorage.clear();
  state = new ScheduleEditState();
  preview = jest.fn().mockImplementation(async () => p());
  attempt = jest.fn().mockResolvedValue(receipt);
  transport = { backend: "https://backend.invalid", preview, attempt };
  onReceipt = jest.fn().mockResolvedValue(undefined);
  state.bind("A", transport);
});
async function ready() {
  state.select("event");
  state.edit("time", "11:00");
  await state.preview();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it.each(["date", "time"] as const)(
  "form open is inert; %s-only omits the untouched field",
  async (field) => {
    state.select("event");
    expect(preview).not.toHaveBeenCalled();
    state.edit(field, field === "date" ? "2030-03-09" : "11:00");
    await state.preview();
    expect(preview).toHaveBeenCalledWith(
      { eventId: "event", [field]: field === "date" ? "2030-03-09" : "11:00" },
      expect.any(Function),
    );
    expect(attempt).not.toHaveBeenCalled();
  },
);
it.each(["date", "event", "actor", "close"])(
  "suppresses old in-flight preview after changing %s",
  async (change) => {
    const d = deferred<SchedulePreview>();
    preview.mockReturnValueOnce(d.promise);
    state.select("event");
    state.edit("time", "11:00");
    const request = state.preview();
    if (change === "date") state.edit("date", "2030-03-10");
    if (change === "event") state.select("different-source-id");
    if (change === "actor") state.bind("B", transport);
    if (change === "close") state.close();
    d.resolve(p());
    await request;
    expect(state.snapshot().selection?.preview).toBeUndefined();
    await state.confirm(onReceipt);
    expect(attempt).not.toHaveBeenCalled();
  },
);
it("revokes unused preview on form change and rejects expired unused preview locally", async () => {
  await ready();
  state.edit("time", "12:00");
  await state.confirm(onReceipt);
  expect(attempt).not.toHaveBeenCalled();
  preview.mockResolvedValueOnce({
    ...p(),
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  await state.preview();
  await state.confirm(onReceipt);
  expect(attempt).not.toHaveBeenCalled();
  expect(state.snapshot().selection?.message).toContain("expired");
});
it("saves synchronously before dispatch and guards same-tick confirms and repeated cards", async () => {
  await ready();
  const d = deferred<ScheduleReceipt>();
  attempt.mockImplementationOnce(() => {
    expect(Object.values(sessionStorage).join()).toContain(
      "exact-original-reference",
    );
    return d.promise;
  });
  const request = state.confirm(onReceipt);
  void state.confirm(onReceipt);
  state.select("event");
  state.edit("time", "12:00");
  await state.preview();
  expect(preview).toHaveBeenCalledTimes(1);
  expect(attempt).toHaveBeenCalledTimes(1);
  d.resolve(receipt);
  await request;
  expect(state.snapshot().attempts.event.result).toEqual(receipt);
  expect(sessionStorage.length).toBe(0); // Terminal receipt resolves persisted uncertainty immediately.
  state.acknowledge("event");
  expect(sessionStorage.length).toBe(0);
});
it.each(["throw", "silent"])(
  "storage %s failure prevents confirm dispatch",
  async (mode) => {
    const broken = new ScheduleEditState(
      () =>
        ({
          ...sessionStorage,
          getItem: () => null,
          setItem: () => {
            if (mode === "throw") throw new Error("quota");
          },
        }) as Storage,
    );
    broken.bind("A", transport);
    broken.select("event");
    broken.edit("time", "11:00");
    await broken.preview();
    await broken.confirm(onReceipt);
    expect(attempt).not.toHaveBeenCalled();
    expect(broken.snapshot().selection?.message).toContain(
      "No change was sent",
    );
  },
);
it("commit response loss survives empty-chat remount beyond preview expiry; only manual recovery uses the original reference", async () => {
  await ready();
  attempt.mockRejectedValueOnce(new ScheduleTransportError("network"));
  await state.confirm(onReceipt);
  state.close();
  state.select("event");
  state.edit("time", "12:00");
  await state.confirm(onReceipt);
  const refresh = new ScheduleEditState();
  refresh.bind("A", transport);
  expect(refresh.snapshot().selection).toBeUndefined();
  expect(attempt).toHaveBeenCalledTimes(1);
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 600000);
  try {
    await refresh.recover("event", onReceipt);
  } finally {
    jest.restoreAllMocks();
  }
  expect(attempt.mock.calls[1]).toEqual([
    "recover",
    "exact-original-reference",
    expect.any(Function),
  ]);
  expect(refresh.snapshot().attempts.event.result?.outcome.time).toBe("11:00");
});
it.each([403, 503, 202])(
  "recovery %i cannot erase an attempt or permit a new operation; manual recovery is bounded",
  async (status) => {
    await ready();
    attempt.mockResolvedValue({ outcome: "unknown", operationId });
    await state.confirm(onReceipt);
    if (status !== 202)
      attempt.mockRejectedValue(
        new ScheduleTransportError(
          status === 403 ? "access" : "configuration",
          status,
        ),
      );
    for (let i = 0; i < 5; i++) await state.recover("event", onReceipt);
    expect(attempt).toHaveBeenCalledTimes(4);
    expect(sessionStorage.length).toBe(1);
    state.acknowledge("event");
    expect(sessionStorage.length).toBe(1);
    state.select("event");
    state.edit("time", "12:00");
    await state.preview();
    expect(preview).toHaveBeenCalledTimes(1);
  },
);
it.each(["confirm", "recover"])(
  "logout/identity switch suppresses late %s response across remount",
  async (action) => {
    await ready();
    const d = deferred<ScheduleReceipt>();
    let request: Promise<void>;
    if (action === "recover") {
      attempt.mockResolvedValueOnce({ outcome: "unknown", operationId });
      await state.confirm(onReceipt);
      attempt.mockReturnValueOnce(d.promise);
      request = state.recover("event", onReceipt);
    } else {
      attempt.mockReturnValueOnce(d.promise);
      request = state.confirm(onReceipt);
    }
    state.clearIdentity();
    state.bind("B", transport);
    d.resolve(receipt);
    await request;
    expect(state.snapshot().attempts).toEqual({});
    expect(sessionStorage.length).toBe(0);
    expect(onReceipt).not.toHaveBeenCalled();
  },
);
it("a saved receipt stays saved when the live read fails", async () => {
  await ready();
  onReceipt.mockRejectedValueOnce(new Error("offline"));
  await state.confirm(onReceipt);
  expect(state.snapshot().attempts.event).toMatchObject({
    result: receipt,
    currentView: "unavailable",
  });
});
it("mismatched operation/event receipt stays unknown", async () => {
  await ready();
  attempt.mockResolvedValueOnce({
    ...receipt,
    outcome: { ...receipt.outcome, eventId: "other" },
  });
  await state.confirm(onReceipt);
  expect(state.snapshot().attempts.event.result).toBeUndefined();
  expect(onReceipt).not.toHaveBeenCalled();
});
it("new actor or backend never loads another scope’s actionable reference", async () => {
  await ready();
  attempt.mockRejectedValueOnce(new Error());
  await state.confirm(onReceipt);
  const refresh = new ScheduleEditState();
  refresh.bind("B", transport);
  expect(refresh.snapshot().attempts).toEqual({});
  expect(sessionStorage.length).toBe(0);
});
it.each(["manual", "event", "close", "actor", "backend", "newer"])(
  "a late conversational proposal cannot reopen the editor after %s",
  async (change) => {
    const ticket = state.beginProposal();
    if (change === "manual") {
      state.select("event");
      state.edit("time", "12:00");
    }
    if (change === "event") state.select("other");
    if (change === "close") state.close();
    if (change === "actor") state.bind("B", transport);
    if (change === "backend")
      state.bind("A", { ...transport, backend: "https://other.invalid" });
    if (change === "newer") state.beginProposal();
    expect(
      await state.propose(
        {
          eventId: "event",
          expectedRevision: "a".repeat(32),
          date: "2026-11-29",
        },
        ticket.current,
      ),
    ).toBe(false);
    expect(preview).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  },
);
it("conversational proposal uses the shared runner, and a revision change before preview prevents confirmation", async () => {
  preview.mockResolvedValueOnce({ ...p(), expectedRevision: "b".repeat(32) });
  const ticket = state.beginProposal();
  await state.propose(
    { eventId: "event", expectedRevision: "a".repeat(32), date: "2026-11-29" },
    ticket.current,
  );
  expect(preview).toHaveBeenCalledWith(
    { eventId: "event", date: "2026-11-29" },
    expect.any(Function),
  );
  expect(state.snapshot().selection?.preview).toBeUndefined();
  expect(state.snapshot().selection?.message).toContain("event changed");
  await state.confirm(onReceipt);
  expect(attempt).not.toHaveBeenCalled();
});
it("an unresolved attempt supersedes a new conversational proposal for the same event", async () => {
  await ready();
  attempt.mockResolvedValueOnce({ outcome: "unknown", operationId });
  await state.confirm(onReceipt);
  const ticket = state.beginProposal();
  expect(
    await state.propose(
      { eventId: "event", expectedRevision: "a".repeat(32), time: "12:00" },
      ticket.current,
    ),
  ).toBe(false);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(attempt).toHaveBeenCalledTimes(1);
});

const unfinishedTask = () => ({
  version: 1 as const,
  intent: {
    target: "context" as const,
    date: null,
    time: "14:00",
    clarification: "none" as const,
  },
  expiresAt: Date.now() + 300_000,
});
it("unfinished conversational task is memory-only, consumed on next prompt and separate from attempted references", async () => {
  const ticket = state.beginProposal();
  state.retainTask(unfinishedTask(), ticket.current);
  expect(state.snapshot().task?.intent.time).toBe("14:00");
  expect(Object.keys(sessionStorage)).toHaveLength(0);
  const next = state.beginProposal();
  expect(next.task?.intent.time).toBe("14:00");
  expect(state.snapshot().task).toBeUndefined();
  expect(preview).not.toHaveBeenCalled();
  expect(attempt).not.toHaveBeenCalled();
  state.retainTask(unfinishedTask(), next.current);
  const newer = state.beginProposal();
  state.retainTask(unfinishedTask(), next.current);
  expect(state.snapshot().task).toBeUndefined();
  expect(newer.current()).toBe(true);
});
it.each(["close", "selection", "manual", "actor", "backend", "expiry"])(
  "invalidates unfinished task on %s without persisting or writing",
  async (change) => {
    state.select("event");
    const ticket = state.beginProposal();
    state.retainTask(unfinishedTask(), ticket.current);
    if (change === "close") state.close();
    if (change === "selection") state.select("other");
    if (change === "manual") {
      state.select("event");
      state.edit("time", "15:00");
    }
    if (change === "actor") state.bind("B", transport);
    if (change === "backend")
      state.bind("A", { ...transport, backend: "https://different.invalid" });
    if (change === "expiry") {
      jest.spyOn(Date, "now").mockReturnValue(Date.now() + 300001);
      state.expireTask();
      jest.restoreAllMocks();
    }
    expect(state.snapshot().task).toBeUndefined();
    expect(ticket.current()).toBe(false);
    state.retainTask(unfinishedTask(), ticket.current);
    expect(state.snapshot().task).toBeUndefined();
    expect(attempt).not.toHaveBeenCalled();
  },
);
it("a clarification response arriving after task expiry cannot resurrect the draft", () => {
  state.retainTask(unfinishedTask(), state.beginProposal().current);
  const ticket = state.beginProposal();
  const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 300001);
  try {
    expect(ticket.current()).toBe(false);
    state.retainTask(unfinishedTask(), ticket.current);
    expect(state.snapshot().task).toBeUndefined();
  } finally {
    clock.mockRestore();
  }
});

it.each(["saved", "no_change", "rejected"] as const)(
  "terminal %s receipt does not resurrect as unknown after refresh without Done",
  async (outcome) => {
    await ready();
    attempt.mockResolvedValueOnce({
      ...receipt,
      outcome: { ...receipt.outcome, outcome },
    });
    const refreshRead = deferred<undefined>();
    onReceipt.mockReturnValueOnce(refreshRead.promise);
    const confirmation = state.confirm(onReceipt);
    await Promise.resolve();
    expect(state.snapshot().attempts.event.result?.outcome.outcome).toBe(
      outcome,
    );
    expect(sessionStorage.length).toBe(0);
    // Reload even before cache invalidation/live-view reads finish.
    const refreshed = new ScheduleEditState();
    refreshed.bind("A", transport);
    expect(refreshed.snapshot().attempts).toEqual({});
    expect(attempt).toHaveBeenCalledTimes(1);
    refreshRead.resolve(undefined);
    await confirmation;
  },
);
it("terminal recovery also removes the reference without Done even when live refresh fails", async () => {
  await ready();
  attempt.mockRejectedValueOnce(new Error("lost"));
  await state.confirm(onReceipt);
  expect(sessionStorage.length).toBe(1);
  onReceipt.mockRejectedValueOnce(new Error("offline"));
  await state.recover("event", onReceipt);
  expect(state.snapshot().attempts.event.result).toEqual(receipt);
  expect(sessionStorage.length).toBe(0);
  const refreshed = new ScheduleEditState();
  refreshed.bind("A", transport);
  expect(refreshed.snapshot().attempts).toEqual({});
});
