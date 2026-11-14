/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
jest.mock("../../admin/components/chef-chat/chef-chat.css", () => ({}));
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ChefChat,
  ChefChatSession,
} from "../../admin/components/chef-chat/chef-chat";
import { scheduleEdits } from "../../admin/components/chef-chat/schedule-edit-state";
import { ScheduleTransportError } from "../../admin/components/chef-chat/schedule-edit-transport";
import type {
  SchedulePreview,
  ScheduleReceipt,
} from "../../admin/components/chef-chat/schedule-edit-transport";
const op = "00000000-0000-4000-8000-000000000001";
const local = {
  date: "2030-03-09",
  time: "11:00",
  timezone: "America/New_York",
  instant: "2030-03-09T16:00:00.000Z",
};
const previewFor = (eventId = "immutable-0"): SchedulePreview => ({
  reference: "signed-reference-not-chat-content",
  operationId: op,
  eventId,
  expectedRevision: "a".repeat(32),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  current: { ...local, time: "10:00", instant: "2030-03-09T15:00:00.000Z" },
  proposed: local,
  reserved: false,
  googleAvailability: "advisory",
});
const result: ScheduleReceipt = {
  outcome: {
    ...local,
    operationId: op,
    eventId: "immutable-0",
    outcome: "saved",
    committedRevision: "b".repeat(32),
  },
  historical: true,
  reserved: false,
  googleSync: "requested",
};
const interval = {
  start: "2030-03-09T15:00:00.000Z",
  end: "2030-03-09T17:00:00.000Z",
};
const entries = [
  "pending",
  "pending",
  "confirmed",
  "cancelled",
  "completed",
].map((status, i) => ({
  id: `private-event:presentation-${i}`,
  source: { type: "private-event", id: `immutable-${i}` },
  status,
  title: "Identical event",
  detailPath: `/chef-events/immutable-${i}`,
  category: "dinner",
  timeZone: local.timezone,
  displayTime: interval,
  requestedTime: interval,
  appointmentTime: null,
  protectedTime: [],
}));
const answer = {
  message: "Recorded schedule",
  entries,
  timeZone: local.timezone,
  range: { start: "2030-03-09T00:00:00.000Z", end: "2030-03-10T00:00:00.000Z" },
  complete: true,
};
function buttons(label: string) {
  return [...document.querySelectorAll("button")].filter(
    (el) => el.textContent === label || el.getAttribute("aria-label") === label,
  );
}
async function click(label: string, index = 0) {
  await act(async () => {
    const b = buttons(label)[index];
    expect(b).toBeDefined();
    b.click();
  });
}
async function value(type: string, value: string) {
  await act(async () => {
    const input = document.querySelector(`input[type="${type}"]`)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fixture(
  run: (f: {
    fetch: jest.Mock;
    preview: jest.Mock;
    attempt: jest.Mock;
    qc: QueryClient;
    remount: () => Promise<void>;
  }) => Promise<void>,
) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  sessionStorage.clear();
  scheduleEdits.clearIdentity();
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["users", "me"], { user: { id: "A" } });
  const fetch = jest.fn().mockImplementation(async (path: string) =>
    path === "/admin/chef-ai/chat"
      ? answer
      : path === "/admin/chef-workspace/calendar"
        ? {
            ...answer,
            entries: [
              {
                ...entries[0],
                displayTime: {
                  start: "2030-03-09T17:00:00.000Z",
                  end: "2030-03-09T18:00:00.000Z",
                },
              },
            ],
          }
        : {
            chefEvent: {
              requestedDate: "2030-03-09T17:00:00.000Z",
              requestedTime: "12:00",
              timeZone: local.timezone,
              status: "pending",
            },
          },
  );
  const preview = jest
    .fn()
    .mockImplementation(async ({ eventId }) => previewFor(eventId));
  const attempt = jest.fn().mockResolvedValue(result);
  const transport = { backend: "https://backend.fixture", preview, attempt };
  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(
              ChefChatSession,
              null,
              React.createElement(
                Link,
                { to: "/chef-events/immutable-1" },
                "Open event B",
              ),
              React.createElement(ChefChat, {
                userId: "A",
                client: { fetch },
                scheduleTransport: transport,
              }),
            ),
          ),
        ),
      ),
    );
  };
  const remount = async () => {
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
  };
  try {
    await render();
    await click("Ask Sous Chef");
    await run({ fetch, preview, attempt, qc, remount });
  } finally {
    await act(async () => root.unmount());
    qc.clear();
    host.remove();
    scheduleEdits.clearIdentity();
  }
}
async function ready() {
  await click("What's on my schedule today?");
  await click("Change date/time");
  await value("time", "11:00");
  await click("Preview");
}
it("distinct same-looking cards use source ids; unsupported statuses have no control and form opening makes no preview", async () => {
  await fixture(async ({ preview, attempt }) => {
    await click("What's on my schedule today?");
    expect(buttons("Change date/time")).toHaveLength(2);
    await click("Change date/time", 1);
    expect(preview).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      document.querySelector('input[type="date"]'),
    );
    await value("date", "2030-03-10");
    await click("Preview");
    expect(preview).toHaveBeenLastCalledWith(
      { eventId: "immutable-1", date: "2030-03-10" },
      expect.any(Function),
    );
    await click("Change date/time", 0);
    await value("time", "11:00");
    await click("Preview");
    expect(preview).toHaveBeenLastCalledWith(
      { eventId: "immutable-0", time: "11:00" },
      expect.any(Function),
    );
    expect(attempt).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("America/New_York");
    expect(document.body.textContent).not.toContain(
      "signed-reference-not-chat-content",
    );
    await act(async () =>
      document
        .querySelector('form[aria-label="Change event date and time"]')!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(attempt).not.toHaveBeenCalled(); // Enter only submits Preview.
  });
});
it("explicit confirm once invalidates chef-events prefix and labels historical cards without repainting later live values", async () => {
  await fixture(async ({ attempt, qc }) => {
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    await ready();
    await act(async () => {
      const b = buttons("Confirm change")[0];
      b.click();
      b.click();
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(
      "confirm",
      "signed-reference-not-chat-content",
      expect.any(Function),
    );
    expect(invalidate).toHaveBeenCalledWith(
      { queryKey: ["chef-events"] },
      { throwOnError: true },
    );
    expect(document.body.textContent).toContain("Historical schedule snapshot");
    expect(document.body.textContent).toContain("Historical operation result");
    expect(document.body.textContent).toContain("12:00");
    expect(document.body.textContent).toContain("11:00");
    expect(document.body.textContent).not.toContain("Google");
    expect(document.body.textContent).not.toContain("UTC");
    expect(document.body.textContent).toContain("Refreshed schedule");
    expect(document.querySelectorAll("article")[0].textContent).toContain(
      "Historical schedule snapshot",
    );
    expect(
      [...document.querySelectorAll("article")].at(-1)!.textContent,
    ).not.toContain("Historical schedule snapshot");
    await click("Done");
    expect(sessionStorage.length).toBe(0);
  });
});
it("saved remains saved when current view refetch fails", async () => {
  await fixture(async ({ fetch }) => {
    await ready();
    fetch.mockRejectedValueOnce(new Error("read failed"));
    await click("Confirm change");
    expect(document.body.textContent).toContain("remains SAVED");
    expect(document.body.textContent).not.toContain("Outcome unknown");
  });
});
it("response lost, empty-chat remount and explicit recover use the exact original reference", async () => {
  await fixture(async ({ attempt, remount }) => {
    await ready();
    attempt.mockRejectedValueOnce(new Error("lost"));
    await click("Confirm change");
    expect(document.body.textContent).toContain("Outcome unknown");
    await remount();
    expect(attempt).toHaveBeenCalledTimes(1);
    await click("Ask Sous Chef");
    expect(document.body.textContent).toContain("What can I help you with?");
    const recovery = document.querySelector(
      'details[aria-label="Schedule change outcome"]',
    ) as HTMLDetailsElement;
    expect(recovery.open).toBe(false);
    expect(recovery.querySelector("summary")?.textContent).toBe(
      "Check previous change",
    );
    expect(document.body.textContent).toContain("Recover outcome");
    expect(document.body.textContent).not.toContain("Identical event");
    await click("Recover outcome");
    expect(attempt.mock.calls[1][0]).toBe("recover");
    expect(attempt.mock.calls[1][1]).toBe("signed-reference-not-chat-content");
    expect(document.body.textContent).toContain("12:00");
  });
});
it("duplicate appearances of the same event share an unresolved operation", async () => {
  await fixture(async ({ attempt, preview }) => {
    await ready();
    attempt.mockResolvedValueOnce({ outcome: "unknown", operationId: op });
    await click("Confirm change");
    await act(async () => {
      const textarea = document.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "today");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Send");
    expect(buttons("Change date/time")).toHaveLength(4);
    await click("Change date/time", 2);
    expect(
      document.querySelector('form[aria-label="Change event date and time"]'),
    ).toBeNull();
    expect(buttons("Recover outcome")).toHaveLength(1);
    expect(preview).toHaveBeenCalledTimes(1);
  });
});
it.each(["preview", "confirm", "recover"])(
  "query-cache logout during %s cannot resurrect data after protected-route remount",
  async (action) => {
    await fixture(async ({ preview, attempt, qc, remount }) => {
      let resolve!: (v: any) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      if (action === "preview") {
        preview.mockReturnValueOnce(pending);
        await click("What's on my schedule today?");
        await click("Change date/time");
        await value("time", "11:00");
        await click("Preview");
      } else {
        await ready();
        if (action === "recover") {
          attempt.mockResolvedValueOnce({
            outcome: "unknown",
            operationId: op,
          });
          await click("Confirm change");
          attempt.mockReturnValueOnce(pending);
          await click("Recover outcome");
        } else {
          attempt.mockReturnValueOnce(pending);
          await click("Confirm change");
        }
      }
      await act(async () => qc.removeQueries({ queryKey: ["users", "me"] }));
      expect(sessionStorage.length).toBe(0);
      await remount();
      await act(async () =>
        resolve(action === "preview" ? previewFor() : result),
      );
      await click("Ask Sous Chef");
      expect(document.body.textContent).not.toContain("Confirm change");
      expect(document.body.textContent).not.toContain("Saved");
      expect(document.body.textContent).not.toContain("Identical event");
    });
  },
);
it("Escape cancels only the inline edit first and returns focus to its event control", async () => {
  await fixture(async () => {
    await ready();
    await act(async () =>
      document.querySelector('input[type="time"]')!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document.querySelector('form[aria-label="Change event date and time"]'),
    ).toBeNull();
    expect(document.activeElement?.textContent).toBe("Change date/time");
  });
});
it("a chat access/config refusal preserves an unresolved schedule attempt", async () => {
  await fixture(async ({ attempt, fetch }) => {
    await ready();
    attempt.mockResolvedValueOnce({ outcome: "unknown", operationId: op });
    await click("Confirm change");
    fetch.mockRejectedValueOnce({ status: 403 });
    await act(async () => {
      const textarea = document.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "today");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Send");
    expect(sessionStorage.length).toBe(1);
    expect(buttons("Recover outcome")).toHaveLength(1);
  });
});
it("a chat read already in flight remains visible but historical when a save completes", async () => {
  await fixture(async ({ fetch }) => {
    await ready();
    let resolve!: (v: unknown) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      const textarea = document.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "concurrent question");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Send");
    await click("Confirm change");
    await act(async () => resolve(answer));
    const log = document.querySelector('[role="log"]')!;
    expect(log.textContent).toContain("concurrent question");
    expect(log.querySelectorAll("article")).toHaveLength(11);
    expect([...log.querySelectorAll("article")][5].textContent).toContain(
      "Historical schedule snapshot",
    );
  });
});
it("current-read refresh preserves the bounded chat result limit after a save", async () => {
  await fixture(async ({ fetch }) => {
    await ready();
    fetch.mockImplementation(async (path: string) =>
      path === "/admin/chef-workspace/calendar"
        ? {
            ...answer,
            entries: Array.from({ length: 101 }, (_, i) => ({
              ...entries[0],
              id: String(i),
            })),
          }
        : {
            chefEvent: {
              requestedDate: local.instant,
              requestedTime: "11:00",
              timeZone: local.timezone,
              status: "pending",
            },
          },
    );
    await click("Confirm change");
    expect(document.body.textContent).toContain("remains SAVED");
    expect(document.querySelectorAll("article")).toHaveLength(5);
  });
});

const moveIntent = {
  target: "context",
  date: { kind: "day_of_month", day: 29 },
  time: null,
  clarification: "none",
};
const conversationalAnswer = (cards = [entries[0]]) => ({
  ...answer,
  entries: cards,
  editContext: {
    candidates: cards.map((card) => ({
      id: card.source.id,
      revision: "a".repeat(32),
    })),
    observedAt: Date.now(),
  },
});
const proposedAnswer = {
  message: "Review the proposed change",
  entries: [],
  editProposal: {
    eventId: "immutable-0",
    expectedRevision: "a".repeat(32),
    date: "2026-11-29",
  },
};
async function ask(message: string) {
  await act(async () => {
    const textarea = document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, message);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Send");
}
it("natural move it to the 29th starts the shared date-only preview without manual form opening or confirmation", async () => {
  await fixture(async ({ fetch, preview, attempt }) => {
    fetch.mockResolvedValueOnce(conversationalAnswer());
    await click("What's on my schedule today?");
    const card = document.querySelector("article")!;
    const editControl = card.querySelector("[data-schedule-event]")!;
    expect(
      editControl.compareDocumentPosition(card.querySelector("details")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(editControl.className).toContain("w-full");
    fetch.mockResolvedValueOnce(proposedAnswer);
    await ask("Can you move it to the 29th?");
    expect(fetch.mock.calls[1][1].body).toMatchObject({
      message: "Can you move it to the 29th?",
      context: {
        candidates: [{ id: "immutable-0", revision: "a".repeat(32) }],
      },
    });
    expect(JSON.stringify(fetch.mock.calls[1][1].body)).not.toContain(
      "Identical event",
    );
    expect(preview).toHaveBeenCalledWith(
      { eventId: "immutable-0", date: "2026-11-29" },
      expect.any(Function),
    );
    expect(
      (document.querySelector('input[type="date"]') as HTMLInputElement).value,
    ).toBe("2026-11-29");
    expect(
      (document.querySelector('input[type="time"]') as HTMLInputElement).value,
    ).toBe("");
    expect(buttons("Confirm change")).toHaveLength(1);
    expect(attempt).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Use the Confirm change button; prose cannot confirm.",
    });
    await ask("yes");
    expect(attempt).not.toHaveBeenCalled();
  });
});
it("two visually identical cards, including a confirmed one, retain the proposal until an exact source-id choice", async () => {
  await fixture(async ({ fetch, preview, attempt }) => {
    const read = conversationalAnswer([entries[0], entries[2]]);
    fetch.mockResolvedValueOnce(read);
    await click("What's on my schedule today?");
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Which event?",
      editClarification: { intent: moveIntent, context: read.editContext },
    });
    await ask("Move it to the 29th");
    expect(preview).not.toHaveBeenCalled();
    expect(
      [...document.querySelectorAll("[data-proposal-candidate]")].map((el) =>
        el.getAttribute("data-proposal-candidate"),
      ),
    ).toEqual(["immutable-0", "immutable-2"]);
    fetch.mockResolvedValueOnce(proposedAnswer);
    await click("Choose this event", 0);
    expect(fetch.mock.calls[2][1].body).toEqual({
      selection: {
        intent: moveIntent,
        context: { ...read.editContext, selectedId: "immutable-0" },
      },
    });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(attempt).not.toHaveBeenCalled();
  });
});
it("explicit current selection takes precedence over a multi-event previous answer", async () => {
  await fixture(async ({ fetch, preview }) => {
    fetch.mockResolvedValueOnce(conversationalAnswer([entries[0], entries[1]]));
    await click("What's on my schedule today?");
    await click("Change date/time", 1);
    expect(preview).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce({
      ...proposedAnswer,
      editProposal: { ...proposedAnswer.editProposal, eventId: "immutable-1" },
    });
    await ask("Move it to the 29th");
    expect(fetch.mock.calls[1][1].body.context.selectedId).toBe("immutable-1");
    expect(preview).toHaveBeenCalledWith(
      { eventId: "immutable-1", date: "2026-11-29" },
      expect.any(Function),
    );
  });
});
it.each(["manual", "event", "close", "navigation", "identity"])(
  "late model response is discarded after %s",
  async (kind) => {
    await fixture(async ({ fetch, preview, qc }) => {
      fetch.mockResolvedValueOnce(
        conversationalAnswer([entries[0], entries[1]]),
      );
      await click("What's on my schedule today?");
      let resolve!: (value: unknown) => void;
      fetch.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      await ask("Move it to the 29th");
      if (kind === "manual") {
        await click("Change date/time");
        await value("time", "12:00");
      }
      if (kind === "event") await click("Change date/time", 1);
      if (kind === "close") await click("Close Sous Chef");
      if (kind === "navigation")
        await act(async () =>
          (
            document.querySelector(
              'a[href="/chef-events/immutable-0"]',
            ) as HTMLAnchorElement
          ).click(),
        );
      if (kind === "identity")
        await act(async () => qc.removeQueries({ queryKey: ["users", "me"] }));
      await act(async () => resolve(proposedAnswer));
      expect(preview).not.toHaveBeenCalled();
      expect(buttons("Confirm change")).toHaveLength(0);
      if (kind === "manual")
        expect(
          (document.querySelector('input[type="time"]') as HTMLInputElement)
            .value,
        ).toBe("12:00");
    });
  },
);
it.each([false, true])(
  "navigation preserves history but discards event A context (late read: %s)",
  async (late) => {
    await fixture(async ({ fetch, preview, attempt }) => {
      fetch.mockResolvedValueOnce(conversationalAnswer());
      await click("What's on my schedule today?");
      let resolve!: (value: unknown) => void;
      if (late) {
        fetch.mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        );
        await ask("Read my schedule again");
      }
      await act(async () => {
        (
          document.querySelector(
            'a[href="/chef-events/immutable-1"]',
          ) as HTMLAnchorElement
        ).click();
      });
      if (late) await act(async () => resolve(conversationalAnswer()));
      await click("Ask Sous Chef");
      expect(document.querySelector('[role="log"]')!.textContent).toContain(
        "Identical event",
      );
      fetch.mockResolvedValueOnce({ entries: [], message: "Which event?" });
      await ask("Move it to the 29th");
      expect(fetch.mock.calls.at(-1)[1].body).toEqual({
        message: "Move it to the 29th",
      });
      expect(preview).not.toHaveBeenCalled();
      expect(attempt).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain("Which event?");
    });
  },
);
it("navigation retains an unresolved attempted write for explicit recovery", async () => {
  await fixture(async ({ attempt }) => {
    await ready();
    attempt.mockRejectedValueOnce(new Error("Lost response"));
    await click("Confirm change");
    const stored = JSON.stringify(sessionStorage);
    const attempts = scheduleEdits.snapshot().attempts;
    await act(async () => {
      (
        document.querySelector(
          'a[href="/chef-events/immutable-1"]',
        ) as HTMLAnchorElement
      ).click();
    });
    expect(scheduleEdits.snapshot().attempts).toEqual(attempts);
    expect(JSON.stringify(sessionStorage)).toBe(stored);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
it.each(["empty", "incomplete", "unrelated", "failed"])(
  "a prior sole-event context is not reused after an intervening %s answer/question",
  async (kind) => {
    await fixture(async ({ fetch }) => {
      fetch.mockResolvedValueOnce(conversationalAnswer());
      await click("What's on my schedule today?");
      if (kind === "failed") fetch.mockRejectedValueOnce({ status: 502 });
      else
        fetch.mockResolvedValueOnce({
          message: "Independent answer",
          entries: [],
          complete:
            kind === "empty" ? true : kind === "incomplete" ? false : undefined,
        });
      await ask("What is on my schedule tomorrow?");
      fetch.mockResolvedValueOnce({ entries: [], message: "Which event?" });
      await ask("Move it to the 29th");
      expect(fetch.mock.calls[2][1].body).toEqual({
        message: "Move it to the 29th",
      });
    });
  },
);
it("refresh/remount and historical results cannot implicitly reselect a previous event", async () => {
  await fixture(async ({ fetch, remount }) => {
    fetch.mockResolvedValueOnce(conversationalAnswer());
    await click("What's on my schedule today?");
    await remount();
    await click("Ask Sous Chef");
    fetch.mockResolvedValueOnce({ entries: [], message: "Which event?" });
    await ask("Move it to the 29th");
    expect(fetch.mock.calls.at(-1)[1].body).toEqual({
      message: "Move it to the 29th",
    });
  });
});
it("preview refusal keeps the proposed form available without guessing an alternate slot", async () => {
  await fixture(async ({ fetch, preview, attempt }) => {
    fetch.mockResolvedValueOnce(conversationalAnswer());
    await click("What's on my schedule today?");
    preview.mockRejectedValueOnce(
      new ScheduleTransportError(
        "policy",
        422,
        "That arrival time is no longer available. Please choose another time.",
      ),
    );
    fetch.mockResolvedValueOnce(proposedAnswer);
    await ask("Move it to the 29th");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "no longer available",
    );
    expect(
      (document.querySelector('input[type="date"]') as HTMLInputElement).value,
    ).toBe("2026-11-29");
    expect(buttons("Confirm change")).toHaveLength(0);
    expect(attempt).not.toHaveBeenCalled();
    await value("date", "2026-12-01");
    await click("Preview");
    expect(preview.mock.calls[1][0]).toEqual({
      eventId: "immutable-0",
      date: "2026-12-01",
    });
  });
});
it("historical cards cannot be reused as implicit conversational context after a save", async () => {
  await fixture(async ({ fetch }) => {
    fetch.mockResolvedValueOnce(conversationalAnswer());
    await ready();
    await click("Confirm change");
    await click("Change date/time", 0); // The old historical card may still open a manual form.
    fetch.mockResolvedValueOnce({ entries: [], message: "Which event?" });
    await ask("Move it to the 29th");
    expect(fetch.mock.calls.at(-1)[1].body).toEqual({
      message: "Move it to the 29th",
    });
  });
});

it("the three owner prompts retain 2 PM only for clarification and prepare time-only previews, never confirmation", async () => {
  await fixture(async ({ fetch, preview, attempt }) => {
    const task = {
      version: 1,
      intent: {
        target: "context",
        targetDate: null,
        date: null,
        time: "14:00",
        clarification: "none",
        continuation: false,
      },
      expiresAt: Date.now() + 300000,
    };
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Which event should I move to 2 PM?",
      editTask: task,
    });
    await ask("can you update the time to 2pm?");
    expect(
      document.querySelector('[aria-label="Unfinished schedule change"]'),
    ).not.toBeNull();
    expect(preview).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Review this change before confirming.",
      editProposal: {
        eventId: "immutable-0",
        expectedRevision: "a".repeat(32),
        time: "14:00",
      },
    });
    await ask("this is for the event on the 30th");
    expect(fetch.mock.calls.at(-1)[1].body).toEqual({
      message: "this is for the event on the 30th",
      task,
    });
    expect(preview.mock.calls.at(-1)[0]).toEqual({
      eventId: "immutable-0",
      time: "14:00",
    });
    expect(
      document.querySelector('[aria-label="Unfinished schedule change"]'),
    ).toBeNull();
    await click("Cancel edit");
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Review this change before confirming.",
      editProposal: {
        eventId: "immutable-0",
        expectedRevision: "a".repeat(32),
        time: "14:00",
      },
    });
    await ask("Can you update the event I have on the 30th to 2pm?");
    expect(fetch.mock.calls.at(-1)[1].body).toEqual({
      message: "Can you update the event I have on the 30th to 2pm?",
    });
    expect(preview).toHaveBeenCalledTimes(2);
    expect(attempt).not.toHaveBeenCalled();
  });
});
it.each(["cancel", "read", "identity", "remount"])(
  "unfinished task cannot resurrect after %s",
  async (kind) => {
    await fixture(async ({ fetch, qc, remount }) => {
      const task = {
        version: 1,
        intent: {
          target: "context",
          date: null,
          time: "14:00",
          clarification: "none",
        },
        expiresAt: Date.now() + 300000,
      };
      fetch.mockResolvedValueOnce({
        entries: [],
        message: "Which event?",
        editTask: task,
      });
      await ask("Update time to 2pm");
      if (kind === "cancel") await click("Cancel change");
      if (kind === "read") {
        fetch.mockResolvedValueOnce({
          entries: [],
          message: "No recorded events.",
          complete: true,
        });
        await ask("What is on tomorrow?");
      }
      if (kind === "identity")
        await act(async () => qc.removeQueries({ queryKey: ["users", "me"] }));
      if (kind === "remount") {
        await remount();
        await click("Ask Sous Chef");
      }
      fetch.mockResolvedValueOnce({
        entries: [],
        message: "No unfinished change.",
      });
      await ask("this is for the event on the 30th");
      expect(fetch.mock.calls.at(-1)[1].body.task).toBeUndefined();
    });
  },
);
it("desktop expand toggle is accessible; composer starts compact and Escape cancels unfinished task first", async () => {
  await fixture(async ({ fetch }) => {
    expect(document.querySelector("textarea")?.rows).toBe(1);
    await click("Expand Sous Chef");
    expect(buttons("Collapse Sous Chef")).toHaveLength(1);
    await click("Collapse Sous Chef");
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Which event?",
      editTask: {
        version: 1,
        intent: {
          target: "context",
          date: null,
          time: "14:00",
          clarification: "none",
        },
        expiresAt: Date.now() + 300000,
      },
    });
    await ask("Update time to 2pm");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(scheduleEdits.snapshot().task).toBeUndefined();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

it("clean preview omits timezone, UTC, sync and provider instructions while retaining explicit confirmation", async () => {
  await fixture(async ({ attempt }) => {
    expect(document.body.textContent).not.toContain("AI provider");
    await ready();
    const text = document.querySelector(
      '[aria-label="Schedule change preview"]',
    )!.textContent!;
    expect(text).toContain("Before");
    expect(text).toContain("After");
    expect(text).toContain("Mar 9, 2030");
    expect(text).toContain("10:00 AM");
    expect(text).toContain("11:00 AM");
    expect(text).toContain("Confirm by");
    for (const removed of ["UTC", "America/", "Google", "2030-03-09T"])
      expect(text).not.toContain(removed);
    expect(buttons("Confirm change")).toHaveLength(1);
    expect(attempt).not.toHaveBeenCalled();
  });
});
it("outside focus dismisses the nonmodal chat and cancels an unused preview", async () => {
  await fixture(async ({ attempt }) => {
    await ready();
    const outside = document.createElement("button");
    outside.textContent = "Dashboard action";
    document.body.appendChild(outside);
    try {
      await act(async () => outside.focus());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(scheduleEdits.snapshot().selection).toBeUndefined();
      expect(attempt).not.toHaveBeenCalled();
    } finally {
      outside.remove();
    }
  });
});
