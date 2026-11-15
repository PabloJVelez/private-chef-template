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
import {
  answerSchedule,
  chatInput,
  proposalSelectionInput,
} from "../chef-ai/chat";
import {
  attachEditContext,
  resolveEditProposal,
} from "../chef-ai/edit-proposal";
import { editIntentSchema, type EditIntent } from "../chef-ai/edit-intent";
import type { ScheduleAnswer } from "../chef-ai/contracts";
import type { CalendarEntry } from "../chef-workspace/contracts";
const {
  createSousChefIntentTrace,
} = require("../../../../../docs/chef-ai/diagnostics/intent-trace.cjs");
(globalThis as any).Request = require("node-fetch").Request;
const zone = "America/Chicago",
  revision = "a".repeat(32);
const correct: EditIntent = {
  target: "context",
  targetDate: null,
  date: { kind: "day_of_month", day: 29 },
  time: null,
  continuation: false,
  clarification: "none",
};
const missing: EditIntent = { ...correct, date: null, clarification: "target" };
const misplaced: EditIntent = {
  ...correct,
  date: null,
  targetDate: { kind: "day_of_month", day: 29 },
};
function saveTrace(name: string, trace: any) {
  if (!process.env.BTS21_INTENT_TRACE_DIR) return;
  const fs = require("node:fs"),
    path = require("node:path");
  fs.mkdirSync(process.env.BTS21_INTENT_TRACE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.BTS21_INTENT_TRACE_DIR, name + ".json"),
    JSON.stringify(trace.snapshot(), null, 2) + "\n",
  );
}
const traceKey = "00000000-0000-4000-8000-000000000001";
function record(id: string, date: string, time: string) {
  return {
    id,
    title: id === "A" ? "QA ScheduleEdit" : "QA RejectionK",
    status: "pending",
    revision,
    requestedDate: `${date}T${Number(time.slice(0, 2)) + 6}:00:00.000Z`,
    requestedTime: time,
    timeZone: zone,
    eligible: true,
    experience_type_id: "fixture",
  };
}
async function fixture(
  run: (f: any) => Promise<void>,
  output = correct,
  month = "11",
) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  sessionStorage.clear();
  scheduleEdits.clearIdentity();
  const records = {
    A: record("A", `2026-${month}-30`, "14:00"),
    B: record("B", "2026-11-27", "10:00"),
  };
  const snapshot = jest.fn(async (id: "A" | "B") => records[id]);
  const scope: any = { resolve: () => ({ readScheduleEditEvent: snapshot }) };
  const trace = createSousChefIntentTrace({
    enabled: true,
    correlationId: traceKey,
    aliases: { A: "A", B: "B" },
  });
  const entry: CalendarEntry = {
    id: "presentation:A",
    source: { type: "private-event", id: "A" },
    detailPath: "/chef-events/A",
    title: records.A.title,
    status: "pending",
    category: "Dinner",
    timeZone: zone,
    requestedTime: {
      start: records.A.requestedDate,
      end: records.A.requestedDate,
    },
    appointmentTime: null,
    displayTime: {
      start: records.A.requestedDate,
      end: records.A.requestedDate,
    },
    protectedTime: [],
  };
  const read = jest.fn(async (range) => ({
    range,
    complete: true,
    entries: [entry],
  }));
  const select = jest.fn(async () => {
    const intent = editIntentSchema.parse(output);
    trace.record("classifier", intent);
    return {
      calls: [
        {
          name: "propose_pending_event_date_time_edit",
          arguments: JSON.stringify(intent),
        },
      ],
    };
  });
  const fetch = jest.fn(async (_url: string, { body }: any) => {
    let result: ScheduleAnswer;
    if (body.message === "Read A") {
      result = await answerSchedule(
        chatInput.parse(body),
        zone,
        async () => ({
          calls: [
            {
              name: "get_schedule",
              arguments: JSON.stringify({
                period: "dates",
                startDate: `2026-${month}-30`,
                endDate: month === "11" ? "2026-12-01" : "2026-12-31",
                timeZone: zone,
              }),
            },
          ],
        }),
        read,
      );
      return attachEditContext(scope, result);
    }
    if (body.selection) {
      trace.record("client-selection", body.selection);
      const { selection, page } = proposalSelectionInput.parse(body);
      trace.record("resolver", selection);
      result = await resolveEditProposal(
        scope,
        selection.intent,
        selection.context,
        zone,
        new Date(),
        true,
        read,
        page,
      );
    } else {
      const input = chatInput.parse(body);
      result = await answerSchedule(
        input,
        zone,
        select,
        read,
        new Date(),
        (intent, context) => {
          trace.record("merged", intent);
          trace.record("resolver", { intent, context });
          return resolveEditProposal(
            scope,
            intent,
            context,
            zone,
            new Date(),
            false,
            read,
            input.page,
          );
        },
      );
    }
    trace.record("response", result);
    return result;
  });
  const preview = jest.fn(async (input: any) => {
    trace.record("preview-request", input);
    const r = records[input.eventId as "A" | "B"];
    const current = {
      date: r.requestedDate.slice(0, 10),
      time: r.requestedTime,
      timezone: zone,
      instant: r.requestedDate,
    };
    trace.record("preview-outcome", { status: 200 });
    return {
      reference: "synthetic-reference",
      operationId: traceKey,
      eventId: r.id,
      expectedRevision: revision,
      target: {
        id: r.id,
        title: r.title,
        status: "pending" as const,
        revision,
      },
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      current,
      proposed: {
        ...current,
        date: input.date || current.date,
        time: input.time || current.time,
        instant: `${input.date || current.date}T${Number((input.time || current.time).slice(0, 2)) + 6}:00:00.000Z`,
      },
      reserved: false as const,
      googleAvailability: "advisory" as const,
    };
  });
  const attempt = jest.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: React.createElement(
          ChefChatSession,
          null,
          React.createElement(Outlet),
          React.createElement(ChefChat, {
            userId: "fixture",
            client: { fetch } as any,
            scheduleTransport: { backend: "https://fixture", preview, attempt },
          }),
        ),
        children: [
          {
            path: "/chef-events/:id",
            handle: {
              sousChef: {
                surface: "chef-events",
                view: "detail",
                resource: { kind: "private-event", idParam: "id" },
              },
            },
            element: React.createElement("div", null, "Event"),
          },
          {
            path: "/menus",
            element: React.createElement("div", null, "Menus"),
          },
        ],
      },
    ],
    { basename: "/app", initialEntries: ["/app/chef-events/B"] },
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
    await ask("Read A");
    await run({
      fetch,
      select,
      snapshot,
      preview,
      attempt,
      trace,
      router,
      records,
    });
  } finally {
    await act(async () => root.unmount());
    qc.clear();
    router.dispose();
    host.remove();
    scheduleEdits.clearIdentity();
  }
}
async function click(name: string) {
  await act(async () => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    );
    expect(b).toBeDefined();
    b!.click();
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
it.each(["A", "B"])(
  "mounted classifier → choice → schema → resolver retains day29 and selected %s arrival",
  async (chosen) => {
    await fixture(
      async ({ fetch, select, snapshot, preview, attempt, trace }: any) => {
        await ask("Can you move it to the 29th?");
        expect(preview).not.toHaveBeenCalled();
        expect(attempt).not.toHaveBeenCalled();
        expect(scheduleEdits.snapshot().task?.intent.date).toEqual({
          kind: "day_of_month",
          day: 29,
        });
        await click(
          `Choose ${chosen === "A" ? "QA ScheduleEdit" : "QA RejectionK"} (${chosen})`,
        );
        expect(fetch.mock.calls.at(-1)[1].body.selection.intent).toEqual(
          correct,
        );
        expect(select).toHaveBeenCalledTimes(1);
        expect(snapshot).toHaveBeenLastCalledWith(chosen);
        expect(preview.mock.calls[0][0]).toEqual({
          eventId: chosen,
          date: "2026-11-29",
        });
        expect(scheduleEdits.snapshot().selection?.preview?.proposed.time).toBe(
          chosen === "A" ? "14:00" : "10:00",
        );
        expect(attempt).not.toHaveBeenCalled();
        const steps = trace.snapshot().boundaries;
        expect(
          steps.find((x: any) => x.stage === "classifier").intent.date,
        ).toEqual(correct.date);
        expect(
          steps.find((x: any) => x.stage === "response").choice.date,
        ).toEqual(correct.date);
        expect(
          steps.find((x: any) => x.stage === "client-selection"),
        ).toMatchObject({ selected: chosen, intent: { date: correct.date } });
        saveTrace("preserved-" + chosen, trace);
      },
    );
  },
);
it.each([missing])(
  "schema-valid missing proposal %j is visible and cannot create a preview",
  async (output) => {
    await fixture(async ({ preview, attempt, trace }: any) => {
      await ask("Can you move it to the 29th?");
      expect(scheduleEdits.snapshot().task?.intent.date).toBeNull();
      await click("Choose QA ScheduleEdit (A)");
      expect(document.body.textContent).toContain(
        "What date or arrival time would you like?",
      );
      expect(preview).not.toHaveBeenCalled();
      expect(attempt).not.toHaveBeenCalled();
      saveTrace(output.targetDate ? "misplaced" : "missing", trace);
    }, output);
  },
);
it("different candidate months stay ordinal until the chosen event is re-fetched", async () => {
  await fixture(
    async ({ preview }: any) => {
      await ask("Can you move it to the 29th?");
      const label = document.querySelector(
        '[aria-label="Unfinished schedule change"]',
      )!.textContent!;
      expect(label).toContain("Proposed date: 29th");
      expect(label).not.toMatch(/November|December|2026/);
      await click("Choose QA ScheduleEdit (A)");
      expect(preview.mock.calls[0][0]).toEqual({
        eventId: "A",
        date: "2026-12-29",
      });
    },
    correct,
    "12",
  );
});
it("later time-only continuation keeps day29 through choice without sending history to classifier", async () => {
  await fixture(async ({ select, preview }: any) => {
    await ask("Can you move it to the 29th?");
    select.mockResolvedValueOnce({
      calls: [
        {
          name: "propose_pending_event_date_time_edit",
          arguments: JSON.stringify({
            ...correct,
            date: null,
            time: "17:00",
            continuation: true,
          }),
        },
      ],
    });
    await ask("at 5 PM");
    expect(select.mock.calls.at(-1)[0]).toEqual({ message: "at 5 PM" });
    await click("Choose QA ScheduleEdit (A)");
    expect(preview.mock.calls[0][0]).toEqual({
      eventId: "A",
      date: "2026-11-29",
      time: "17:00",
    });
  });
});

it.each([
  [correct, "Proposed date: 29th"],
  [missing, "New date/time not captured"],
] as const)(
  "active task honestly renders preserved versus absent proposed date",
  async (output, label) => {
    await fixture(async () => {
      await ask("Can you move it to the 29th?");
      expect(
        document.querySelector('[aria-label="Unfinished schedule change"]')
          ?.textContent,
      ).toContain(label);
    }, output);
  },
);

it.each(["read", "navigation"])(
  "an intervening %s clears the unfinished proposed date",
  async (kind) => {
    await fixture(async ({ select, fetch, router, preview, attempt }: any) => {
      await ask("Can you move it to the 29th?");
      if (kind === "navigation") {
        await act(async () => router.navigate("/menus"));
        await click("Ask Sous Chef");
      } else {
        select.mockResolvedValueOnce({
          calls: [
            {
              name: "get_schedule",
              arguments: JSON.stringify({
                period: "tomorrow",
                startDate: null,
                endDate: null,
                timeZone: zone,
              }),
            },
          ],
        });
        await ask("What is on tomorrow?");
      }
      expect(scheduleEdits.snapshot().task).toBeUndefined();
      select.mockResolvedValueOnce({
        calls: [
          {
            name: "propose_pending_event_date_time_edit",
            arguments: JSON.stringify({
              ...correct,
              date: null,
              time: "17:00",
              continuation: true,
            }),
          },
        ],
      });
      await ask("at 5 PM");
      expect(fetch.mock.calls.at(-1)[1].body.task).toBeUndefined();
      expect(document.body.textContent).toContain(
        "No unfinished change to continue",
      );
      expect(preview).not.toHaveBeenCalled();
      expect(attempt).not.toHaveBeenCalled();
    });
  },
);
it("local correlation is opt-in and strips prompt/IDs/names/refs/URLs/raw exceptions", () => {
  expect(() => createSousChefIntentTrace()).toThrow("opt-in");
  const trace = createSousChefIntentTrace({
    enabled: true,
    correlationId: traceKey,
    aliases: { A: "PRIVATE_ID_A", B: "PRIVATE_ID_B" },
  });
  trace.record("classifier", {
    ...correct,
    message: "PRIVATE_PROMPT",
    reference: "PRIVATE_REFERENCE",
    url: "PRIVATE_URL",
    customer: "PRIVATE_CUSTOMER",
  });
  trace.record("client-selection", {
    intent: { ...correct, time: "PRIVATE_EXCEPTION" },
    context: { selectedId: "PRIVATE_ID_A" },
  });
  trace.record("preview-request", {
    eventId: "PRIVATE_ID_B",
    date: "2026-11-29",
    reference: "PRIVATE_REFERENCE",
  });
  trace.record("preview-outcome", {
    status: 422,
    code: "slot_unavailable",
    message: "PRIVATE_EXCEPTION",
  });
  expect(JSON.stringify(trace.snapshot())).not.toContain("PRIVATE_");
  expect(trace.snapshot().boundaries[1].selected).toBe("A");
  expect(() => trace.record("raw-response", {})).toThrow(
    "Unsupported boundary",
  );
});

it.each(["failed continuation", "provider error"])(
  "new turn revokes ready B synchronously, including %s; explicit recheck is required",
  async (failure) => {
    await fixture(async ({ select, preview, attempt }: any) => {
      await act(async () => {
        await scheduleEdits.propose(
          { eventId: "B", expectedRevision: revision, time: "14:00" },
          scheduleEdits.beginProposal().current,
        );
      });
      const oldConfirm = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Confirm change",
      )!;
      expect(oldConfirm).toBeDefined();
      let resolve!: (value: any) => void, reject!: (error: Error) => void;
      select.mockReturnValueOnce(
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      await ask("This is for the event on the 30th");
      // The classifier has not completed. Neither the rendered nor direct path can write.
      expect(document.body.textContent).not.toContain("Confirm change");
      expect(scheduleEdits.snapshot().selection?.preview).toBeUndefined();
      await act(async () => {
        oldConfirm.click();
        await scheduleEdits.confirm(jest.fn());
        await scheduleEdits.confirm(jest.fn());
      });
      expect(attempt).not.toHaveBeenCalled();
      await act(async () => {
        if (failure === "provider error")
          reject(new Error("synthetic provider failure"));
        else
          resolve({
            calls: [
              {
                name: "propose_pending_event_date_time_edit",
                arguments: JSON.stringify({
                  ...correct,
                  target: "date",
                  targetDate: { kind: "day_of_month", day: 30 },
                  date: null,
                  continuation: true,
                }),
              },
            ],
          });
      });
      expect(document.body.textContent).not.toContain("Confirm change");
      expect(scheduleEdits.snapshot().selection).toMatchObject({
        eventId: "B",
        time: "14:00",
        phase: "cancelled",
      });
      expect(preview).toHaveBeenCalledTimes(1);
      await scheduleEdits.preview(); // No implicit recheck of the cancelled draft.
      expect(preview).toHaveBeenCalledTimes(1);
      await click("Recheck availability");
      expect(preview).toHaveBeenCalledTimes(2);
      expect(document.body.textContent).toContain("Confirm change");
      expect(attempt).not.toHaveBeenCalled();
    });
  },
);

it.each([
  misplaced,
  { ...correct, targetDate: { kind: "day_of_month", day: 29 } },
  { ...misplaced, target: "clarify" },
])(
  "contradictory ON/TO output never resolves a target; exact manual correction works",
  async (output) => {
    await fixture(async ({ preview, attempt, snapshot }: any) => {
      snapshot.mockClear();
      await ask("Can you move it to the 29th?");
      expect(document.body.textContent).toContain("date to move the event TO");
      expect(document.body.textContent).toContain("find (ON)");
      expect(
        document.querySelector('[aria-label="Unfinished schedule change"]'),
      ).toBeNull();
      expect(document.querySelector("[data-proposal-candidate]")).toBeNull();
      expect(preview).not.toHaveBeenCalled();
      expect(attempt).not.toHaveBeenCalled();
      expect(snapshot).not.toHaveBeenCalled();
      // Deliberate exact A action from its prior grounded read; no model call or remapping.
      await click("Change date/time");
      expect(scheduleEdits.snapshot().selection?.eventId).toBe("A");
      expect(preview).not.toHaveBeenCalled();
      await act(async () => {
        scheduleEdits.edit("date", "2026-11-29");
        await scheduleEdits.preview();
      });
      expect(preview.mock.calls[0][0]).toEqual({
        eventId: "A",
        date: "2026-11-29",
      });
      expect(attempt).not.toHaveBeenCalled();
    }, output as EditIntent);
  },
);
