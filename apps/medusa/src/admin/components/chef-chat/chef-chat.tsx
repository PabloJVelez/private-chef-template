import { Badge, Button, IconButton, Textarea } from "@medusajs/ui";
import { Calendar, ChatBubble, XMark } from "@medusajs/icons";
import { Dialog } from "radix-ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Link, useLocation } from "react-router-dom";
import type { Client } from "@medusajs/js-sdk";
import type { ScheduleAnswer } from "../../../lib/chef-ai/contracts";
import type { TimeInterval } from "../../../lib/chef-workspace/contracts";

type Turn = { question: string; answer?: ScheduleAnswer; error?: string };
type Session = { owner: string; turns: Turn[] };
const empty: Session = { owner: "", turns: [] };
const Context = createContext<{
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  generation: React.MutableRefObject<number>;
} | null>(null);

export function ChefChatSession({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session>(empty);
  const generation = useRef(0);
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
          setSession(empty);
        }
      }),
    [queryClient, session.owner],
  );
  return (
    <Context.Provider value={{ session, setSession, generation }}>
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
    timeZoneName: "short",
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
    timeZoneName: "short",
  }).formatRange(new Date(time.start), new Date(time.end));
}

function Answer({
  answer,
  close,
}: {
  answer: ScheduleAnswer;
  close: () => void;
}) {
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
          <p className="text-ui-fg-muted text-xs">
            {zone} · Start included, end excluded
          </p>
        </div>
      )}
      <p className="text-ui-fg-subtle text-xs leading-relaxed">
        {answer.message}
      </p>
      <div className="space-y-2">
        {answer.entries.map((event) => {
          const status = statuses[event.status];
          return (
            <article
              key={event.id}
              className="border-ui-border-base bg-ui-bg-base rounded-lg border p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Badge size="xsmall" color={status.color}>
                  {status.label}
                </Badge>
                <span className="text-ui-fg-muted min-w-0 max-w-full break-words text-xs">
                  {event.category.replace(/_/g, " ")}
                </span>
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
                  {event.appointmentTime ? "Appointment" : "Display time"}
                  :{" "}
                </span>
                {compactInterval(
                  event.appointmentTime ?? event.displayTime,
                  zone!,
                )}
              </p>
              <details className="text-ui-fg-subtle mt-2 text-xs">
                <summary
                  aria-label={`Details for ${event.title}`}
                  className="hover:text-ui-fg-base focus-visible:shadow-borders-focus w-fit cursor-pointer rounded-sm outline-none"
                >
                  Details
                </summary>
                <dl className="border-ui-border-base mt-2 space-y-2 border-t pt-2 leading-relaxed">
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
                      Recorded category / timezone
                    </dt>
                    <dd>
                      {event.category} · {event.timeZone}
                    </dd>
                  </div>
                </dl>
              </details>
            </article>
          );
        })}
      </div>
      {!!answer.entries.length && (
        <p className="text-ui-fg-muted text-xs leading-relaxed">
          Display times may be estimates. Details show appointment and
          protection separately. Google busy data is not included.
        </p>
      )}
    </div>
  );
}

