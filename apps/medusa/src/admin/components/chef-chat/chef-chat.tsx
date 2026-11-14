import "./chef-chat.css";
import {
  Badge,
  Button,
  IconButton,
  Textarea,
  Tooltip,
  TooltipProvider,
} from "@medusajs/ui";
import {
  Calendar,
  CaretMaximizeDiagonal,
  CaretMinimizeDiagonal,
  XMark,
} from "@medusajs/icons";
import { Dialog } from "radix-ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Link, useLocation, useMatches } from "react-router-dom";
import type { Client } from "@medusajs/js-sdk";
import type { ScheduleAnswer } from "../../../lib/chef-ai/contracts";
import type { TimeInterval } from "../../../lib/chef-workspace/contracts";

import { type LiveSchedule, scheduleEdits } from "./schedule-edit-state";
import { pageHintFromMatches } from "./page-context";
import { eventSentence } from "../../../lib/chef-ai/presentation";
import type { VerifiedEventTarget } from "../../../lib/chef-ai/page-context";
import { SousChefIcon } from "./sous-chef-icon";
import { ScheduleEditPanel } from "./schedule-edit-panel";
import type {
  ScheduleReceipt,
  ScheduleTransport,
} from "./schedule-edit-transport";
import type { EditContext, EditIntent } from "../../../lib/chef-ai/edit-intent";
import type {
  CalendarEntry,
  CalendarResult,
} from "../../../lib/chef-workspace/contracts";

type Turn = {
  question: string;
  answer?: ScheduleAnswer;
  error?: string;
  historicalIds?: string[];
};
type Session = { owner: string; turns: Turn[] };
const empty: Session = { owner: "", turns: [] };
const Context = createContext<{
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  generation: React.MutableRefObject<number>;
  changed: React.MutableRefObject<Map<string, number>>;
  historyRevision: React.MutableRefObject<number>;
} | null>(null);

export function ChefChatSession({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session>(empty);
  const generation = useRef(0);
  const changed = useRef(new Map<string, number>());
  const historyRevision = useRef(0);
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        // Dashboard logout clears this cache. Also clear on expired/deleted identity.
        if (
          event.query.queryKey[0] !== "users" ||
          event.query.queryKey[1] !== "me"
        )
          return;
        const data = event.query.state.data as
          | { user?: { id: string } }
          | undefined;
        if (
          event.type === "removed" ||
          !data?.user ||
          event.query.state.status === "error" ||
          (session.owner && data.user.id !== session.owner)
        ) {
          generation.current++;
          const status = (event.query.state.error as { status?: number } | null)
            ?.status;
          // A transient identity-refetch failure is not proof that an attempted
          // schedule write rolled back. Only a lost/switched identity clears it.
          if (
            event.type === "removed" ||
            status === 401 ||
            status === 403 ||
            (event.query.state.status === "success" && !data?.user) ||
            (session.owner && data?.user && data.user.id !== session.owner)
          )
            scheduleEdits.clearIdentity();
          changed.current.clear();
          setSession(empty);
        }
      }),
    [queryClient, session.owner],
  );
  return (
    <Context.Provider
      value={{ session, setSession, generation, changed, historyRevision }}
    >
      {children}
    </Context.Provider>
  );
}

