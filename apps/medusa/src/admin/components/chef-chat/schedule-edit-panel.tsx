import { Button, Input } from "@medusajs/ui";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link } from "react-router-dom";
import { type LiveSchedule, scheduleEdits } from "./schedule-edit-state";
import type {
  SchedulePreview,
  ScheduleReceipt,
} from "./schedule-edit-transport";

function LocalTime({ value }: { value: SchedulePreview["current"] }) {
  return (
    <>
      <p>
        {value.date} · {value.time}
      </p>
      <p className="text-ui-fg-muted text-xs break-all">
        {value.timezone}
        <br />
        UTC {value.instant}
      </p>
    </>
  );
}
const google = {
  requested: "Google dispatch acknowledged; synchronization is not verified.",
  not_requested: "Google dispatch was not requested.",
  pending: "Google dispatch is pending; synchronization is not verified.",
  unknown:
    "Google dispatch acknowledgement is unknown. Check the integration before retrying sync.",
  failed:
    "Google dispatch acknowledgement failed. The event save is unchanged; check the integration.",
};
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
  const previewRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [, tick] = useState(0);
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
    previewRef.current?.focus({ preventScroll: true });
    previewRef.current?.scrollIntoView({ block: "nearest" });
    const timer = setTimeout(
      () => tick((x) => x + 1),
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
        <section
          key={a.eventId}
          data-attempt-event={a.eventId}
          tabIndex={-1}
          className="border-ui-border-base bg-ui-bg-subtle rounded-lg border p-3 space-y-3"
          aria-label="Schedule change outcome"
        >
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
                <p className="text-ui-fg-subtle text-xs">
                  {google[a.result.googleSync]}
                </p>
                {a.live && (
                  <div className="border-ui-border-base border-t pt-2 text-xs">
                    <p className="font-medium">
                      Live event now · {a.live.status}
                    </p>
                    <p>
                      Local arrival {a.live.requestedTime} · {a.live.timeZone}
                    </p>
                    <p>UTC {a.live.requestedDate}</p>
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
                    "An attempted change is retained in this tab. Recover its outcome before starting another change for this event."}
                </p>
                <p className="text-ui-fg-subtle text-xs">
                  Recovery checks this same attempt and may dispatch its pending
                  Google sync. It does not confirm a new change.
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
        </section>
      ))}
      {selection && !attempts[selection.eventId] && (
        <form
          ref={formRef}
          aria-label="Change event date and time"
          className="border-ui-border-base bg-ui-bg-subtle rounded-lg border p-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void scheduleEdits.preview();
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
            Blank fields keep the saved value. Times use the event’s saved
            timezone.
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
          {selection.message && <p role="alert">{selection.message}</p>}
          <Button
            type="submit"
            size="small"
            variant="secondary"
            disabled={selection.busy || (!selection.date && !selection.time)}
          >
            {selection.busy ? "Preparing…" : "Preview"}
          </Button>
          {selection.preview && (
            <div
              ref={previewRef}
              tabIndex={-1}
              className="border-ui-border-base border-t pt-3 space-y-3 outline-none"
              aria-label="Schedule change preview"
            >
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
                Expires {selection.preview.expiresAt} (UTC).
              </p>
              <p className="text-ui-fg-subtle text-xs">
                This pending slot is not reserved. Google availability is
                advisory. No customer notification will be sent.
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
