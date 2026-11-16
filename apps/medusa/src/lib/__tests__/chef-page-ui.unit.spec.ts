/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
jest.mock("../../admin/components/chef-chat/chef-chat.css", () => ({}));
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ChefChat,
  ChefChatSession,
} from "../../admin/components/chef-chat/chef-chat";
import { scheduleEdits } from "../../admin/components/chef-chat/schedule-edit-state";
import { pageHintFromMatches } from "../../admin/components/chef-chat/page-context";
import { composeSchedule } from "../chef-ai/presentation";
(globalThis as any).Request = require("node-fetch").Request;
const meta = {
  surface: "chef-events",
  view: "detail",
  resource: { kind: "private-event", idParam: "id" },
};
const local = {
  date: "2026-11-27",
  time: "10:00",
  timezone: "America/Chicago",
  instant: "2026-11-27T16:00:00Z",
};
const intent = {
  target: "context",
  date: { kind: "day_of_month", day: 26 },
  time: null,
  clarification: "none",
};
const targets = ["B", "A"].map((id) => ({
  ...local,
  id,
  title: `Event ${id}`,
  status: "pending",
  revision: "a".repeat(32),
}));
const context = {
  candidates: targets.map(({ id, revision }) => ({ id, revision })),
  observedAt: Date.now(),
};
const entry: any = {
  id: "display:A",
  source: { type: "private-event", id: "A" },
  title: "Event A <script>bad()</script>",
  category: "dinner",
  status: "pending",
  timeZone: local.timezone,
  requestedTime: { start: "2026-11-30T20:00:00Z", end: "2026-11-30T21:00:00Z" },
  displayTime: { start: "2026-11-30T23:00:00Z", end: "2026-12-01T00:00:00Z" },
  appointmentTime: null,
  protectedTime: [],
};
const answer = {
  ...composeSchedule({
    complete: true,
    message: "",
    entries: [entry],
    timeZone: local.timezone,
  }),
  editContext: { ...context, candidates: [context.candidates[1]] },
};
async function fixture(run: (f: any) => Promise<void>) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  scheduleEdits.clearIdentity();
  sessionStorage.clear();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetch = jest.fn().mockResolvedValue(answer);
  const preview = jest.fn(async ({ eventId }) => ({
    reference: "fixture",
    eventId,
    target: {
      id: eventId,
      title: `Event ${eventId}`,
      status: "pending" as const,
      revision: "a".repeat(32),
    },
    expectedRevision: "a".repeat(32),
    operationId: "00000000-0000-4000-8000-000000000001",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    current: local,
    proposed: { ...local, date: "2026-11-26", instant: "2026-11-26T16:00:00Z" },
    reserved: false as const,
    googleAvailability: "advisory" as const,
  }));
  const attempt = jest.fn();
  const layout = React.createElement(
    ChefChatSession,
    null,
    React.createElement(Outlet),
    React.createElement(ChefChat, {
      userId: "admin",
      client: { fetch },
      scheduleTransport: { backend: "https://fixture", preview, attempt },
    }),
  );
  const router = createMemoryRouter(
    [
      {
        element: layout,
        children: [
          {
            path: "/chef-events/:id",
            handle: { breadcrumb: "kept", sousChef: meta },
            children: [
              {
                path: "",
                element: React.createElement("p", null, "Event page"),
              },
              {
                path: "edit",
                element: React.createElement(
                  "p",
                  null,
                  "Unsupported descendant",
                ),
              },
            ],
          },
          {
            path: "/menus/:id",
            handle: {
              sousChef: {
                surface: "menus",
                view: "detail",
                resource: { kind: "menu", idParam: "id" },
              },
            },
            element: React.createElement("p", null, "Menu page"),
          },
          {
            path: "*",
            element: React.createElement("p", null, "Generic page"),
          },
        ],
      },
    ],
    {
      basename: "/custom-admin",
      initialEntries: ["/custom-admin/chef-events/B"],
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(RouterProvider, { router }),
        ),
      ),
    );
    await click("Ask Sous Chef");
    await run({ fetch, preview, attempt, router, qc });
  } finally {
    await act(async () => root.unmount());
    qc.clear();
    host.remove();
    scheduleEdits.clearIdentity();
    router.dispose();
  }
}
async function click(name: string) {
  await act(async () => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    );
    expect(button).toBeDefined();
    button!.click();
  });
}
async function ask(text: string) {
  await act(async () => {
    const t = document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(t, text);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Send");
}
it.each(["B", "A"])(
  "real router page B plus grounded A asks before preview, explicit choice %s targets exact ID",
  async (id) => {
    await fixture(async ({ fetch, preview, attempt }) => {
      await ask("What's on November 30?");
      expect(fetch.mock.calls[0][1].body.page).toEqual({
        version: 1,
        surface: "chef-events",
        view: "detail",
        resource: { kind: "private-event", id: "B" },
      });
      const log = document.querySelector('[role="log"]')!;
      expect(log.textContent).toContain("November 30, 2026 at 2:00 PM");
      expect(log.querySelector("script")).toBeNull();
      expect(log.querySelector("a")?.getAttribute("href")).toBe(
        "/custom-admin/chef-events/A",
      );
      expect(log.querySelector("details")).toBeNull();
      expect(log.querySelector("article")).toBeNull();
      expect(log.querySelectorAll('[data-schedule-event="A"]')).toHaveLength(1);
      fetch.mockResolvedValueOnce({
        entries: [],
        presentation: "clarification",
        message: "The event open on this page, or the event we just discussed?",
        editClarification: { intent, context, targets },
      });
      await ask("Can you move this event to the 26th?");
      expect(fetch.mock.calls.at(-1)[1].body.context.candidates[0].id).toBe(
        "A",
      );
      expect(preview).not.toHaveBeenCalled();
      expect(attempt).not.toHaveBeenCalled();
      fetch.mockResolvedValueOnce({
        entries: [],
        presentation: "proposal",
        message: "Review this change before confirming.",
        editProposal: {
          eventId: id,
          expectedRevision: "a".repeat(32),
          date: "2026-11-26",
        },
      });
      await click(`Choose Event ${id} (${id})`);
      expect(fetch.mock.calls.at(-1)[1].body.selection.context.selectedId).toBe(
        id,
      );
      expect(preview.mock.calls[0][0]).toEqual({
        eventId: id,
        date: "2026-11-26",
      });
      expect(
        document.querySelector('[aria-label="Verified editing target"]')
          ?.textContent,
      ).toContain(`Editing: Event ${id}`);
      fetch.mockResolvedValueOnce({
        entries: [],
        message: "Use Confirm change to save.",
      });
      await ask("yes");
      expect(attempt).not.toHaveBeenCalled();
    });
  },
);
it.each(["same", "nested", "menu", "back"])(
  "navigation %s suppresses late read/context and unused proposals",
  async (kind) => {
    await fixture(async ({ fetch, preview, router }) => {
      let resolve: any;
      fetch.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
      await ask("Read schedule");
      await act(async () =>
        router.navigate(
          kind === "nested"
            ? "/chef-events/B/edit"
            : kind === "menu"
              ? "/menus/m1"
              : "/chef-events/B",
        ),
      );
      if (kind === "back") await act(async () => router.navigate(-1));
      await act(async () => resolve(answer));
      await click("Ask Sous Chef");
      fetch.mockResolvedValueOnce({ entries: [], message: "Which event?" });
      await ask("Move it to the 26th");
      expect(fetch.mock.calls.at(-1)[1].body.context).toBeUndefined();
      expect(preview).not.toHaveBeenCalled();
      const page = fetch.mock.calls.at(-1)[1].body.page;
      if (kind === "nested") expect(page).toBeUndefined();
      if (kind === "menu")
        expect(page.resource).toEqual({ kind: "menu", id: "m1" });
    });
  },
);
it("explicit termination and generated empty leaf do not inherit into unrelated routes", () => {
  const parent = {
    pathname: "/app/chef-events/B",
    params: { id: "B" },
    handle: { sousChef: meta },
  };
  expect(
    pageHintFromMatches([parent, { ...parent, handle: undefined }]).surface,
  ).toBe("chef-events");
  expect(
    pageHintFromMatches([
      parent,
      { ...parent, handle: undefined },
      { ...parent, handle: undefined },
    ]).surface,
  ).toBe("generic");
  for (const descendant of [
    { ...parent, handle: { label: "Unrelated modal" } },
    { ...parent, pathname: "/app/chef-events/B/create", handle: undefined },
    { ...parent, handle: { sousChef: null } },
  ])
    expect(pageHintFromMatches([parent, descendant]).surface).toBe("generic");
});
it("reopening retains visible prose but never restores actionable focus from that history", async () => {
  await fixture(async ({ fetch, preview }) => {
    await ask("Read November 30");
    await click("Close Sous Chef");
    await click("Ask Sous Chef");
    expect(document.querySelector('[role="log"]')!.textContent).toContain(
      "Event A",
    );
    fetch.mockResolvedValueOnce({
      entries: [],
      message: "Current page event only.",
    });
    await ask("Move this event to the 26th");
    expect(fetch.mock.calls.at(-1)[1].body.context).toBeUndefined();
    expect(fetch.mock.calls.at(-1)[1].body.page.resource.id).toBe("B");
    expect(preview).not.toHaveBeenCalled();
  });
});

it('renders a safe current-page summary as prose/link and retains verified focus without an edit',async()=>{
  await fixture(async({fetch,preview,attempt})=>{
    const summary={...entry,source:{type:'private-event',id:'B'},title:'QA <script>RejectionK</script>',guestCount:4};
    fetch.mockResolvedValueOnce({presentation:'answer',entries:[],message:'Here is the recorded event.',summary,complete:true,editContext:{...context,candidates:[context.candidates[0]]}});
    await ask("what's this event about?");
    expect(fetch.mock.calls[0][1].body.page.resource.id).toBe('B');
    const log=document.querySelector('[role="log"]')!;
    expect(log.textContent).toContain('4 guests');expect(log.querySelector('script')).toBeNull();
    expect(log.querySelector('article')).toBeNull();
    expect(log.querySelector('a')?.getAttribute('href')).toBe('/custom-admin/chef-events/B');
    fetch.mockResolvedValueOnce({entries:[],message:'Which change?'});
    await ask('move it to noon');
    expect(fetch.mock.calls[1][1].body.context.candidates).toEqual([context.candidates[0]]);
    expect(preview).not.toHaveBeenCalled();expect(attempt).not.toHaveBeenCalled();
  });
});
it('read-summary choices send only the explicitly chosen stable ID and never preview',async()=>{
  await fixture(async({fetch,preview,attempt})=>{
    fetch.mockResolvedValueOnce({entries:[],message:'Which event?',summaryChoices:['A','B'].map(id=>({...entry,source:{type:'private-event',id},title:'Identical'}))});
    await ask('tell me about it');
    fetch.mockResolvedValueOnce({entries:[],message:'Here is the event.',summary:{...entry,title:'Identical'}});
    await click('Read Identical (A)');
    expect(fetch.mock.calls[1][1].body).toEqual({summarySelection:{eventId:'A'}});
    expect(preview).not.toHaveBeenCalled();expect(attempt).not.toHaveBeenCalled();
  });
});
