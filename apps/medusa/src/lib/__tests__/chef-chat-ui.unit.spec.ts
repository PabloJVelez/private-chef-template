/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
jest.mock("../../admin/components/chef-chat/chef-chat.css", () => ({}));
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ChefChat,
  ChefChatSession,
} from "../../admin/components/chef-chat/chef-chat";

it("posts only each latest question while retaining the three questions and distinct answers in the dialog", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const questions = [
    "What's on my schedule this week?",
    "What do I have this weekend?",
    "What is on my schedule on November 16, 2026?",
  ];
  const ranges = [
    { start: "2026-11-09T06:00:00.000Z", end: "2026-11-16T06:00:00.000Z" },
    { start: "2026-11-14T06:00:00.000Z", end: "2026-11-16T06:00:00.000Z" },
    { start: "2026-11-16T06:00:00.000Z", end: "2026-11-17T06:00:00.000Z" },
  ];
  const fetch = jest.fn();
  try {
    await act(async () =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(
              ChefChatSession,
              null,
              React.createElement(ChefChat, {
                userId: "synthetic-admin",
                client: { fetch },
              }),
            ),
          ),
        ),
      ),
    );
    await act(async () => {
      (
        document.querySelector(
          '[aria-label="Ask Sous Chef"]',
        ) as HTMLButtonElement
      ).click();
    });
    for (const [index, question] of questions.entries()) {
      fetch.mockResolvedValueOnce({
        message: `Synthetic response ${index}`,
        range: ranges[index],
        timeZone: "America/Chicago",
        complete: true,
        entries: [],
      });
      await act(async () => {
        const textarea = document.querySelector("textarea")!;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(textarea, question);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        document
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(fetch).toHaveBeenCalledTimes(index + 1);
      expect(fetch.mock.calls[index][0]).toBe("/admin/chef-ai/chat");
      expect(fetch.mock.calls[index][1]).toMatchObject({
        method: "POST",
        body: { message: question },
      });
      expect(fetch.mock.calls[index][1].body).toEqual({ message: question });
      const log = document.querySelector('[role="log"]')!.textContent!;
      for (let previous = 0; previous <= index; previous++) {
        expect(log).toContain(questions[previous]);
        expect(log).toContain(`Synthetic response ${previous}`);
      }
    }
    const log = document.querySelector('[role="log"]')!.textContent!;
    expect(log).toContain("Nov 9, 2026");
    expect(log).toContain("Nov 14, 2026");
    expect(log).toContain("Nov 17, 2026");
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain(questions[0]);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    host.remove();
    HTMLElement.prototype.scrollIntoView = scroll;
  }
});

