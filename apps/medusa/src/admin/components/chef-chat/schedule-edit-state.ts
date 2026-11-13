import type {
  SchedulePreview,
  ScheduleReceipt,
  ScheduleResult,
  ScheduleTransport,
} from "./schedule-edit-transport";
import { ScheduleTransportError } from "./schedule-edit-transport";

const prefix = "chef-schedule-attempt:v1:";
const maxRecoveries = 3;
type Attempt = {
  version: 1;
  backend: string;
  actor: string;
  eventId: string;
  operationId: string;
  reference: string;
  attemptedAt: number;
  recoveries: number;
};
export type LiveSchedule = {
  requestedDate: string;
  requestedTime: string;
  timeZone: string;
  status: string;
};
export type AttemptView = Attempt & {
  busy?: boolean;
  result?: ScheduleReceipt;
  message?: string;
  currentView?: "loading" | "available" | "unavailable";
  live?: LiveSchedule;
};
type Selection = {
  eventId: string;
  date: string;
  time: string;
  preview?: SchedulePreview;
  busy?: boolean;
  message?: string;
};
type State = {
  selection?: Selection;
  attempts: Record<string, AttemptView>;
  revision: number;
};
const key = (a: Pick<Attempt, "backend" | "actor" | "eventId">) =>
  prefix + JSON.stringify([a.backend, a.actor, a.eventId]);
const persisted = (a: Attempt): Attempt => ({
  version: 1,
  backend: a.backend,
  actor: a.actor,
  eventId: a.eventId,
  operationId: a.operationId,
  reference: a.reference,
  attemptedAt: a.attemptedAt,
  recoveries: a.recoveries,
});

/** Feature-specific state, outside cards/history. sessionStorage is same-origin user
 * data, NOT an XSS vault. Auth and the signed server reference remain authoritative.
 */
