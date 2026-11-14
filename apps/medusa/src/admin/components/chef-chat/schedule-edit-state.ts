import type {
  EditContext,
  EditProposal,
  EditTask,
} from "../../../lib/chef-ai/edit-intent";
import type {
  PreviewRejection,
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
  draftExpiresAt?: number;
  phase?:
    | "editing"
    | "checking"
    | "ready"
    | "refused"
    | "check_failed"
    | "expired";
  context?: EditContext;
  expectedRevision?: string;
  eventId: string;
  date: string;
  time: string;
  preview?: SchedulePreview;
  busy?: boolean;
  message?: string;
};
type State = {
  task?: EditTask;
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

function validDraft(s: Selection) {
  if (!s.date && !s.time) return false;
  if (s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) return false;
  if (s.date) {
    const date = new Date(s.date + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== s.date
    )
      return false;
  }
  return true;
}
function previewFailure(error: unknown, s: Selection) {
  if (!(error instanceof ScheduleTransportError))
    return "I can't check scheduling right now. Try again later.";
  const rejection = error.rejection;
  const p = rejection?.proposal;
  if (
    rejection?.code === "slot_unavailable" &&
    p &&
    p.eventId === s.eventId &&
    (!s.expectedRevision || p.revision === s.expectedRevision) &&
    (!s.date || p.date === s.date) &&
    (!s.time || p.time === s.time)
  ) {
    const [hour, minute] = p.time.split(":").map(Number);
    const time =
      p.time === "12:00"
        ? "Noon"
        : `${hour % 12 || 12}${minute ? ":" + String(minute).padStart(2, "0") : ""} ${hour < 12 ? "AM" : "PM"}`;
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(new Date(p.date + "T00:00:00Z"));
    return `${time} on ${date} isn't available for ${p.title}. No change was made. Choose another time.`;
  }
  const messages: Partial<Record<PreviewRejection["code"], string>> = {
    slot_unavailable:
      "That date/time isn't available. No change was made. Choose another date or time.",
    event_ineligible:
      "This event can't be changed here. Open the event to review its current status.",
    timezone_mismatch:
      "The event's timezone needs to be reconciled with Availability settings before checking a change.",
    availability_unconfigured:
      "I can't check scheduling until Availability settings are configured.",
    experience_inactive:
      "Choose an active experience on the event before checking a change.",
    invalid_local_time:
      "Choose a valid local date and time. Ambiguous or missing times during daylight-saving changes aren't supported.",
    preview_unavailable:
      "I can't check scheduling right now. Open the event or try again later.",
  };
  return rejection ? messages[rejection.code]! : error.message;
}

/** Feature-specific state, outside cards/history. sessionStorage is same-origin user
 * data, NOT an XSS vault. Auth and the signed server reference remain authoritative.
 */
export class ScheduleEditState {
  private state: State = { attempts: {}, revision: 0 };
  private listeners = new Set<() => void>();
  private generation = 0;
  private previewGeneration = 0;
  private debounce?: ReturnType<typeof setTimeout>;
  private invalidatePreview() {
    clearTimeout(this.debounce);
    this.debounce = undefined;
    return ++this.previewGeneration;
  }
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
    this.publish({ selection: undefined, task: undefined, attempts });
  }
  clearIdentity() {
    // Synchronous epoch invalidation survives component remount and late requests.
    this.generation++;
    this.invalidatePreview();
    this.actor = "";
    this.transport = undefined;
    try {
      const storage = this.storage();
      for (const k of Object.keys(storage))
        if (k.startsWith(prefix)) storage.removeItem(k);
    } catch {
      /* No new writes until bind verifies storage. */
    }
    this.publish({ selection: undefined, task: undefined, attempts: {} });
  }
  select(eventId: string, context?: EditContext) {
    this.invalidatePreview();
    this.publish({
      task: undefined,
      selection: {
        eventId,
        date: "",
        time: "",
        context: context && { ...context, selectedId: eventId },
      },
    });
  }
  /** Capture identity/backend + edit generation, consume selection context. Every prompt/selection/cancel/manual input supersedes it. */
  beginProposal() {
    const selection = this.state.selection;
    const context = selection?.context;
    const refusedTask: EditTask | undefined =
      selection?.phase === "refused" &&
      context &&
      selection.draftExpiresAt &&
      selection.draftExpiresAt > Date.now() &&
      validDraft(selection)
        ? {
            version: 1,
            context,
            expiresAt: selection.draftExpiresAt,
            intent: {
              target: "context",
              targetDate: null,
              date: selection.date
                ? { kind: "iso", value: selection.date }
                : null,
              time: selection.time || null,
              clarification: "none",
              continuation: false,
            },
          }
        : undefined;
    const task =
      this.state.task && this.state.task.expiresAt > Date.now()
        ? this.state.task
        : refusedTask;
    this.publish({ task: undefined });
    const epoch = this.generation,
      request = this.invalidatePreview();
    if (this.state.selection)
      this.publish({
        selection: {
          ...this.state.selection,
          context: undefined,
          busy: false,
          phase: this.state.selection.busy
            ? "editing"
            : this.state.selection.phase,
        },
      });
    return {
      context,
      task,
      current: () =>
        epoch === this.generation &&
        request === this.previewGeneration &&
        (!task || task.expiresAt > Date.now()),
    };
  }
  retainTask(task: EditTask | undefined, current: () => boolean) {
    if (!current()) return;
    this.publish({
      ...(task ? { selection: undefined } : {}),
      task:
        task &&
        task.expiresAt > Date.now() &&
        task.expiresAt <= Date.now() + 300_000
          ? task
          : undefined,
    });
  }
  expireTask() {
    if (this.state.task && this.state.task.expiresAt <= Date.now())
      this.close();
  }
  async propose(proposal: EditProposal, current: () => boolean) {
    if (!current() || this.state.attempts[proposal.eventId]) return false;
    this.invalidatePreview();
    this.publish({
      task: undefined,
      selection: {
        eventId: proposal.eventId,
        date: proposal.date ?? "",
        time: proposal.time ?? "",
        expectedRevision: proposal.expectedRevision,
        draftExpiresAt: Date.now() + 300000,
        context: {
          candidates: [
            { id: proposal.eventId, revision: proposal.expectedRevision },
          ],
          selectedId: proposal.eventId,
          observedAt: Date.now(),
        },
      },
    });
    await this.preview(); // The same dedicated preview runner as the manual form.
    return true;
  }
  close() {
    this.invalidatePreview();
    this.publish({ selection: undefined, task: undefined });
  }
  edit(field: "date" | "time", value: string) {
    if (!this.state.selection || this.state.selection[field] === value) return;
    this.invalidatePreview();
    this.publish({
      task: undefined,
      selection: {
        ...this.state.selection,
        [field]: value,
        draftExpiresAt:
          this.state.selection.draftExpiresAt ?? Date.now() + 300000,
        expectedRevision:
          this.state.selection.preview?.expectedRevision ??
          this.state.selection.expectedRevision,
        context: undefined,
        phase: "editing",
        preview: undefined,
        busy: false,
        message: undefined,
      },
    });
    if (
      validDraft(this.state.selection!) &&
      !this.state.attempts[this.state.selection!.eventId]
    ) {
      const request = this.previewGeneration;
      this.debounce = setTimeout(() => {
        this.debounce = undefined;
        if (request === this.previewGeneration) void this.preview();
      }, 500);
    }
  }
  expirePreview() {
    const s = this.state.selection;
    if (s?.preview && Date.now() >= Date.parse(s.preview.expiresAt)) {
      this.invalidatePreview();
      this.publish({
        selection: {
          ...s,
          preview: undefined,
          phase: "expired",
          busy: false,
          message:
            "This check expired. Recheck availability before confirming.",
        },
      });
    }
  }
  async preview(recheck = false) {
    const s = this.state.selection,
      t = this.transport;
    if (
      !s ||
      !t ||
      s.busy ||
      this.state.attempts[s.eventId] ||
      !validDraft(s) ||
      (!recheck && ["ready", "refused", "check_failed"].includes(s.phase || ""))
    )
      return;
    const epoch = this.generation,
      request = this.invalidatePreview();
    const current = () =>
      epoch === this.generation && request === this.previewGeneration;
    this.publish({
      selection: {
        ...s,
        preview: undefined,
        message: undefined,
        busy: true,
        phase: "checking",
      },
    });
    try {
      const preview = await t.preview(
        {
          eventId: s.eventId,
          ...(s.date ? { date: s.date } : {}),
          ...(s.time ? { time: s.time } : {}),
        },
        current,
      );
      if (current()) {
        if (Date.now() >= Date.parse(preview.expiresAt)) {
          this.publish({
            selection: {
              ...s,
              busy: false,
              phase: "expired",
              message:
                "This check expired. Recheck availability before confirming.",
            },
          });
          return;
        }
        if (
          preview.eventId !== s.eventId ||
          preview.target?.id !== s.eventId ||
          preview.target.revision !== preview.expectedRevision ||
          preview.proposed.date !== (s.date || preview.current.date) ||
          preview.proposed.time !== (s.time || preview.current.time) ||
          preview.proposed.timezone !== preview.current.timezone
        )
          throw new ScheduleTransportError("malformed");
        if (
          s.expectedRevision &&
          preview.expectedRevision !== s.expectedRevision
        ) {
          this.publish({
            selection: {
              ...s,
              busy: false,
              phase: "check_failed",
              expectedRevision: undefined,
              message:
                "The event changed while preparing this proposal. Refresh the event and review the proposed date/time before previewing again.",
            },
          });
        } else
          this.publish({
            selection: {
              ...s,
              preview,
              phase: "ready",
              busy: false,
              message: undefined,
              context: {
                candidates: [
                  { id: s.eventId, revision: preview.expectedRevision },
                ],
                selectedId: s.eventId,
                observedAt: Date.now(),
              },
            },
          });
      }
    } catch (error) {
      if (current())
        this.publish({
          selection: {
            ...s,
            preview: undefined,
            busy: false,
            phase:
              error instanceof ScheduleTransportError && error.kind === "policy"
                ? "refused"
                : "check_failed",
            message: previewFailure(error, s),
            ...(error instanceof ScheduleTransportError &&
            error.rejection?.proposal &&
            error.rejection.proposal.eventId === s.eventId &&
            (!s.expectedRevision ||
              error.rejection.proposal.revision === s.expectedRevision) &&
            (!s.date || error.rejection.proposal.date === s.date) &&
            (!s.time || error.rejection.proposal.time === s.time)
              ? {
                  context: {
                    candidates: [
                      {
                        id: s.eventId,
                        revision: error.rejection.proposal.revision,
                      },
                    ],
                    selectedId: s.eventId,
                    observedAt: Date.now(),
                  },
                  expectedRevision: error.rejection.proposal.revision,
                }
              : {}),
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
      this.expirePreview();
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
    this.invalidatePreview(); // An attempted write supersedes any pending conversational proposal.
    // Published synchronously BEFORE any await: repeated cards/clicks share one guard.
    this.publish({
      task: undefined,
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
    // A validated terminal receipt resolves uncertainty immediately. Keeping only
    // the reference until Done would resurrect it as "unknown" on page refresh.
    // Keep the result in memory for presentation, never persist event details.
    try {
      this.storage().removeItem(key(a));
    } catch {
      // If storage becomes inaccessible, retain the in-memory terminal outcome.
      // A later reload may still require explicit recovery of the old reference.
    }
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