export function ChefChat({
  userId,
  client,
}: {
  userId: string;
  client: Pick<Client, "fetch">;
}) {
  const { session, setSession, generation } = useContext(Context)!;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController>();
  const sending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const turns = session.owner === userId ? session.turns : [];
  useEffect(() => {
    if (session.owner !== userId) setSession({ owner: userId, turns: [] });
  }, [session.owner, userId, setSession]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open || !turns.length) return;
    // Start a completed answer at its question/window, not its last event.
    if (loading) tail.current?.scrollIntoView({ block: "nearest" });
    else latestTurn.current?.scrollIntoView({ block: "start" });
  }, [turns, loading, open]);

  async function send(message = draft) {
    const question = message.trim();
    if (!question || sending.current || loading || question.length > 1000)
      return;
    // State alone cannot guard two clicks before React commits the busy render.
    sending.current = true;
    input.current?.focus();
    const next = [...turns.slice(-11), { question }];
    const epoch = generation.current;
    setSession({ owner: userId, turns: next });
    setDraft("");
    setLoading(true);
    controller.current = new AbortController();
    try {
      const answer = await client.fetch<ScheduleAnswer>("/admin/chef-ai/chat", {
        method: "POST",
        signal: controller.current.signal,
        body: {
          message: question,
        },
      });
      if (epoch === generation.current)
        setSession({
          owner: userId,
          turns: [...next.slice(0, -1), { question, answer }],
        });
    } catch (error) {
      if (controller.current.signal.aborted || epoch !== generation.current)
        return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        generation.current++;
        setSession({
          owner: userId,
          turns: [
            {
              question: "Schedule chat access",
              error:
                "Your session or schedule chat permission could not be verified. Sign in again or ask the site operator to configure access.",
            },
          ],
        });
      } else {
        const messages: Record<number, string> = {
          400: "Please shorten your question to 1–1000 characters.",
          422: "Set a valid business timezone in Settings → Availability to use schedule chat.",
          429: "The schedule chat request limit has been reached. Please try again later.",
          503: "Schedule chat is not configured yet. Ask the site operator to configure the model provider.",
        };
        setSession({
          owner: userId,
          turns: [
            ...next.slice(0, -1),
            {
              question,
              error:
                messages[status || 0] ||
                "The schedule read could not be completed. Information is missing. Please retry or open the calendar.",
            },
          ],
        });
      }
    } finally {
      sending.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <Button
          variant="secondary"
          className="fixed z-40 gap-2 shadow-elevation-flyout"
          style={{
            right: "max(1rem, env(safe-area-inset-right))",
            bottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          aria-label="Open schedule chat"
        >
          <ChatBubble /> Schedule chat
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          className="bg-ui-bg-base border-ui-border-base text-ui-fg-base shadow-elevation-modal fixed z-50 flex flex-col overflow-hidden rounded-xl border"
          style={{
            right: "max(1rem, env(safe-area-inset-right))",
            bottom: "max(1rem, env(safe-area-inset-bottom))",
            width:
              "min(490px, calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right)))",
            maxHeight:
              "min(740px, 75dvh, calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))",
          }}
        >
          <div className="border-ui-border-base flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className="bg-ui-bg-subtle text-ui-fg-subtle shadow-borders-base flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                aria-hidden="true"
              >
                <ChatBubble />
              </span>
              <div>
                <Dialog.Title className="text-sm font-medium">
                  Chef schedule assistant
                </Dialog.Title>
                <Dialog.Description className="text-ui-fg-muted mt-0.5 text-xs">
                  Read-only · Here to help you plan your day
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <IconButton
                size="small"
                variant="transparent"
                aria-label="Close schedule chat"
              >
                <XMark />
              </IconButton>
            </Dialog.Close>
          </div>
          <div
            role="log"
            aria-label="Schedule conversation"
            aria-live="polite"
            aria-relevant="additions text"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain break-words px-5 py-4 text-sm"
          >
            {!turns.length && (
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <h2 className="text-ui-fg-base text-lg font-medium">
                    What would you like to know?
                  </h2>
                  <p className="text-ui-fg-subtle text-sm leading-relaxed">
                    See your recorded requests and appointments, with the
                    details close at hand.
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
                <p className="text-ui-fg-muted text-xs leading-relaxed">
                  Questions go to the AI provider. Leave out customer contact
                  details.
                </p>
              </div>
            )}
            {turns.map((turn, i) => (
              <div
                key={i}
                ref={i === turns.length - 1 ? latestTurn : undefined}
                className="space-y-3"
              >
                <p className="bg-ui-bg-subtle ml-6 whitespace-pre-wrap break-words rounded-lg px-3 py-2.5">
                  <span className="sr-only">You: </span>
                  {turn.question}
                </p>
                {turn.answer && (
                  <Answer answer={turn.answer} close={() => setOpen(false)} />
                )}
                {turn.error && (
                  <p role="alert" className="text-ui-fg-error">
                    {turn.error}
                  </p>
                )}
              </div>
            ))}
            {loading && (
              <p role="status" className="text-ui-fg-subtle">
                Reading your recorded schedule…
              </p>
            )}
            <div ref={tail} />
          </div>
          <form
            className="border-ui-border-base shrink-0 space-y-2.5 border-t px-5 pb-4 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <label
                htmlFor="chef-schedule-question"
                className="text-ui-fg-subtle font-medium"
              >
                Schedule question
              </label>
              <span id="chef-schedule-hint" className="text-ui-fg-muted">
                Include a date or period each time
              </span>
            </div>
            <Textarea
              id="chef-schedule-question"
              ref={input}
              aria-describedby="chef-schedule-hint"
              className="max-h-24 min-h-0 resize-none"
              rows={2}
              maxLength={1000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What’s on my schedule tomorrow?"
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-ui-fg-muted text-xs">
                Recorded events don’t establish availability.
              </span>
              <Button
                type="submit"
                size="small"
                disabled={!draft.trim() || loading}
                aria-label="Send"
              >
                {loading ? "Reading…" : "Send"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