export class ScheduleEditState {
  private state: State = { attempts: {}, revision: 0 };
  private listeners = new Set<() => void>();
  private generation = 0;
  private previewGeneration = 0;
  private actor = "";
  private transport?: ScheduleTransport;
  private blocked = false;
  constructor(private storage: () => Storage = () => window.sessionStorage) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private publish(patch: Partial<State>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.listeners.forEach((fn) => fn());
  }
  bind(actor: string, transport: ScheduleTransport) {
    if (this.actor === actor && this.transport?.backend === transport.backend)
      return;
    if (this.actor) this.clearIdentity();
    this.generation++;
    this.actor = actor;
    this.transport = transport;
    this.blocked = false;
    const attempts: State["attempts"] = {};
    try {
      const storage = this.storage();
      for (const k of Object.keys(storage)) {
        if (!k.startsWith(prefix)) continue;
        const a = JSON.parse(storage.getItem(k)!);
        if (a.actor !== actor || a.backend !== transport.backend) {
          storage.removeItem(k);
          continue;
        }
        if (
          a.version !== 1 ||
          typeof a.eventId !== "string" ||
          !a.eventId ||
          typeof a.reference !== "string" ||
          !a.reference ||
          a.reference.length > 4096 ||
          typeof a.operationId !== "string" ||
          !Number.isFinite(a.attemptedAt) ||
          !Number.isInteger(a.recoveries) ||
          a.recoveries < 0 ||
          key(a) !== k
        )
          throw new Error("Invalid attempt");
        attempts[a.eventId] = persisted(a);
      }
    } catch {
      this.blocked = true;
    }
    this.publish({ selection: undefined, attempts });
  }
  clearIdentity() {
    // Synchronous epoch invalidation survives component remount and late requests.
    this.generation++;
    this.previewGeneration++;
    this.actor = "";
    this.transport = undefined;
    try {
      const storage = this.storage();
      for (const k of Object.keys(storage))
        if (k.startsWith(prefix)) storage.removeItem(k);
    } catch {
      /* No new writes until bind verifies storage. */
    }
    this.publish({ selection: undefined, attempts: {} });
  }
  select(eventId: string) {
    this.previewGeneration++;
    this.publish({ selection: { eventId, date: "", time: "" } });
  }
  close() {
    this.previewGeneration++;
    this.publish({ selection: undefined });
  }
  edit(field: "date" | "time", value: string) {
    if (!this.state.selection) return;
    this.previewGeneration++;
    this.publish({
      selection: {
        ...this.state.selection,
        [field]: value,
        preview: undefined,
        busy: false,
        message: undefined,
      },
    });
  }
  async preview() {
    const s = this.state.selection,
      t = this.transport;
    if (
      !s ||
      !t ||
      s.busy ||
      this.state.attempts[s.eventId] ||
      (!s.date && !s.time)
    )
      return;
    const epoch = this.generation,
      request = ++this.previewGeneration;
    const current = () =>
      epoch === this.generation && request === this.previewGeneration;
    this.publish({ selection: { ...s, preview: undefined, busy: true } });
    try {
      const preview = await t.preview(
        {
          eventId: s.eventId,
          ...(s.date ? { date: s.date } : {}),
          ...(s.time ? { time: s.time } : {}),
        },
        current,
      );
      if (current()) this.publish({ selection: { ...s, preview } });
    } catch (error) {
      if (current())
        this.publish({
          selection: {
            ...s,
            preview: undefined,
            message:
              error instanceof ScheduleTransportError
                ? error.message
                : "Preview unavailable. Please retry.",
          },
        });
    }
  }
  async confirm(
    onReceipt: (
      receipt: ScheduleReceipt,
      current: () => boolean,
    ) => Promise<LiveSchedule | undefined>,
  ) {
    const s = this.state.selection,
      p = s?.preview;
    if (!s || !p || !this.transport || this.state.attempts[s.eventId]) return;
    if (Date.now() >= Date.parse(p.expiresAt)) {
      this.publish({
        selection: {
          ...s,
          preview: undefined,
          message: "Preview expired. Preview again before confirming.",
        },
      });
      return;
    }
    const a: Attempt = {
      version: 1,
      backend: this.transport.backend,
      actor: this.actor,
      eventId: s.eventId,
      operationId: p.operationId,
      reference: p.reference,
      attemptedAt: Date.now(),
      recoveries: 0,
    };
    try {
      if (this.blocked) throw new Error("Unavailable storage");
      const storage = this.storage();
      if (storage.getItem(key(a))) throw new Error("Existing attempt");
      this.save(a);
    } catch {
      this.publish({
        selection: {
          ...s,
          message:
            "Cannot safely retain this attempt in this tab. No change was sent. Restore session storage or reconcile an existing attempt before continuing.",
        },
      });
      return;
    }
    // Published synchronously BEFORE any await: repeated cards/clicks share one guard.
    this.publish({
      selection: undefined,
      attempts: { ...this.state.attempts, [a.eventId]: { ...a, busy: true } },
    });
    await this.run("confirm", a, onReceipt);
  }
  async recover(
    eventId: string,
    onReceipt: (
      receipt: ScheduleReceipt,
      current: () => boolean,
    ) => Promise<LiveSchedule | undefined>,
  ) {
    const a = this.state.attempts[eventId];
    if (
      !a ||
      a.busy ||
      a.result ||
      a.recoveries >= maxRecoveries ||
      !this.transport
    )
      return;
    const next = { ...a, recoveries: a.recoveries + 1 };
    try {
      this.save(next);
    } catch {
      this.update(eventId, {
        message:
          "Recovery storage is unavailable. The earlier save remains unverified; reconcile the live event.",
      });
      return;
    }
    this.update(eventId, { busy: true, recoveries: next.recoveries });
    await this.run("recover", next, onReceipt);
  }
  private save(a: Attempt) {
    const storage = this.storage(),
      value = JSON.stringify(persisted(a));
    storage.setItem(key(a), value);
    if (storage.getItem(key(a)) !== value)
      throw new Error("Storage verification failed");
  }
  private update(eventId: string, patch: Partial<AttemptView>) {
    this.publish({
      attempts: {
        ...this.state.attempts,
        [eventId]: { ...this.state.attempts[eventId], ...patch },
      },
    });
  }
  private async run(
    action: "confirm" | "recover",
    a: Attempt,
    onReceipt: (
      receipt: ScheduleReceipt,
      current: () => boolean,
    ) => Promise<LiveSchedule | undefined>,
  ) {
    const epoch = this.generation,
      t = this.transport!;
    const current = () => epoch === this.generation;
    let result: ScheduleResult;
    try {
      result = await t.attempt(action, a.reference, current);
      if (!current()) return;
      if (
        (result.outcome === "unknown"
          ? result.operationId
          : result.outcome.operationId) !== a.operationId ||
        (result.outcome !== "unknown" && result.outcome.eventId !== a.eventId)
      )
        throw new ScheduleTransportError("malformed");
    } catch (error) {
      if (current())
        this.update(a.eventId, {
          busy: false,
          message:
            error instanceof ScheduleTransportError &&
            ["access", "configuration"].includes(error.kind)
              ? "Schedule changes are unavailable. This does not prove the earlier save rolled back."
              : "Outcome unknown. The response was lost or could not be verified.",
        });
      return;
    }
    if (result.outcome === "unknown") {
      this.update(a.eventId, {
        busy: false,
        message: "Outcome unknown. No durable outcome is available yet.",
      });
      return;
    }
    const receipt = result as ScheduleReceipt;
    this.update(a.eventId, {
      busy: false,
      result: receipt,
      message: undefined,
      currentView: "loading",
    });
    try {
      const live = await onReceipt(receipt, current);
      if (current()) this.update(a.eventId, { currentView: "available", live });
    } catch {
      if (current()) this.update(a.eventId, { currentView: "unavailable" });
    }
  }
  acknowledge(eventId: string) {
    const a = this.state.attempts[eventId];
    if (!a?.result) return; // Uncertainty can never be dismissed into a new operation.
    try {
      const s = this.storage();
      s.removeItem(key(a));
      if (s.getItem(key(a))) return;
    } catch {
      return;
    }
    const attempts = { ...this.state.attempts };
    delete attempts[eventId];
    this.publish({ attempts });
  }
}
// One runtime per tab, not per event card or protected-route mount.
export const scheduleEdits = new ScheduleEditState();