const promptQuestions = [
  "What's on my schedule today?",
  "What's on my schedule tomorrow?",
  "What's on my schedule this week?",
  "What do I have this weekend?",
];
const emptyAnswer = {
  message:
    "No matching recorded events in this window. This does not mean you are free or available.",
  timeZone: "America/Chicago",
  complete: true,
  entries: [],
  range: { start: "2026-11-13T06:00:00.000Z", end: "2026-11-14T06:00:00.000Z" },
};
async function withChat(fetch: jest.Mock, test: () => Promise<void>) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    await act(async () =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(
              ChefChatSession,
              null,
              React.createElement(ChefChat, {
                userId: "synthetic-admin",
                client: { fetch },
              }),
            ),
          ),
        ),
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      (
        document.querySelector(
          '[aria-label="Ask Sous Chef"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(fetch).not.toHaveBeenCalled();
    await test();
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    host.remove();
    HTMLElement.prototype.scrollIntoView = scroll;
  }
}
function button(label: string) {
  const found = [...document.querySelectorAll("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  );
  expect(found).toBeDefined();
  return found!;
}
async function draft(question: string) {
  await act(async () => {
    const textarea = document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, question);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it.each(promptQuestions)(
  "sends the self-contained quick prompt %s once despite repeated same-tick taps",
  async (question) => {
    let resolve!: (answer: typeof emptyAnswer) => void;
    const fetch = jest.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await withChat(fetch, async () => {
      expect(document.body.textContent).toContain(
        "What can I help you with?",
      );
      expect(button("Ask Sous Chef").textContent).toContain("Ask Sous Chef");
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
        "Schedule assistant",
      );
      expect(document.querySelector("textarea")!.placeholder).toBe(
        "Ask about events or propose a change…",
      );
      expect(promptQuestions.map((q) => button(q).disabled)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      await act(async () => {
        const tile = button(question);
        tile.click();
        tile.click();
        document
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]).toMatchObject([
        "/admin/chef-ai/chat",
        { method: "POST", body: { message: question } },
      ]);
      expect((fetch.mock.calls as unknown[][])[0][1]).toEqual(
        expect.objectContaining({ body: { message: question } }),
      );
      expect(button("Send").disabled).toBe(true);
      expect(document.querySelector('[role="status"]')!.textContent).toContain(
        "Checking",
      );
      expect(document.activeElement).toBe(document.querySelector("textarea"));
      await act(async () => resolve(emptyAnswer));
      expect(document.body.textContent).toContain(
        "does not mean you are free or available",
      );
      expect(document.body.textContent).not.toContain(
        "Recorded events don’t establish availability.",
      );
      expect(document.querySelector('[role="status"]')).toBeNull();
      await draft("A new question for tomorrow");
      expect(button("Send").disabled).toBe(false);
      await act(async () => button("Close Sous Chef").click());
      await act(async () => button("Ask Sous Chef").click());
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="log"]')!.textContent).toContain(
        question,
      );
    });
  },
);

it("keeps distinct requests, all statuses, exact intervals and direct links, with absence labels inside closed details", async () => {
  const display = {
    start: "2026-11-13T22:00:00Z",
    end: "2026-11-14T00:30:00Z",
  };
  const requested = {
    start: "2026-11-13T21:00:00Z",
    end: "2026-11-13T23:30:00Z",
  };
  const protection = {
    start: "2026-11-13T20:30:00Z",
    end: "2026-11-14T01:00:00Z",
  };
  const entries = [
    "pending",
    "pending",
    "confirmed",
    "cancelled",
    "completed",
  ].map((status, index) => ({
    id: `event-${index}`,
    source: { type: "private-event", id: `event-${index}` },
    detailPath: `/chef-events/event-${index}`,
    title: index < 2 ? "Same-looking request" : `Synthetic ${status}`,
    category: "plated_dinner",
    status,
    timeZone: "America/Chicago",
    requestedTime: requested,
    displayTime: display,
    appointmentTime:
      status === "confirmed" || status === "completed" ? display : null,
    protectedTime:
      index === 0
        ? [{ ...protection, state: "held" }]
        : status === "confirmed"
          ? [{ ...protection, state: "confirmed" }]
          : [],
  }));
  const fetch = jest
    .fn()
    .mockResolvedValue({
      ...emptyAnswer,
      entries,
      message:
        "Five recorded events. These records do not determine availability.",
    });
  await withChat(fetch, async () => {
    await act(async () => button(promptQuestions[0]).click());
    const cards = [...document.querySelectorAll("article")];
    expect(cards).toHaveLength(5);
    // Display time is not necessarily the original requested interval.
    expect(cards[0].querySelector("p")!.textContent).toContain("Display time:");
    expect(cards[0].querySelector("p")!.textContent).toContain("4:00");
    expect(cards[2].querySelector("p")!.textContent).toContain("Appointment:");
    expect(
      cards.slice(0, 2).map((card) => card.querySelector("a")!.textContent),
    ).toEqual(["Same-looking request", "Same-looking request"]);
    for (const label of [
      "Pending request",
      "Confirmed appointment",
      "Cancelled event",
      "Completed appointment",
    ])
      expect(document.body.textContent).toContain(label);
    for (const [index, card] of cards.entries()) {
      const details = card.querySelector("details")!;
      expect(details.open).toBe(false);
      expect(card.querySelector("a")!.getAttribute("href")).toBe(
        `/chef-events/event-${index}`,
      );
      expect(details.querySelector("summary")!.getAttribute("aria-label")).toBe(
        `Details for ${entries[index].title}`,
      );
      expect(details.textContent).toContain("Requested time");
      expect(details.textContent).toContain("Display interval");
      expect(details.textContent).toContain("Appointment");
      expect(details.textContent).toContain("Scheduling protection");
      expect(details.textContent).toContain("3:00 PM");
      expect(details.textContent).toContain("4:00 PM");
      expect(details.textContent).toContain("plated_dinner");
      expect(details.textContent).toContain("America/Chicago");
      if (!entries[index].appointmentTime)
        expect(details.textContent).toContain("No appointment recorded");
      if (!entries[index].protectedTime.length)
        expect(details.textContent).toContain(
          "No held or confirmed interval returned",
        );
    }
    expect(cards[0].querySelector("details")!.textContent).toContain("Held:");
    expect(cards[2].querySelector("details")!.textContent).toContain(
      "Confirmed:",
    );
    expect(cards[0].querySelector("details")!.textContent).toContain("2:30 PM");
    expect(cards[0].querySelector("details")!.textContent).toContain("7:00 PM");
    await act(async () => cards[0].querySelector("a")!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("keeps Shift+Enter and composition as input, sends on Enter, and permits retry after an error", async () => {
  const fetch = jest
    .fn()
    .mockRejectedValueOnce({ status: 429 })
    .mockResolvedValueOnce(emptyAnswer);
  await withChat(fetch, async () => {
    await draft("What is on my schedule tomorrow?");
    const textarea = document.querySelector("textarea")!;
    for (const options of [{ shiftKey: true }, { isComposing: true }]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      await act(async () => {
        textarea.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      textarea.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      "request limit",
    );
    await draft("What is on my schedule today?");
    await act(async () => button("Send").click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls as unknown[][])[1][1]).toEqual(
      expect.objectContaining({
        body: { message: "What is on my schedule today?" },
      }),
    );
  });
});
