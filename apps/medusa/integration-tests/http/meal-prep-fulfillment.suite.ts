import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type MealPrepModuleService from "../../src/modules/meal-prep/service";
import {
  chef,
  customer,
  request,
  general,
} from "../../src/modules/meal-prep/__tests__/capture-fixtures";
import {
  generateCandidates,
  type Recurrence,
} from "../../src/modules/meal-prep/recurrence";
import {
  fulfillmentFixture,
  fulfillmentPaths,
} from "../../src/modules/meal-prep/fulfillment-contracts";
import { Migration20261031000800 } from "../../src/modules/meal-prep/migrations/Migration20261031000800";

export function fulfillmentTests(
  get: () => {
    service: MealPrepModuleService;
    pool: any;
    occurrence: any;
    menu: any;
    approveMenu: () => Promise<any>;
    run: (...args: any[]) => Promise<any>;
    offerId: string;
    intakeId: string;
    migrate: (Class: any, direction?: string) => Promise<void>;
  },
) {
  describe("gated fulfillment and chef operations on real PostgreSQL", () => {
    const cmd = (
      subjectId: string,
      expectedVersion: number,
      operation: string,
      extra: any = {},
      actor: any = chef,
      key = `${operation}-${expectedVersion}`,
    ) =>
      get().service.executeTestFulfillmentCommand(
        {
          subjectId,
          expectedVersion,
          operation,
          idempotencyKey: key,
          ...extra,
        },
        actor,
      );
    const report = (ids = [get().occurrence.subjectId], actor: any = chef) =>
      get().service.readTestOperations({ subjectIds: ids }, actor);
    const plan = (
      id = get().occurrence.subjectId,
      version = 3,
      details: any = { method: "in_home", intakeRevisionId: get().intakeId },
    ) =>
      cmd(id, version, "plan", { policyFixture: fulfillmentFixture, details });
    async function work(
      id: string,
      version: number,
      method = "in_home",
      block = "fulfillment-work",
    ) {
      const { pool, run } = get();
      await pool.query(
        `update availability_setting set weekly='{"5":[{"start":"08:00","end":"18:00"}]}',overrides='{}'`,
      );
      await pool.query(
        `insert into chef_work_block(id,resource_id,chef_id,purpose,starts_at,ends_at)
        values ($1,'chef-default','chef-default',$2,'2027-01-01T10:00Z','2027-01-01T11:00Z') on conflict do nothing`,
        [block, method === "in_home" ? "in_home" : "preparation"],
      );
      return run(id, version, "link_work", {
        blockId: block,
        expectedBlockVersion: 1,
        expectedAvailabilityVersion: (
          await pool.query("select version from availability_setting")
        ).rows[0].version,
      });
    }
    const slot = { id: "visit", weekday: 5, localTime: "10:00" };
    const patterns: Recurrence[] = [
      { kind: "weekly", timezone: "UTC", anchorDate: "2027-01-01", slot },
      { kind: "fortnightly", timezone: "UTC", anchorDate: "2027-01-01", slot },
      {
        kind: "multiple_weekly",
        timezone: "UTC",
        anchorDate: "2027-01-01",
        slots: [slot, { id: "second", weekday: 7, localTime: "10:00" }],
      },
      {
        kind: "custom_dates",
        timezone: "UTC",
        dates: [
          { id: "visit", localDate: "2027-01-01", localTime: "10:00" },
          { id: "second", localDate: "2027-01-03", localTime: "10:00" },
        ],
      },
    ];
    async function fixture(
      method: "in_home" | "delivery" | "pickup",
      recurrence = patterns[0],
      suffix = "matrix",
    ) {
      const { service, run } = get();
      let intakeId = get().intakeId;
      if (method !== "in_home") {
        const prior = (
          await get().pool.query(
            "select version from meal_prep_capture where id='household-1'",
          )
        ).rows[0];
        const r = await service.saveCapture(
          {
            captureId: "household-1",
            customerId: "customer-1",
            householdId: null,
            expectedVersion: prior.version,
            idempotencyKey: `intake-${suffix}`,
            body: {
              kind: "household",
              intake: {
                method,
                ...general,
                ...(method === "delivery"
                  ? { address: "PRIVATE DELIVERY", deliveryInstructions: null }
                  : {}),
              },
            },
          },
          chef,
        );
        intakeId = r.revisionId;
      }
      const a = await run(suffix, 0, "propose_arrangement", {
        householdId: "household-1",
        customerId: "customer-1",
        method,
        recurrence,
      });
      await run(suffix, 1, "approve_arrangement", { revisionId: a.revisionId });
      const candidates = generateCandidates({
        arrangementId: suffix,
        revisionId: a.revisionId,
        recurrence,
        bounds: { from: "2027-01-01", through: "2027-01-15" },
      });
      expect(candidates.length).toBeGreaterThan(1);
      const c = candidates[0];
      const occurrence = await run(c.occurrenceId, 0, "record_candidate", {
        arrangementId: suffix,
        arrangementRevisionId: a.revisionId,
        localDate: c.localDate,
        slotId: c.slotId,
      });
      expect(
        (await service.readApprovalState(c.occurrenceId, chef)).state
          .confirmedMenuRevisionId,
      ).toBeNull();
      const input = request(get().offerId, intakeId);
      input.captureId = `selection-${suffix}`;
      input.body.method = method;
      const selection = await service.saveCapture(input, customer);
      const menu = await run(
        c.occurrenceId,
        1,
        "propose_menu",
        {
          menu: {
            selectionRevisionId: selection.revisionId,
            quote: {
              status: "exact_review",
              currency: "USD",
              totalMinor: 1000,
              provenance: "test fixture",
            },
          },
        },
        customer,
      );
      await run(c.occurrenceId, 2, "decide_menu", {
        revisionId: menu.revisionId,
        decision: "approved",
      });
      return {
        id: occurrence.subjectId,
        details:
          method === "pickup"
            ? { method, locationReference: "test-location-D03-unresolved" }
            : { method, intakeRevisionId: intakeId },
      };
    }
    for (const method of ["in_home", "delivery", "pickup"] as const) {
      it.each(patterns)(
        `${method}: $kind approval → explicit work → method completion preserves payment and schedule`,
        async (recurrence) => {
          const f = await fixture(method, recurrence);
          await work(f.id, 3, method);
          const before = (await get().service.readApprovalState(f.id, chef))
            .state;
          const p = await plan(f.id, 4, f.details);
          let version = p.version;
          for (const status of fulfillmentPaths[method].slice(1)) {
            const result = await cmd(f.id, version, "progress", {
              planId: p.eventId,
              status,
            });
            version = result.version;
          }
          const r = await report([f.id]);
          if (process.env.REPORT_DIR) {
            const directory = join(process.env.REPORT_DIR, "owner-scenarios");
            mkdirSync(directory, { recursive: true });
            writeFileSync(
              join(directory, `${method}-${recurrence.kind}.json`),
              JSON.stringify(r, null, 2),
            );
          }
          expect(r.occurrences[0]).toMatchObject({
            payment: null,
            selectedServings: 7,
            fulfillment: {
              status: fulfillmentPaths[method].at(-1),
              needsReplan: false,
            },
          });
          expect(
            (await get().service.readApprovalState(f.id, chef)).state,
          ).toEqual(before);
          expect(
            (
              await get().pool.query(
                "select * from chef_time_reservation where active",
              )
            ).rows,
          ).toHaveLength(1);
          expect(
            (
              await get().pool.query(
                "select * from chef_time_reservation_drift",
              )
            ).rows,
          ).toEqual([]);
          expect(JSON.stringify(r)).not.toMatch(
            /PRIVATE|Peanuts|locationReference/,
          );
        },
      );
    }
    it.each(["delivery", "pickup"] as const)(
      "%s orders share actual work; advisory counts never reject or reserve an appointment",
      async (method) => {
        const first = await fixture(method, patterns[0], "first");
        await work(first.id, 3, method);
        const second = await fixture(method, patterns[0], "second");
        await work(second.id, 3, method);
        await plan(first.id, 4, first.details);
        await plan(second.id, 4, second.details);
        expect((await report([first.id, second.id])).summaries).toEqual([
          {
            localDate: "2027-01-01",
            method,
            orders: 2,
            selectedServings: 14,
            menusAwaitingApproval: 0,
          },
        ]);
        expect(
          (
            await get().pool.query(
              "select * from chef_time_reservation where active",
            )
          ).rows,
        ).toHaveLength(1);
      },
    );
    it("requires menu approval, exact method/intake, and explicit actual work without manufacturing appointments", async () => {
      await expect(plan(undefined, 1)).rejects.toMatchObject({
        code: "APPROVAL_REQUIRED",
      });
      await get().approveMenu();
      await expect(
        plan(undefined, 3, {
          method: "delivery",
          intakeRevisionId: get().intakeId,
        }),
      ).rejects.toMatchObject({ code: "METHOD_MISMATCH" });
      await expect(
        plan(undefined, 3, { method: "in_home", intakeRevisionId: "foreign" }),
      ).rejects.toMatchObject({ code: "INTAKE_MISMATCH" });
      const p = await plan();
      await expect(
        cmd(get().occurrence.subjectId, 4, "progress", {
          planId: p.eventId,
          status: "in_progress",
        }),
      ).rejects.toMatchObject({ code: "WORK_REQUIRED" });
      expect(
        (await get().pool.query("select * from chef_time_reservation")).rows,
      ).toHaveLength(0);
    });
    it("serializes duplicate retries, conflicting reuse and competing stale chefs", async () => {
      await get().approveMenu();
      const both = await Promise.all([plan(), plan()]);
      expect(both[0]).toEqual(both[1]);
      await expect(
        plan(undefined, 3, {
          method: "in_home",
          intakeRevisionId: "different",
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const results = await Promise.allSettled(
        ["a", "b"].map((key) =>
          cmd(
            get().occurrence.subjectId,
            4,
            "flag_follow_up",
            { reason: "operational_review" },
            chef,
            key,
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.code,
      ).toBe("STALE_VERSION");
    });
    it("checks chef and household ownership before reads and receipt replay", async () => {
      await get().approveMenu();
      await plan();
      for (const actor of [customer, { ...chef, chefId: "foreign" }]) {
        await expect(report(undefined, actor)).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
        await expect(
          cmd(
            get().occurrence.subjectId,
            3,
            "plan",
            {
              policyFixture: fulfillmentFixture,
              details: { method: "in_home", intakeRevisionId: get().intakeId },
            },
            actor,
          ),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      await get().pool.query(
        "update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'",
      );
      await expect(report()).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(plan()).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("keeps missed-selection and pending-change follow-up independent of manual resolution", async () => {
      const { occurrence, run, service } = get();
      const id = occurrence.subjectId;
      await run(id, 1, "set_selection_deadline", {
        deadline: "2026-01-01T00:00:00Z",
      });
      await run(id, 2, "flag_missed_selection", {
        now: "2026-01-02T00:00:00Z",
      });
      const before = (await service.readApprovalState(id, chef)).state;
      const f = await cmd(id, 3, "flag_follow_up", { reason: "handoff_issue" });
      await cmd(id, 4, "resolve_follow_up", { flagId: f.eventId });
      expect((await report()).occurrences[0].followUp).toMatchObject({
        operational: [],
        missedSelection: true,
      });
      expect((await service.readApprovalState(id, chef)).state).toEqual(before);
      await expect(
        cmd(id, 5, "resolve_follow_up", { flagId: f.eventId }),
      ).rejects.toMatchObject({ code: "INVALID_FOLLOW_UP" });
      await run(
        id,
        5,
        "request_change",
        { change: { type: "skip", reason: "away" } },
        customer,
      );
      expect((await report()).occurrences[0].followUp.pendingChange).toBe(true);
    });
    it("pending menu changes retain the plan; approved menu changes require a new plan", async () => {
      const { occurrence, run, service, menu } = get();
      const id = occurrence.subjectId;
      await get().approveMenu();
      await work(id, 3);
      const p = await plan(id, 4);
      const pending = await run(
        id,
        5,
        "request_change",
        { change: { type: "portions", menu } },
        customer,
      );
      expect((await report()).occurrences[0].fulfillment.needsReplan).toBe(
        false,
      );
      await run(id, 6, "decide_change", {
        revisionId: pending.revisionId,
        decision: "approved",
      });
      expect((await report()).occurrences[0].fulfillment.needsReplan).toBe(
        true,
      );
      await expect(
        cmd(id, 7, "progress", { planId: p.eventId, status: "in_progress" }),
      ).rejects.toMatchObject({ code: "STALE_PLAN" });
      const replacement = await plan(id, 7);
      await cmd(id, 8, "progress", {
        planId: replacement.eventId,
        status: "in_progress",
      });
      await expect(plan(id, 9)).rejects.toMatchObject({
        code: "ALREADY_STARTED",
      });
      expect(
        (await service.readApprovalState(id, chef)).state
          .confirmedMenuRevisionId,
      ).toBe(pending.revisionId);
    });
    it("rolls back event, version, audit and outbox if final receipt fails", async () => {
      await get().approveMenu();
      const { pool, service, occurrence } = get();
      const before = await service.readApprovalState(
        occurrence.subjectId,
        chef,
      );
      const count = async () =>
        (
          await pool.query(`select (select count(*) from meal_prep_fulfillment_event) as events,
        (select count(*) from meal_prep_audit) as audits,(select count(*) from meal_prep_outbox) as outbox`)
        ).rows;
      const beforeCounts = await count();
      await pool.query(
        "alter table meal_prep_command add constraint fulfillment_fail check(operation<>'fulfillment')",
      );
      try {
        await expect(plan()).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_command drop constraint fulfillment_fail",
        );
      }
      expect(await count()).toEqual(beforeCounts);
      expect(
        await service.readApprovalState(occurrence.subjectId, chef),
      ).toEqual(before);
      await plan();
    });
    it("guards immutable history, invalid direct transitions and populated rollback", async () => {
      await get().approveMenu();
      const p = await plan();
      const { pool, occurrence } = get();
      await expect(
        cmd(occurrence.subjectId, 4, "progress", {
          planId: p.eventId,
          status: "delivered",
        }),
      ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
      await expect(
        pool.query(
          `insert into meal_prep_fulfillment_event(id,subject_id,version,actor_id,kind,method,plan_id,status,test_only)
        values('forged',$1,4,'chef-user','progress','in_home',$2,'delivered',true)`,
          [occurrence.subjectId, p.eventId],
        ),
      ).rejects.toThrow("Invalid fulfillment transition");
      await expect(
        pool.query(
          `insert into meal_prep_fulfillment_event(id,subject_id,version,actor_id,kind,method,status,snapshot,test_only)
        select 'null-status',subject_id,version,actor_id,kind,method,null,snapshot,true from meal_prep_fulfillment_event where id=$1`,
          [p.eventId],
        ),
      ).rejects.toThrow("check constraint");
      await expect(
        pool.query("update meal_prep_fulfillment_event set status='completed'"),
      ).rejects.toThrow("append-only");
      await expect(
        pool.query("delete from meal_prep_fulfillment_event"),
      ).rejects.toThrow("append-only");
      await expect(
        get().migrate(Migration20261031000800, "down"),
      ).rejects.toThrow("rollback refused");
      expect((await report()).occurrences[0].fulfillment.status).toBe(
        "planned",
      );
    });
    it("rejects policy fields and production execution/reporting", async () => {
      await expect(
        cmd(get().occurrence.subjectId, 1, "plan", {
          policyFixture: fulfillmentFixture,
          details: { method: "pickup", locationReference: "fixture", fee: 100 },
        }),
      ).rejects.toThrow();
      const prior = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        await expect(plan()).rejects.toMatchObject({
          code: "FULFILLMENT_DISABLED_D02_D03_D08",
        });
        await expect(report()).rejects.toMatchObject({
          code: "FULFILLMENT_DISABLED_D02_D03_D08",
        });
      } finally {
        process.env.NODE_ENV = prior;
      }
    });
  });
}
