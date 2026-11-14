import { Button, Input } from "@medusajs/ui";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { Link } from "react-router-dom";
import { type LiveSchedule, scheduleEdits } from "./schedule-edit-state";
import type {
  SchedulePreview,
  ScheduleReceipt,
} from "./schedule-edit-transport";

function LocalTime({ value }: { value: SchedulePreview["current"] }) {
  return (
    <p>
      {new Intl.DateTimeFormat(undefined, {
        timeZone: value.timezone,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value.instant))}
    </p>
  );
}
function OutcomeDetails({
  eventId,
  active,
  children,
}: PropsWithChildren<{ eventId: string; active: boolean }>) {
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      data-attempt-event={eventId}
      tabIndex={-1}
      className="border-ui-border-base bg-ui-bg-subtle rounded-lg border p-3 space-y-3"
      aria-label="Schedule change outcome"
    >
      {children}
    </details>
  );
}
export function ScheduleEditPanel({
  onReceipt,
  closeChat,
}: {
  onReceipt: (
    receipt: ScheduleReceipt,
    current: () => boolean,
  ) => Promise<LiveSchedule | undefined>;
  closeChat: () => void;
}) {
  const { selection, attempts } = useSyncExternalStore(
    scheduleEdits.subscribe,
    scheduleEdits.snapshot,
  );
  const first = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (selection) {
      const target = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          "[data-attempt-event]",
        ) || []),
      ].find((el) => el.dataset.attemptEvent === selection.eventId);
      (target || first.current)?.focus();
      (target || formRef.current)?.scrollIntoView({ block: "nearest" });
    }
  }, [selection?.eventId]);
  useEffect(() => {
    if (!selection?.preview) return;
    const timer = setTimeout(
      () => scheduleEdits.expirePreview(),
      Math.max(0, Date.parse(selection.preview.expiresAt) - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [selection?.preview]);
  const expired =
    selection?.preview && Date.now() >= Date.parse(selection.preview.expiresAt);
  function closeEditor() {
    const eventId = selection?.eventId;
    scheduleEdits.close();
    [...document.querySelectorAll<HTMLButtonElement>("[data-schedule-event]")]
      .find((el) => el.dataset.scheduleEvent === eventId)
      ?.focus();
  }
  return (
    <div ref={panel} className="space-y-3" aria-label="Schedule changes">
      {Object.values(attempts).map((a) => (
        <OutcomeDetails
          key={a.eventId}
          eventId={a.eventId}
          active={Boolean(
            a.result || a.busy || selection?.eventId === a.eventId,
          )}
        >
          <summary className="cursor-pointer text-sm font-medium focus-visible:shadow-borders-focus rounded-sm">
            {a.result
              ? "Change result"
              : a.busy
                ? "Checking change…"
                : "Check previous change"}
          </summary>
          <Link
            className="text-ui-fg-interactive underline"
            to={`/chef-events/${encodeURIComponent(a.eventId)}`}
            onClick={closeChat}
          >
            Open live event
          </Link>
          <div role="status" className="space-y-2">
            {a.result ? (
              <>
                <p className="font-medium">
                  {a.result.outcome.outcome === "saved"
                    ? "Saved"
                    : a.result.outcome.outcome === "no_change"
                      ? "No change needed"
                      : "Rejected / stale preview"}
                </p>
                <p className="text-ui-fg-subtle text-xs">
                  Historical operation result. The live event may have changed
                  since this attempt.
                </p>
                <LocalTime value={a.result.outcome} />
                {a.result.outcome.outcome === "rejected" && (
                  <p>
                    This attempt did not change the event. Open the live event
                    and preview again.
                  </p>
                )}
                {a.live && (
                  <div className="border-ui-border-base border-t pt-2 text-xs">
                    <p className="font-medium">
                      Live event now · {a.live.status}
                    </p>
                    <LocalTime
                      value={{
                        date: "",
                        time: a.live.requestedTime,
                        timezone: a.live.timeZone,
                        instant: a.live.requestedDate,
                      }}
                    />
                  </div>
                )}
                {a.currentView === "loading" && <p>Refreshing current view…</p>}
                {a.currentView === "unavailable" && (
                  <p>
                    Current view unavailable. This historical outcome remains{" "}
                    {a.result.outcome.outcome === "saved"
                      ? "SAVED"
                      : "recorded"}
                    .
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-medium">
                  {a.busy ? "Checking schedule change…" : "Outcome unknown"}
                </p>
                <p>
                  {a.message ||
                    "Check whether your previous change was saved before trying again."}
                </p>
                {a.recoveries >= 3 && (
                  <p>
                    Manual recovery limit reached. Reconcile this event with the
                    site operator before another change. Keep this tab open.
                  </p>
                )}
              </>
            )}
          </div>
          {a.result ? (
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={a.currentView === "loading"}
              onClick={() => scheduleEdits.acknowledge(a.eventId)}
            >
              Done
            </Button>
          ) : (
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={a.busy || a.recoveries >= 3}
              onClick={() => void scheduleEdits.recover(a.eventId, onReceipt)}
            >
              Recover outcome
            </Button>
          )}
        </OutcomeDetails>
      ))}
      {selection && !attempts[selection.eventId] && (
        <form
          ref={formRef}
          aria-label="Change event date and time"
          className="border-ui-border-base bg-ui-bg-subtle rounded-lg border p-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              closeEditor();
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">Change date/time</p>
            <Button
              type="button"
              size="small"
              variant="transparent"
              onClick={closeEditor}
            >
              Cancel edit
            </Button>
          </div>
          <Link
            className="text-ui-fg-interactive text-xs underline"
            to={`/chef-events/${encodeURIComponent(selection.eventId)}`}
            onClick={closeChat}
          >
            Open selected event
          </Link>
          <p className="text-ui-fg-subtle text-xs">
            Leave a field blank to keep it unchanged.
          </p>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
            <label htmlFor={`${id}-date`} className="text-xs space-y-1">
              <span>Date (optional)</span>
              <Input
                ref={first}
                id={`${id}-date`}
                type="date"
                value={selection.date}
                onChange={(e) => scheduleEdits.edit("date", e.target.value)}
              />
            </label>
            <label htmlFor={`${id}-time`} className="text-xs space-y-1">
              <span>Local time (optional)</span>
              <Input
                id={`${id}-time`}
                type="time"
                step={60}
                value={selection.time}
                onChange={(e) => scheduleEdits.edit("time", e.target.value)}
              />
            </label>
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs"
          >
            {selection.busy
              ? "Checking availability…"
              : selection.message ||
                (selection.preview && !expired
                  ? "Ready to confirm"
                  : "Enter a date or time to check availability.")}
          </p>
          {["expired", "check_failed", "refused"].includes(
            selection.phase || "",
          ) && (
            <Button
              type="button"
              size="small"
              variant="transparent"
              onClick={() => void scheduleEdits.preview(true)}
            >
              Recheck availability
            </Button>
          )}
          {selection.preview && (
            <div
              tabIndex={-1}
              className="border-ui-border-base border-t pt-3 space-y-3 outline-none"
              aria-label="Schedule change preview"
            >
              <div className="space-y-1" aria-label="Verified editing target">
                <p className="font-medium">
                  Editing:{" "}
                  <Link
                    className="text-ui-fg-interactive underline"
                    to={`/chef-events/${encodeURIComponent(selection.preview.target.id)}`}
                    onClick={closeChat}
                  >
                    {selection.preview.target.title}
                  </Link>
                </p>
                <LocalTime value={selection.preview.current} />
                <p className="text-xs text-ui-fg-muted">
                  Event ·{" "}
                  <span title={selection.preview.target.id}>
                    {selection.preview.target.id.slice(-8)}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium mb-1">Before</p>
                  <LocalTime value={selection.preview.current} />
                </div>
                <div>
                  <p className="font-medium mb-1">After</p>
                  <LocalTime value={selection.preview.proposed} />
                </div>
              </div>
              <p className="text-ui-fg-muted text-xs">
                {expired
                  ? "Preview expired."
                  : `Confirm by ${new Intl.DateTimeFormat(undefined, { timeZone: selection.preview.proposed.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(selection.preview.expiresAt))}.`}
              </p>
              <p className="text-ui-fg-subtle text-xs">
                This pending slot is not reserved. No customer notification will
                be sent.
              </p>
              {expired ? (
                <p role="status">
                  Preview expired. Preview again before confirming.
                </p>
              ) : (
                <Button
                  type="button"
                  size="small"
                  onClick={() => void scheduleEdits.confirm(onReceipt)}
                >
                  Confirm change
                </Button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