function interval(time: TimeInterval, zone: string) {
  const format = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${format.format(new Date(time.start))} – ${format.format(new Date(time.end))}`;
}

const suggestions = [
  {
    label: "Today",
    hint: "Your day at a glance",
    question: "What's on my schedule today?",
  },
  {
    label: "Tomorrow",
    hint: "Look ahead to tomorrow",
    question: "What's on my schedule tomorrow?",
  },
  {
    label: "This week",
    hint: "See the week's events",
    question: "What's on my schedule this week?",
  },
  {
    label: "This weekend",
    hint: "Saturday and Sunday",
    question: "What do I have this weekend?",
  },
];
const statuses = {
  pending: { label: "Pending request", color: "orange" },
  confirmed: { label: "Confirmed appointment", color: "green" },
  cancelled: { label: "Cancelled event", color: "red" },
  completed: { label: "Completed appointment", color: "grey" },
} as const;

function compactInterval(time: TimeInterval, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatRange(new Date(time.start), new Date(time.end));
}

function Answer({
  answer,
  close,
  historicalIds = [],
  currentContext,
  chooseSummary,
}: {
  chooseSummary: (id: string, title: string) => void;
  currentContext?: EditContext;
  historicalIds?: string[];
  answer: ScheduleAnswer;
  close: () => void;
}) {
  if (answer.summaryChoices)
    return (
      <div className="space-y-2">
        <p>{answer.message}</p>
        {answer.summaryChoices.map((event) => (
          <Button
            type="button"
            size="small"
            variant="secondary"
            key={event.source.id}
            onClick={() => chooseSummary(event.source.id, event.title)}
            aria-label={`Read ${event.title} (${event.source.id})`}
            className="h-auto whitespace-normal text-left"
          >
            {event.title}
            {eventSentence(event).after} · {event.status} ·{" "}
            {event.source.id.slice(-8)}
          </Button>
        ))}
      </div>
    );
  if (answer.summary) {
    const event = answer.summary,
      words = eventSentence(event);
    return (
      <div className="space-y-2">
        <p>
          {historicalIds.includes(event.source.id) ? "Earlier snapshot: " : ""}
          {words.before}
          <Link
            className="text-ui-fg-interactive underline"
            to={`/chef-events/${encodeURIComponent(event.source.id)}`}
            onClick={close}
          >
            {event.title}
          </Link>
          {event.timingUnavailable
            ? ", with a local arrival time that needs to be verified on the event page."
            : words.after}
        </p>
        {(event.category || event.guestCount) && (
          <p className="text-xs text-ui-fg-subtle">
            {[
              event.category,
              event.guestCount ? `${event.guestCount} guests` : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    );
  }
  if (answer.presentation && answer.entries.length) {
    return (
      <div className="space-y-3">
        {answer.entries.length > 1 && <p>{answer.message}</p>}
        <div
          className="space-y-3"
          role={answer.entries.length > 1 ? "list" : undefined}
        >
          {answer.entries.map((event) => {
            const words = eventSentence(event);
            const historical = historicalIds.includes(event.source.id);
            return (
              <div
                key={event.id}
                role={answer.entries.length > 1 ? "listitem" : undefined}
                className="space-y-2"
              >
                <p>
                  {historical ? "Earlier snapshot: " : ""}
                  {answer.entries.length > 1
                    ? words.before.replace(/^You have (one|a) /, "")
                    : words.before}
                  <Link
                    className="text-ui-fg-interactive underline"
                    to={`/chef-events/${encodeURIComponent(event.source.id)}`}
                    onClick={close}
                  >
                    {event.title}
                  </Link>
                  {words.after}
                </p>
                {historical && (
                  <p className="text-xs text-ui-fg-muted">
                    Historical schedule snapshot — open the live event for its
                    current time.
                  </p>
                )}
                {event.source.type === "private-event" &&
                  event.status === "pending" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      data-schedule-event={event.source.id}
                      onClick={() =>
                        scheduleEdits.select(
                          event.source.id,
                          historical ? undefined : currentContext,
                        )
                      }
                    >
                      Change date/time
                    </Button>
                  )}
                <details className="text-xs text-ui-fg-subtle">
                  <summary className="cursor-pointer">Details</summary>
                  <Answer
                    chooseSummary={chooseSummary}
                    answer={{
                      ...answer,
                      entries: [event],
                      presentation: undefined,
                    }}
                    close={close}
                    historicalIds={historicalIds}
                    currentContext={currentContext}
                  />
                </details>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const zone = answer.timeZone;
  const windowLabel =
    answer.range && zone
      ? new Intl.DateTimeFormat(undefined, {
          timeZone: zone,
          month: "short",
          day: "numeric",
          year: "numeric",
        }).formatRange(new Date(answer.range.start), new Date(answer.range.end))
      : undefined;
  return (
    <div className="space-y-3">
      {answer.range && zone && (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <details className="min-w-0">
              <summary
                aria-label={`Exact schedule window: ${windowLabel}`}
                className="text-ui-fg-base focus-visible:shadow-borders-focus cursor-pointer rounded-sm font-medium outline-none"
              >
                {windowLabel}
              </summary>
              <p className="text-ui-fg-subtle mt-2 text-xs leading-relaxed">
                {interval(answer.range, zone)}
              </p>
            </details>
            {answer.complete === true && (
              <Badge size="xsmall" color="grey" className="shrink-0">
                {answer.entries.length}{" "}
                {answer.entries.length === 1 ? "event" : "events"}
              </Badge>
            )}
          </div>
        </div>
      )}
      {!answer.entries.length && (
        <p className="text-ui-fg-subtle text-sm leading-relaxed">
          {answer.message}
        </p>
      )}
      <div className="space-y-2">
        {answer.entries.map((event) => {
          const status = statuses[event.status];
          return (
            <article
              key={event.id}
              className="border-ui-border-base bg-ui-bg-base rounded-lg border p-3"
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <Badge size="xsmall" color={status.color}>
                  {status.label}
                </Badge>
              </div>
              <Link
                to={event.detailPath}
                onClick={close}
                className="text-ui-fg-base hover:text-ui-fg-interactive focus-visible:shadow-borders-focus block rounded-sm font-medium underline decoration-ui-border-strong underline-offset-4 outline-none"
              >
                {event.title}
              </Link>
              <p className="text-ui-fg-base mt-1 text-xs leading-relaxed">
                <span>
                  {event.appointmentTime ? "Appointment" : "Display time"}:{" "}
                </span>
                {compactInterval(
                  event.appointmentTime ?? event.displayTime,
                  zone!,
                )}
              </p>
              {event.source.type === "private-event" &&
                event.status === "pending" && (
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    className="mt-3 mb-2 w-full justify-center font-medium"
                    data-schedule-event={event.source.id}
                    onClick={() =>
                      scheduleEdits.select(
                        event.source.id,
                        historicalIds.length ? undefined : currentContext,
                      )
                    }
                  >
                    Change date/time
                  </Button>
                )}
              <details className="text-ui-fg-subtle mt-2 text-xs">
                <summary
                  aria-label={`Details for ${event.title}`}
                  className="hover:text-ui-fg-base focus-visible:shadow-borders-focus w-fit cursor-pointer rounded-sm outline-none"
                >
                  Details
                </summary>
                <dl className="border-ui-border-base mt-2 space-y-2 border-t pt-2 leading-relaxed">
                  <p>
                    Display intervals may be estimates; appointment and
                    protection are recorded separately.
                  </p>
                  <div>
                    <dt className="text-ui-fg-base font-medium">
                      Requested time
                    </dt>
                    <dd>
                      {event.requestedTime
                        ? interval(event.requestedTime, zone!)
                        : "No requested time recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-base font-medium">
                      Display interval
                    </dt>
                    <dd>{interval(event.displayTime, zone!)}</dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-base font-medium">Appointment</dt>
                    <dd>
                      {event.appointmentTime
                        ? interval(event.appointmentTime, zone!)
                        : "No appointment recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-base font-medium">
                      Scheduling protection
                    </dt>
                    <dd>
                      {event.protectedTime.length
                        ? event.protectedTime.map((time, i) => (
                            <div key={i}>
                              {time.state === "held" ? "Held" : "Confirmed"}:{" "}
                              {interval(time, zone!)}
                            </div>
                          ))
                        : "No held or confirmed interval returned"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ui-fg-base font-medium">
                      Recorded category
                    </dt>
                    <dd>{event.category}</dd>
                  </div>
                </dl>
              </details>
              {historicalIds.includes(event.source.id) && (
                <p className="text-ui-fg-muted mt-2 text-xs">
                  Historical schedule snapshot — open the live event for its
                  current time.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function ChefChat({
  userId,
  client,
  scheduleTransport,
}: {
  userId: string;
  client: Pick<Client, "fetch">;
  scheduleTransport?: ScheduleTransport;
}) {
  const { session, setSession, generation, changed, historyRevision } =
    useContext(Context)!;
  const queryClient = useQueryClient();
  const editState = useSyncExternalStore(
    scheduleEdits.subscribe,
    scheduleEdits.snapshot,
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useLayoutEffect(() => {
    if (scheduleTransport) scheduleEdits.bind(userId, scheduleTransport);
  }, [userId, scheduleTransport]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState<{
    intent: EditIntent;
    context: EditContext;
    cards: CalendarEntry[];
    targets?: VerifiedEventTarget[];
    current: () => boolean;
  }>();
  // Targeting has its own lifetime. Visible turns are presentation snapshots only.
  const focus = useRef<{
    context: EditContext;
    cards: CalendarEntry[];
    current: () => boolean;
  }>();
  if (session.owner !== userId) focus.current = undefined;
  const controller = useRef<AbortController>();
  const sending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const page = pageHintFromMatches(useMatches());
  const navigation = useRef(location.key);
  navigation.current = location.key;
  const turns = session.owner === userId ? session.turns : [];
  useEffect(() => {
    if (session.owner !== userId) setSession({ owner: userId, turns: [] });
  }, [session.owner, userId, setSession]);
  useLayoutEffect(() => {
    setOpen(false);
    setChoice(undefined);
    focus.current = undefined;
    // Navigation ends conversational targeting, not visible history or attempted
    // write recovery. close() also invalidates tickets held by late responses.
    scheduleEdits.close();
    setSession((s) => ({
      ...s,
      turns: s.turns.map((turn) =>
        turn.answer?.editContext
          ? { ...turn, answer: { ...turn.answer, editContext: undefined } }
          : turn,
      ),
    }));
  }, [location.key, userId, scheduleTransport?.backend, setSession]);
  useEffect(
    () => () => {
      controller.current?.abort();
      scheduleEdits.close();
    },
    [],
  );
  useEffect(() => {
    if (!editState.task) return;
    const timer = setTimeout(
      () => scheduleEdits.expireTask(),
      Math.max(0, editState.task.expiresAt - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [editState.task]);
  useEffect(() => {
    if (!open || !turns.length) return;
    // Start a completed answer at its question/window, not its last event.
    if (loading) tail.current?.scrollIntoView({ block: "nearest" });
    else latestTurn.current?.scrollIntoView({ block: "start" });
  }, [turns, loading, open]);

  async function send(
    message = draft,
    selection?: { intent: EditIntent; context: EditContext },
    summaryEventId?: string,
  ) {
    const question = message.trim();
    if (!question || sending.current || loading || question.length > 1000)
      return;
    // State alone cannot guard two clicks before React commits the busy render.
    sending.current = true;
    const fresh = focus.current?.current() ? focus.current : undefined;
    focus.current = undefined; // Every new question consumes focus, even if it fails.
    const ticket = scheduleEdits.beginProposal();
    const context = selection?.context ?? ticket.context ?? fresh?.context;
    const cards = choice?.cards ?? fresh?.cards ?? [];
    setChoice(undefined);
    input.current?.focus();
    const pending: Turn = { question };
    const next = [...turns.slice(-11), pending];
    const epoch = generation.current;
    const navigationKey = location.key;
    const readStarted = historyRevision.current;
    setSession({ owner: userId, turns: next });
    setDraft("");
    if (input.current) input.current.style.height = "auto";
    setLoading(true);
    controller.current = new AbortController();
    try {
      let answer = await client.fetch<ScheduleAnswer>("/admin/chef-ai/chat", {
        method: "POST",
        signal: controller.current.signal,
        body: summaryEventId
          ? { summarySelection: { eventId: summaryEventId } }
          : selection
            ? { selection, ...(page.surface !== "generic" ? { page } : {}) }
            : {
                message: question,
                ...(page.surface !== "generic" ? { page } : {}),
                ...(context ? { context } : {}),
                ...(ticket.task ? { task: ticket.task } : {}),
              },
      });
      if (epoch !== generation.current || navigationKey !== navigation.current)
        return;
      if (!ticket.current()) {
        answer =
          answer.editProposal || answer.editClarification || answer.editTask
            ? {
                entries: [],
                message:
                  "That proposal was discarded because the event selection or editor changed. Ask again to prepare a new preview.",
              }
            : { ...answer, editContext: undefined };
      }
      if (answer.editClarification && ticket.current()) {
        setChoice({
          ...answer.editClarification,
          cards: answer.editClarification.cards ?? cards,
          current: ticket.current,
        });
      }
      if (
        answer.complete &&
        answer.editContext &&
        ticket.current() &&
        historyRevision.current === readStarted
      )
        focus.current = {
          context: answer.editContext,
          cards: answer.entries,
          current: ticket.current,
        };
      scheduleEdits.retainTask(answer.editTask, ticket.current);
      if (epoch === generation.current)
        setSession((s) => ({
          ...s,
          turns: s.turns.map((turn) =>
            turn === pending
              ? {
                  question,
                  answer: {
                    ...answer,
                    editContext: undefined,
                    editTask: undefined,
                    editClarification: undefined,
                  },
                  historicalIds: [...changed.current]
                    .filter(([, at]) => at > readStarted)
                    .map(([id]) => id),
                }
              : turn,
          ),
        }));
      if (answer.editProposal && ticket.current()) {
        const applied = await scheduleEdits.propose(
          answer.editProposal,
          ticket.current,
        );
        if (!applied && epoch === generation.current)
          setSession((s) => ({
            ...s,
            turns: s.turns.map((turn) =>
              turn.question === question &&
              turn.answer?.editProposal === answer.editProposal
                ? {
                    ...turn,
                    answer: {
                      entries: [],
                      message:
                        "Recover the existing attempted change for this event before proposing another.",
                    },
                  }
                : turn,
            ),
          }));
      }
    } catch (error) {
      if (
        controller.current.signal.aborted ||
        epoch !== generation.current ||
        navigationKey !== navigation.current
      )
        return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        generation.current++;
        if (status === 401) scheduleEdits.clearIdentity();
        setSession({
          owner: userId,
          turns: [
            {
              question: "Sous Chef access",
              error:
                "Sous Chef is unavailable. Sign in again or ask the site operator to check single-store configuration.",
            },
          ],
        });
      } else {
        const messages: Record<number, string> = {
          400: "Please shorten your question to 1–1000 characters.",
          422: "Set a valid business timezone in Settings → Availability to use Sous Chef.",
          429: "The Sous Chef request limit has been reached. Please try again later.",
          503: "Sous Chef is not configured yet. Ask the site operator to configure the model provider.",
        };
        setSession((s) => ({
          ...s,
          turns: s.turns.map((turn) =>
            turn === pending
              ? {
                  question,
                  error:
                    messages[status || 0] ||
                    "The schedule read could not be completed. Information is missing. Please retry or open the calendar.",
                }
              : turn,
          ),
        }));
      }
    } finally {
      sending.current = false;
      setLoading(false);
    }
  }

  async function onReceipt(receipt: ScheduleReceipt, current: () => boolean) {
    const id = receipt.outcome.eventId;
    if (!current()) return;
    focus.current = undefined;
    changed.current.set(id, ++historyRevision.current);
    setSession((s) => ({
      ...s,
      turns: s.turns.map((turn) =>
        turn.answer
          ? {
              ...turn,
              historicalIds: [...new Set([...(turn.historicalIds || []), id])],
            }
          : turn,
      ),
    }));
    // The receipt is historical proof, never a replacement for live query data.
    await queryClient.invalidateQueries(
      { queryKey: ["chef-events"] },
      { throwOnError: true },
    );
    if (!current()) return;
    const last = [...sessionRef.current.turns]
      .reverse()
      .find((turn) => turn.answer?.range)?.answer;
    const result = await client.fetch<{ chefEvent: LiveSchedule }>(
      `/admin/chef-events/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
    const record = result.chefEvent;
    if (
      !record ||
      ["requestedDate", "requestedTime", "timeZone", "status"].some(
        (field) => typeof record[field as keyof LiveSchedule] !== "string",
      )
    )
      throw new Error("Current view unavailable");
    const live: LiveSchedule = {
      requestedDate: record.requestedDate,
      requestedTime: record.requestedTime,
      timeZone: record.timeZone,
      status: record.status,
    };
    if (!current()) return;
    if (!last?.range) return live;
    const readStarted = historyRevision.current;
    const calendar = await client.fetch<CalendarResult>(
      "/admin/chef-workspace/calendar",
      {
        method: "GET",
        query: { start: last.range.start, end: last.range.end },
      },
    );
    if (
      !calendar.complete ||
      !Array.isArray(calendar.entries) ||
      calendar.entries.length > 100 ||
      calendar.entries.some((entry) => entry.protectedTime.length > 20)
    )
      throw new Error("Current view unavailable");
    if (current())
      setSession((s) => ({
        ...s,
        turns: [
          ...s.turns.slice(-11),
          {
            question: "Refreshed schedule",
            answer: {
              ...last,
              ...calendar,
              // Calendar refresh does not issue authoritative edit revisions.
              editContext: undefined,
              message:
                "Current recorded schedule. Pending slots are not reserved.",
            },
            historicalIds: [...changed.current]
              .filter(([, at]) => at > readStarted)
              .map(([id]) => id),
          },
        ],
      }));
    return live;
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          focus.current = undefined;
          scheduleEdits.close();
        }
      }}
      modal={false}
    >
      <TooltipProvider>
        <Tooltip content="Ask Sous Chef" side="left">
          <Dialog.Trigger asChild>
            <IconButton
              variant="primary"
              className="chef-chat-launcher fixed z-40 shadow-elevation-flyout"
              aria-label="Ask Sous Chef"
              aria-describedby={
                Object.values(editState.attempts).some((a) => !a.result)
                  ? "chef-chat-review-hint"
                  : undefined
              }
            >
              <SousChefIcon />
              {Object.values(editState.attempts).some((a) => !a.result) && (
                <span
                  className="bg-ui-tag-orange-icon absolute right-0 top-0 h-2 w-2 rounded-full"
                  aria-hidden="true"
                />
              )}
            </IconButton>
          </Dialog.Trigger>
        </Tooltip>
      </TooltipProvider>
      <span id="chef-chat-review-hint" className="sr-only">
        Previous change to check
      </span>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            const selected = scheduleEdits.snapshot().selection;
            if (
              !selected &&
              !scheduleEdits.snapshot().task &&
              !choice?.current()
            )
              return;
            event.preventDefault();
            scheduleEdits.close();
            if (!selected) input.current?.focus();
            [
              ...document.querySelectorAll<HTMLButtonElement>(
                "[data-schedule-event]",
              ),
            ]
              .find((el) => el.dataset.scheduleEvent === selected?.eventId)
              ?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          className={`chef-chat-panel ${expanded ? "chef-chat-expanded" : ""} bg-ui-bg-base border-ui-border-base text-ui-fg-base shadow-elevation-modal fixed z-50 flex flex-col overflow-hidden rounded-xl border`}
        >
          <div className="border-ui-border-base flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className="bg-ui-bg-subtle text-ui-fg-subtle shadow-borders-base flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                aria-hidden="true"
              >
                <SousChefIcon />
              </span>
              <div>
                <Dialog.Title className="text-sm font-medium">
                  Sous Chef
                </Dialog.Title>
                <Dialog.Description className="text-ui-fg-muted mt-0.5 text-xs">
                  Schedule assistant · confirm changes yourself
                </Dialog.Description>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                type="button"
                variant="transparent"
                size="small"
                title={expanded ? "Collapse Sous Chef" : "Expand Sous Chef"}
                className="chef-chat-expand"
                aria-label={
                  expanded ? "Collapse Sous Chef" : "Expand Sous Chef"
                }
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <CaretMinimizeDiagonal />
                ) : (
                  <CaretMaximizeDiagonal />
                )}
              </IconButton>
              <Dialog.Close asChild>
                <IconButton
                  size="small"
                  variant="transparent"
                  aria-label="Close Sous Chef"
                >
                  <XMark />
                </IconButton>
              </Dialog.Close>
            </div>
          </div>
          <div
            role="log"
            aria-label="Schedule conversation"
            aria-live="polite"
            aria-relevant="additions text"
            className="chef-chat-log min-h-0 flex-1 flex flex-col gap-3 overflow-y-auto overscroll-contain break-words px-4 py-3 text-sm"
          >
            {!turns.length && (
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <h2 className="text-ui-fg-base text-lg font-medium">
                    What can I help you with?
                  </h2>
                  <p className="text-ui-fg-subtle text-sm leading-relaxed">
                    Check your schedule or adjust a pending event. You review
                    every change before it’s saved.
                  </p>
                </div>
                <div
                  className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"
                  aria-label="Suggested schedule questions"
                >
                  {suggestions.map(({ label, hint, question }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={question}
                      disabled={loading}
                      onClick={() => void send(question)}
                      className="border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-subtle-hover focus-visible:shadow-borders-focus flex items-start gap-2.5 rounded-lg border p-3 text-left outline-none disabled:opacity-50"
                    >
                      <Calendar
                        className="text-ui-fg-muted mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="text-ui-fg-base block text-sm font-medium">
                          {label}
                        </span>
                        <span className="text-ui-fg-subtle mt-1 block text-xs leading-relaxed">
                          {hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.length > 3 && (
              <button
                type="button"
                className="text-ui-fg-subtle text-xs underline"
                onClick={() => setShowEarlier((value) => !value)}
              >
                {showEarlier
                  ? "Hide earlier messages"
                  : `Show ${turns.length - 3} earlier messages`}
              </button>
            )}
            {turns.map((turn, i) => (
              <div
                hidden={!showEarlier && i < turns.length - 3}
                key={i}
                ref={i === turns.length - 1 ? latestTurn : undefined}
                className="space-y-3"
              >
                <p className="chef-chat-message chef-chat-message-user bg-ui-bg-interactive text-ui-fg-on-color whitespace-pre-wrap">
                  <span className="sr-only">You: </span>
                  {turn.question}
                </p>
                {(turn.answer || turn.error) && (
                  <div className="chef-chat-message chef-chat-message-assistant bg-ui-bg-subtle border-ui-border-base border">
                    <span className="sr-only">Sous Chef: </span>
                    {turn.answer && (
                      <Answer
                        answer={turn.answer}
                        chooseSummary={(id, title) =>
                          void send(`Tell me about ${title}`, undefined, id)
                        }
                        historicalIds={turn.historicalIds}
                        currentContext={
                          i === turns.length - 1 && !turn.historicalIds?.length
                            ? focus.current?.context
                            : undefined
                        }
                        close={() => {
                          scheduleEdits.close();
                          setOpen(false);
                        }}
                      />
                    )}
                    {turn.error && (
                      <p role="alert" className="text-ui-fg-error">
                        {turn.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <p
                role="status"
                className="chef-chat-message chef-chat-message-assistant bg-ui-bg-subtle border-ui-border-base text-ui-fg-subtle border"
              >
                <span className="sr-only">Sous Chef: </span>
                Checking your request…
              </p>
            )}
            <div className="mt-auto space-y-2">
              {(editState.task || choice?.current()) && (
                <section
                  aria-label="Active schedule task"
                  className="border-ui-border-base bg-ui-bg-subtle rounded-lg border p-3 space-y-2"
                >
                  {editState.task && (
                    <div
                      className="flex items-center justify-between gap-2 text-xs"
                      aria-label="Unfinished schedule change"
                    >
                      <span>
                        {editState.task.intent.time
                          ? `Proposed arrival ${editState.task.intent.time}`
                          : "Date/time change"}{" "}
                        · awaiting details
                      </span>
                      <Button
                        type="button"
                        size="small"
                        variant="transparent"
                        onClick={() => {
                          scheduleEdits.close();
                          input.current?.focus();
                        }}
                      >
                        Cancel change
                      </Button>
                    </div>
                  )}
                  {choice && choice.current() && (
                    <section
                      aria-label="Choose event for proposed change"
                      className="space-y-2"
                    >
                      {choice.context.candidates.map((candidate) => {
                        const shortId = choice.context.candidates.some(
                          (other) =>
                            other.id !== candidate.id &&
                            other.id.slice(-8) === candidate.id.slice(-8),
                        )
                          ? candidate.id
                          : candidate.id.slice(-8);
                        const verified = choice.targets?.find(
                          (target) => target.id === candidate.id,
                        );
                        const card = choice.cards.find(
                          (card) => card.source.id === candidate.id,
                        );
                        return (
                          <div
                            key={candidate.id}
                            className="border-ui-border-base rounded-lg border p-2 space-y-1"
                          >
                            <p>
                              {verified?.title ?? card?.title ?? "Event"} ·{" "}
                              {verified?.status ??
                                card?.status ??
                                "Review required"}
                            </p>
                            {verified && (
                              <p className="text-xs">
                                {new Intl.DateTimeFormat(undefined, {
                                  timeZone: verified.timezone,
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }).format(new Date(verified.instant))}
                              </p>
                            )}
                            <p className="text-ui-fg-muted text-xs break-all">
                              Event ID:{" "}
                              <span title={candidate.id}>
                                {verified ? shortId : candidate.id}
                              </span>
                            </p>
                            <Button
                              type="button"
                              size="small"
                              variant="secondary"
                              disabled={loading}
                              data-proposal-candidate={candidate.id}
                              aria-label={
                                verified
                                  ? `Choose ${verified.title} (${candidate.id})`
                                  : undefined
                              }
                              onClick={() => {
                                if (choice.current())
                                  void send(
                                    "Proposed change for selected event",
                                    {
                                      intent: choice.intent,
                                      context: {
                                        ...choice.context,
                                        selectedId: candidate.id,
                                      },
                                    },
                                  );
                              }}
                            >
                              Choose this event
                            </Button>
                          </div>
                        );
                      })}
                    </section>
                  )}
                </section>
              )}
              <ScheduleEditPanel
                onReceipt={onReceipt}
                closeChat={() => {
                  scheduleEdits.close();
                  setOpen(false);
                }}
              />
            </div>
            <div ref={tail} />
          </div>
          <form
            className="border-ui-border-base shrink-0 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="chef-schedule-question" className="sr-only">
              Schedule question
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="chef-schedule-question"
                ref={input}
                className="max-h-28 min-h-0 flex-1 resize-none"
                rows={1}
                maxLength={1000}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  event.target.style.height = "auto";
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
                }}
                placeholder="Ask about events or propose a change…"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />

              <Button
                type="submit"
                size="small"
                disabled={!draft.trim() || loading}
                aria-label="Send"
              >
                {loading ? "Checking…" : "Send"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
