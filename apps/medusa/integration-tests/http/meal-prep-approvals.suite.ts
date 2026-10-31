import { Migration20261030000500 } from "../../src/modules/meal-prep/migrations/Migration20261030000500";
import { billingTests } from "./meal-prep-billing.suite";
import { generateCandidates } from "../../src/modules/meal-prep/recurrence";
import {
  chef,
  customer,
  request,
  offerInput,
} from "../../src/modules/meal-prep/__tests__/capture-fixtures";
import type MealPrepModuleService from "../../src/modules/meal-prep/service";

export function approvalTests(
  get: () => {
    service: MealPrepModuleService;
    pool: any;
    offerId: string;
    intakeId: string;
    migrate: (Class: any, direction?: string) => Promise<void>;
  },
) {
  describe("arrangements and occurrence approvals on real PostgreSQL", () => {
    let service: MealPrepModuleService,
      pool: any,
      arrangement: any,
      occurrence: any,
      menu: any;
    const recurrence = {
      kind: "custom_dates" as const,
      timezone: "UTC",
      dates: [
        { id: "visit", localDate: "2027-01-01", localTime: "10:00" },
        { id: "next", localDate: "2027-01-02", localTime: "10:00" },
      ],
    };
    const run = (
      subjectId: string,
      expectedVersion: number,
      operation: string,
      extra: any = {},
      actor: any = chef,
      key?: string,
    ) =>
      service.executeApprovalCommand(
        {
          subjectId,
          expectedVersion,
          operation,
          idempotencyKey: key ?? `${operation}-${expectedVersion}`,
          ...extra,
        },
        actor,
      );
    const state = (id = occurrence.subjectId) =>
      service.readApprovalState(id, customer);
    const reset = async () => {
      const tables = [
        "chef_work_block",
        "chef_work_block_occurrence",
        "chef_time_reservation",
        "chef_event",
      ];
      for (const t of tables)
        await pool.query(
          `alter table ${t} disable trigger shared_time_no_truncate`,
        );
      await pool.query(
        "truncate chef_event,chef_work_block,chef_work_block_occurrence,chef_time_reservation,meal_prep_subject cascade",
      );
      for (const t of tables)
        await pool.query(
          `alter table ${t} enable trigger shared_time_no_truncate`,
        );
    };
    beforeEach(async () => {
      ({ service, pool } = get());
      await reset();
      arrangement = await run("arrangement", 0, "propose_arrangement", {
        householdId: "household-1",
        customerId: "customer-1",
        method: "in_home",
        recurrence,
      });
      await run("arrangement", 1, "approve_arrangement", {
        revisionId: arrangement.revisionId,
      });
      const candidate = generateCandidates({
        arrangementId: "arrangement",
        revisionId: arrangement.revisionId,
        recurrence,
        bounds: { from: "2027-01-01", through: "2027-01-01" },
      })[0];
      occurrence = await run(candidate.occurrenceId, 0, "record_candidate", {
        arrangementId: "arrangement",
        arrangementRevisionId: arrangement.revisionId,
        localDate: candidate.localDate,
        slotId: candidate.slotId,
      });
      const selection = await service.saveCapture(
        request(get().offerId, get().intakeId),
        customer,
      );
      menu = {
        selectionRevisionId: selection.revisionId,
        quote: {
          status: "exact_review",
          currency: "USD",
          totalMinor: 1000,
          provenance: "Chef review only; pricing policies unresolved",
        },
      };
    });
    afterEach(async () => {
      await reset();
      await pool.query(
        `update availability_setting set weekly='{}',overrides='{"2027-01-01":[]}'`,
      );
      await pool.query(
        "insert into meal_prep_subject(id,chef_id,customer_id,kind) values ('legacy','chef-default','customer-1','arrangement')",
      );
    });
    const approveMenu = async () => {
      const proposed = await run(
        occurrence.subjectId,
        1,
        "propose_menu",
        { menu },
        customer,
      );
      await run(occurrence.subjectId, 2, "decide_menu", {
        revisionId: proposed.revisionId,
        decision: "approved",
      });
      return proposed;
    };
    billingTests(() => ({
      service,
      pool,
      occurrence,
      menu,
      approveMenu,
      run,
      migrate: get().migrate,
    }));
    it("separates arrangement approval, candidate identity and every initial menu/quote review", async () => {
      expect((await state()).state).toMatchObject({
        arrangementApproved: true,
        confirmedMenuRevisionId: null,
        proposedMenuRevisionId: null,
      });
      const approved = await approveMenu();
      expect((await state()).state.confirmedMenuRevisionId).toBe(
        approved.revisionId,
      );
      const c = generateCandidates({
        arrangementId: "arrangement",
        revisionId: arrangement.revisionId,
        recurrence,
        bounds: { from: "2027-01-02", through: "2027-01-02" },
      })[0];
      await run(c.occurrenceId, 0, "record_candidate", {
        arrangementId: "arrangement",
        arrangementRevisionId: arrangement.revisionId,
        localDate: c.localDate,
        slotId: c.slotId,
      });
      expect(
        (await state(c.occurrenceId)).state.confirmedMenuRevisionId,
      ).toBeNull();
      expect(
        (
          await pool.query(
            "select revision_kind from meal_prep_approval order by created_at",
          )
        ).rows.map((r: any) => r.revision_kind),
      ).toEqual(["arrangement", "menu"]);
      expect(
        (await pool.query("select topic from meal_prep_outbox")).rows.every(
          (r: any) => !/payment|billing/.test(r.topic),
        ),
      ).toBe(true);
    });
    it("serializes retry creation, stale chefs, and conflicting idempotency reuse", async () => {
      const proposed = await run(
        occurrence.subjectId,
        1,
        "propose_menu",
        { menu },
        customer,
      );
      const calls = () =>
        run(occurrence.subjectId, 2, "decide_menu", {
          revisionId: proposed.revisionId,
          decision: "approved",
        });
      const results = await Promise.all([calls(), calls()]);
      expect(results[0]).toEqual(results[1]);
      await expect(
        run(occurrence.subjectId, 2, "decide_menu", {
          revisionId: proposed.revisionId,
          decision: "rejected",
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const pending = await run(
        occurrence.subjectId,
        3,
        "request_change",
        { change: { type: "skip", reason: "away" } },
        customer,
      );
      const races = await Promise.allSettled(
        ["a", "b"].map((key) =>
          run(
            occurrence.subjectId,
            4,
            "decide_change",
            { revisionId: pending.revisionId, decision: "rejected" },
            chef,
            key,
          ),
        ),
      );
      expect(races.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (races.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.code,
      ).toBe("STALE_VERSION");
    });
    it("duplicate candidate jobs return the same occurrence without repeating menus", async () => {
      const c = generateCandidates({
        arrangementId: "arrangement",
        revisionId: arrangement.revisionId,
        recurrence,
        bounds: { from: "2027-01-02", through: "2027-01-02" },
      })[0];
      const call = () =>
        run(c.occurrenceId, 0, "record_candidate", {
          arrangementId: "arrangement",
          arrangementRevisionId: arrangement.revisionId,
          localDate: c.localDate,
          slotId: c.slotId,
        });
      const rows = await Promise.all([call(), call()]);
      expect(rows[0]).toEqual(rows[1]);
      expect(
        (await state(c.occurrenceId)).state.confirmedMenuRevisionId,
      ).toBeNull();
    });
    it.each(["menu", "portions"])(
      "preserves confirmed details during a pending %s change and applies only chef approval",
      async (type) => {
        const first = await approveMenu();
        const changed = request(get().offerId, get().intakeId);
        changed.body.selection.lines[0].servings = 11;
        const selection = await service.saveCapture(
          { ...changed, expectedVersion: 1, idempotencyKey: "portions" },
          customer,
        );
        const revisedMenu = {
          ...menu,
          selectionRevisionId: selection.revisionId,
        };
        const pending = await run(
          occurrence.subjectId,
          3,
          "request_change",
          { change: { type, menu: revisedMenu } },
          customer,
        );
        expect((await state()).state.confirmedMenuRevisionId).toBe(
          first.revisionId,
        );
        await expect(
          run(
            occurrence.subjectId,
            4,
            "decide_change",
            { revisionId: pending.revisionId, decision: "approved" },
            customer,
          ),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await run(occurrence.subjectId, 4, "decide_change", {
          revisionId: pending.revisionId,
          decision: "approved",
        });
        expect((await state()).state.confirmedMenuRevisionId).toBe(
          pending.revisionId,
        );
        const stored = (
          await pool.query("select body from meal_prep_revision where id=$1", [
            first.revisionId,
          ])
        ).rows[0].body;
        expect(stored).toEqual(menu);
      },
    );
    it.each(["skip", "reschedule", "pause"])(
      "records and rejects %s while blocking unresolved application",
      async (type) => {
        const id = type === "pause" ? "arrangement" : occurrence.subjectId;
        const version = type === "pause" ? 2 : 1;
        const change =
          type === "pause"
            ? {
                type,
                from: "2027-01-01",
                through: "2027-02-01",
                reason: "away",
              }
            : type === "reschedule"
              ? {
                  type,
                  localDate: "2027-01-02",
                  instant: "2027-01-02T10:00:00Z",
                  reason: "away",
                }
              : { type, reason: "away" };
        const before = (await state(id)).state;
        const pending = await run(
          id,
          version,
          "request_change",
          { change },
          customer,
        );
        await expect(
          run(id, version + 1, "decide_change", {
            revisionId: pending.revisionId,
            decision: "approved",
          }),
        ).rejects.toMatchObject({
          code: "POLICY_REQUIRED",
          decisions: expect.arrayContaining([type === "pause" ? "D07" : "D06"]),
        });
        expect((await state(id)).state).toEqual({
          ...before,
          pendingChangeRevisionId: pending.revisionId,
        });
        await run(
          id,
          version + 1,
          "decide_change",
          { revisionId: pending.revisionId, decision: "rejected" },
          chef,
          "reject",
        );
        expect((await state(id)).state).toEqual(before);
        expect((await state()).state.candidate!.occurrenceId).toBe(
          occurrence.subjectId,
        );
      },
    );
    it("price changes stay pending behind D06 even with exact proposed amounts", async () => {
      await approveMenu();
      const pending = await run(
        occurrence.subjectId,
        3,
        "request_change",
        {
          change: {
            type: "menu",
            menu: { ...menu, quote: { ...menu.quote, totalMinor: 1500 } },
          },
        },
        customer,
      );
      await expect(
        run(occurrence.subjectId, 4, "decide_change", {
          revisionId: pending.revisionId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "POLICY_REQUIRED", decisions: ["D06"] });
    });
    it("unknown quote remains unknown, with no payable or payment-link event", async () => {
      const proposed = await run(
        occurrence.subjectId,
        1,
        "propose_menu",
        { menu: { ...menu, quote: { status: "unknown" } } },
        customer,
      );
      await run(occurrence.subjectId, 2, "decide_menu", {
        revisionId: proposed.revisionId,
        decision: "approved",
      });
      expect(
        (
          await pool.query("select body from meal_prep_revision where id=$1", [
            proposed.revisionId,
          ])
        ).rows[0].body.quote,
      ).toEqual({ status: "unknown" });
    });
    it("missed selection adds durable follow-up once, without any automatic menu or schedule change", async () => {
      const before = (await state()).state;
      await run(occurrence.subjectId, 1, "set_selection_deadline", {
        deadline: "2026-12-30T12:00:00Z",
      });
      const call = () =>
        run(occurrence.subjectId, 2, "flag_missed_selection", {
          now: "2026-12-30T12:00:01Z",
        });
      const results = await Promise.all([call(), call()]);
      expect(results[0]).toEqual(results[1]);
      expect((await state()).state).toEqual({
        ...before,
        followUp: true,
        selectionDeadline: "2026-12-30T12:00:00Z",
      });
      expect(
        (
          await pool.query(
            "select * from meal_prep_outbox where topic='meal_prep.selection_follow_up'",
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("does not flag an on-time pending selection as missing", async () => {
      await run(occurrence.subjectId, 1, "set_selection_deadline", {
        deadline: "2099-01-01T00:00:00Z",
      });
      await run(occurrence.subjectId, 2, "propose_menu", { menu }, customer);
      await expect(
        run(occurrence.subjectId, 3, "flag_missed_selection", {
          now: "2099-01-02T00:00:00Z",
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
    it.each([
      ["before", "2026-12-30T11:59:59.000Z", false],
      ["at", "2026-12-30T12:00:00.000Z", false],
      ["after", "2026-12-30T12:00:00.001Z", true],
    ] as const)(
      "uses the first valid selection %s the deadline after a later replacement",
      async (_label, firstSubmittedAt, missed) => {
        // Freeze Date only; database I/O and pool timeouts must keep real timers.
        jest.useFakeTimers({
          doNotFake: [
            "hrtime",
            "nextTick",
            "performance",
            "queueMicrotask",
            "setImmediate",
            "clearImmediate",
            "setInterval",
            "clearInterval",
            "setTimeout",
            "clearTimeout",
          ],
        });
        try {
          await run(occurrence.subjectId, 1, "set_selection_deadline", {
            deadline: "2026-12-30T12:00:00Z",
          });
          jest.setSystemTime(new Date(firstSubmittedAt));
          const first = await run(
            occurrence.subjectId,
            2,
            "propose_menu",
            { menu },
            customer,
          );
          const firstState = await state();
          const changed = request(get().offerId, get().intakeId);
          changed.body.selection.lines[0].servings = 11;
          const selection = await service.saveCapture(
            {
              ...changed,
              expectedVersion: 1,
              idempotencyKey: "late-selection-edit",
            },
            customer,
          );
          const replacement = {
            ...menu,
            selectionRevisionId: selection.revisionId,
          };
          jest.setSystemTime(new Date("2026-12-30T12:01:00Z"));
          const replace = () =>
            run(
              occurrence.subjectId,
              3,
              "propose_menu",
              { menu: replacement },
              customer,
            );
          const revised = await replace();
          expect(await replace()).toEqual(revised);
          const beforeCheck = await state();
          expect(beforeCheck.state).toMatchObject({
            selectionSubmittedAt: firstSubmittedAt,
            proposedMenuRevisionId: revised.revisionId,
            confirmedMenuRevisionId: null,
            followUp: false,
          });
          const history = await pool.query(
            "select body from meal_prep_approval_state where revision_id=$1",
            [first.revisionId],
          );
          expect(history.rows[0].body).toEqual(firstState.state);
          const proposal = await pool.query(
            "select body from meal_prep_revision where id=$1",
            [revised.revisionId],
          );
          expect(proposal.rows[0].body).toEqual(replacement);
          const counts = () =>
            pool.query(
              `select (select count(*) from meal_prep_revision) as revisions,
              (select count(*) from meal_prep_approval_state) as states,
              (select count(*) from meal_prep_command) as receipts,
              (select count(*) from meal_prep_audit) as audits,
              (select count(*) from meal_prep_outbox) as events`,
            );
          const beforeCounts = (await counts()).rows;
          const check = () =>
            run(occurrence.subjectId, 4, "flag_missed_selection", {
              now: "2026-12-30T12:02:00Z",
            });
          if (missed) {
            const flagged = await check();
            expect(await check()).toEqual(flagged);
            expect((await state()).state).toEqual({
              ...beforeCheck.state,
              followUp: true,
            });
          } else {
            await expect(check()).rejects.toMatchObject({
              code: "INVALID_STATE",
            });
            expect(await state()).toEqual(beforeCheck);
            expect((await counts()).rows).toEqual(beforeCounts);
          }
          expect(
            (
              await pool.query(
                "select * from meal_prep_outbox where topic='meal_prep.selection_follow_up'",
              )
            ).rows,
          ).toHaveLength(missed ? 1 : 0);
        } finally {
          jest.useRealTimers();
        }
      },
    );
    it("checks customer/chef/household ownership before command receipts and private reads", async () => {
      for (const actor of [
        { ...customer, customerId: "other" },
        { ...chef, chefId: "other" },
        {},
      ]) {
        await expect(
          service.readApprovalState(occurrence.subjectId, actor as any),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          run(occurrence.subjectId, 1, "propose_menu", { menu }, actor),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      const other = await service.saveCapture(
        {
          ...request(get().offerId, get().intakeId),
          captureId: "other-selection",
        },
        chef,
      );
      await pool.query(
        "update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'",
      );
      await expect(
        service.readApprovalState(occurrence.subjectId, chef),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        run(
          occurrence.subjectId,
          1,
          "propose_menu",
          { menu: { ...menu, selectionRevisionId: other.revisionId } },
          chef,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("revalidates the dated offer at chef approval and rolls back stale review", async () => {
      const proposed = await run(
        occurrence.subjectId,
        1,
        "propose_menu",
        { menu },
        customer,
      );
      await service.saveCapture(
        { ...offerInput, expectedVersion: 1, idempotencyKey: "new-offer" },
        chef,
      );
      await expect(
        run(occurrence.subjectId, 2, "decide_menu", {
          revisionId: proposed.revisionId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "STALE_REFERENCE" });
      expect((await state()).version).toBe(2);
      expect((await state()).state.confirmedMenuRevisionId).toBeNull();
    });
    it("rolls back approval, state, audit, outbox and version when the final receipt fails", async () => {
      const proposed = await run(
        occurrence.subjectId,
        1,
        "propose_menu",
        { menu },
        customer,
      );
      const before = await state();
      await pool.query(
        "alter table meal_prep_command add constraint test_fail check(idempotency_key <> 'fail')",
      );
      try {
        await expect(
          run(
            occurrence.subjectId,
            2,
            "decide_menu",
            { revisionId: proposed.revisionId, decision: "approved" },
            chef,
            "fail",
          ),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_command drop constraint test_fail",
        );
      }
      expect(await state()).toEqual(before);
      expect(
        (
          await pool.query(
            "select * from meal_prep_approval where subject_id=$1",
            [occurrence.subjectId],
          )
        ).rows,
      ).toHaveLength(0);
      await run(occurrence.subjectId, 2, "decide_menu", {
        revisionId: proposed.revisionId,
        decision: "approved",
      });
    });
    it("links explicit work atomically with workflow history and retains the linked-block freeze", async () => {
      await pool.query(
        `update availability_setting set weekly='{"5":[{"start":"08:00","end":"18:00"}]}',overrides='{}'`,
      );
      await pool.query(
        `insert into chef_work_block(id,resource_id,chef_id,purpose,starts_at,ends_at) values ('work','chef-default','chef-default','in_home','2027-01-01T10:00Z','2027-01-01T11:00Z')`,
      );
      const availabilityVersion = (
        await pool.query("select version from availability_setting")
      ).rows[0].version;
      const input = {
        blockId: "work",
        expectedBlockVersion: 1,
        expectedAvailabilityVersion: availabilityVersion,
      };
      await pool.query(
        "alter table meal_prep_command add constraint test_fail check(idempotency_key <> 'fail')",
      );
      try {
        await expect(
          run(occurrence.subjectId, 1, "link_work", input, chef, "fail"),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_command drop constraint test_fail",
        );
      }
      expect(
        (await pool.query("select * from chef_work_block_occurrence")).rows,
      ).toHaveLength(0);
      expect((await state()).version).toBe(1);
      const results = await Promise.all([
        run(occurrence.subjectId, 1, "link_work", input),
        run(occurrence.subjectId, 1, "link_work", input),
      ]);
      expect(results[0]).toEqual(results[1]);
      await pool.query("update availability_setting set overrides='{}'");
      await expect(
        run(occurrence.subjectId, 1, "link_work", input),
      ).resolves.toEqual(results[0]);
      expect((await state()).state.workBlockIds).toEqual(["work"]);
      expect(
        (await pool.query("select * from chef_time_reservation where active"))
          .rows,
      ).toHaveLength(1);
      await expect(
        pool.query(
          `update chef_work_block set starts_at='2027-01-01T12:00Z',ends_at='2027-01-01T13:00Z',version=version+1 where id='work'`,
        ),
      ).rejects.toThrow("Linked work requires approval");
      expect(
        (await pool.query("select * from chef_time_reservation_drift")).rows,
      ).toEqual([]);
    });
    it("keeps ambiguous DST candidates visible and blocks menu approval without an agreed resolution", async () => {
      const dst = {
        kind: "custom_dates" as const,
        timezone: "America/New_York",
        dates: [{ id: "fold", localDate: "2027-11-07", localTime: "01:30" }],
      };
      const a = await run("dst-arr", 0, "propose_arrangement", {
        householdId: "household-1",
        customerId: "customer-1",
        method: "in_home",
        recurrence: dst,
      });
      await run("dst-arr", 1, "approve_arrangement", {
        revisionId: a.revisionId,
      });
      const c = generateCandidates({
        arrangementId: "dst-arr",
        revisionId: a.revisionId,
        recurrence: dst,
        bounds: { from: "2027-11-07", through: "2027-11-07" },
      })[0];
      await run(c.occurrenceId, 0, "record_candidate", {
        arrangementId: "dst-arr",
        arrangementRevisionId: a.revisionId,
        localDate: c.localDate,
        slotId: c.slotId,
      });
      expect(
        (await state(c.occurrenceId)).state.candidate!.resolution.status,
      ).toBe("fold");
      await expect(
        run(c.occurrenceId, 1, "propose_menu", { menu }, customer),
      ).rejects.toMatchObject({
        code: "POLICY_REQUIRED",
        decisions: ["D09", "DST"],
      });
    });
    it("database rejects forged confirmed-menu state through generated persistence", async () => {
      const prior = await state();
      const draft = await service.stageRevision(
        {
          subjectId: occurrence.subjectId,
          expectedVersion: 1,
          idempotencyKey: "draft",
          kind: "change",
          body: {},
        },
        chef,
      );
      await expect(
        service.createMealPrepApprovalStates({
          id: "forged-state",
          subject_id: occurrence.subjectId,
          revision_id: draft.revisionId,
          version: 2,
          body: {
            ...prior.state,
            confirmedMenuRevisionId: arrangement.revisionId,
          },
        }),
      ).rejects.toThrow("Confirmed menu requires occurrence approval");
    });
    it("guards immutable history and refuses populated downgrade", async () => {
      await expect(
        pool.query("update meal_prep_approval_state set body='{}'::jsonb"),
      ).rejects.toThrow("append-only");
      await expect(
        pool.query("delete from meal_prep_approval_state"),
      ).rejects.toThrow("append-only");
      await expect(
        get().migrate(Migration20261030000500, "down"),
      ).rejects.toThrow("rollback refused");
    });
  });
}
