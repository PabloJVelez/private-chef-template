import { Button, IconButton, Textarea } from "@medusajs/ui";
import { ChatBubble, XMark } from "@medusajs/icons";
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

function Answer({
  answer,
  close,
}: {
  answer: ScheduleAnswer;
  close: () => void;
}) {
  const zone = answer.timeZone;
  return (
    <div className="space-y-3">
      <p>{answer.message}</p>
      {answer.range && zone && (
        <p className="text-ui-fg-subtle text-xs">
          {interval(answer.range, zone)} · {zone}. Window start included; end
          excluded.
        </p>
      )}
      {answer.entries.map((event) => (
        <article
          key={event.id}
          className="border-ui-border-base bg-ui-bg-base space-y-2 rounded-lg border p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={event.detailPath}
              onClick={close}
              className="text-ui-fg-interactive font-medium underline underline-offset-2"
            >
              {event.title}
            </Link>
            <span className="bg-ui-bg-subtle text-ui-fg-subtle rounded px-2 py-0.5 text-xs">
              {event.status === "pending"
                ? "Pending request"
                : event.status === "cancelled"
                  ? "Cancelled event"
                  : `${event.status === "confirmed" ? "Confirmed" : "Completed"} appointment`}
            </span>
          </div>
          <p className="text-ui-fg-subtle">{event.category}</p>
          <dl className="space-y-1 text-xs">
            <div>
              <dt className="font-medium">Requested / display time</dt>
              <dd>{interval(event.displayTime, zone!)}</dd>
            </div>
            <div>
              <dt className="font-medium">Appointment</dt>
              <dd>
                {event.appointmentTime
                  ? interval(event.appointmentTime, zone!)
                  : "No appointment recorded"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Scheduling protection</dt>
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
          </dl>
        </article>
      ))}
      {!!answer.entries.length && (
        <p className="text-ui-fg-muted text-xs">
          Display duration may be an estimate. Protection is reported
          separately. Google busy data is not included in this read.
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
  const tail = useRef<HTMLDivElement>(null);
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
    if (open) tail.current?.scrollIntoView({ block: "nearest" });
  }, [turns, loading, open]);

  async function send() {
    const question = draft.trim();
    if (!question || loading || question.length > 1000) return;
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
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <Button
          variant="secondary"
          className="fixed bottom-4 right-4 z-40 gap-2 shadow-elevation-flyout"
          aria-label="Open schedule chat"
        >
          <ChatBubble /> Schedule chat
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          className="bg-ui-bg-base border-ui-border-base text-ui-fg-base shadow-elevation-modal fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border"
          style={{ maxHeight: "min(640px, calc(100dvh - 2rem))" }}
        >
          <div className="border-ui-border-base flex items-start justify-between gap-3 border-b p-4">
            <div>
              <Dialog.Title className="font-medium">
                Chef schedule assistant
              </Dialog.Title>
              <Dialog.Description className="text-ui-fg-subtle mt-1 text-xs">
                Read-only schedule facts. Include a date or period in each question. History clears on refresh or logout.
              </Dialog.Description>
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
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm"
          >
            {!turns.length && (
              <div className="space-y-3">
                <p>
                  Ask what’s recorded on your schedule. I’ll distinguish
                  requests, appointments and protected intervals.
                </p>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setDraft("What's on my schedule this week?")}
                >
                  This week
                </Button>{" "}
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setDraft("What do I have this weekend?")}
                >
                  This weekend
                </Button>
                <p className="text-ui-fg-muted text-xs">
                  Questions go to the configured AI provider. Avoid including
                  customer contact details.
                </p>
              </div>
            )}
            {turns.map((turn, i) => (
              <div key={i} className="space-y-3">
                <p className="bg-ui-bg-subtle whitespace-pre-wrap break-words rounded-lg p-3">
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
            className="border-ui-border-base space-y-2 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="chef-schedule-question" className="sr-only">
              Schedule question
            </label>
            <Textarea
              id="chef-schedule-question"
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
              >
                Send
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
