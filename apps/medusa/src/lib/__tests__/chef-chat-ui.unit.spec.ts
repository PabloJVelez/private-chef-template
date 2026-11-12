/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
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
          '[aria-label="Open schedule chat"]',
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
