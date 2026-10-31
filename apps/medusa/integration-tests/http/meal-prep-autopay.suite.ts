import type MealPrepModuleService from "../../src/modules/meal-prep/service";
import {
  chef,
  customer,
} from "../../src/modules/meal-prep/__tests__/capture-fixtures";
import { Migration20261031000700 } from "../../src/modules/meal-prep/migrations/Migration20261031000700";
import {
  dispatchTestAutopay,
  dispatchTestMethodSetup,
  prepareTestManualFallback,
  handleTestAutopayWebhook,
  dispatchTestTimedNotification,
} from "../../src/modules/meal-prep/autopay-worker";
import { dispatchTestManualPayment } from "../../src/modules/meal-prep/manual-payment-worker";
import type {
  AutopayProvider,
  AutopayObservation,
  SavedMethodProvider,
} from "../../src/modules/meal-prep/autopay-contracts";

export function autopayTests(
  get: () => {
    service: MealPrepModuleService;
    pool: any;
    occurrence: any;
    approveMenu: () => Promise<any>;
    migrate: (Class: any, direction?: string) => Promise<void>;
  },
) {
  describe("per-occurrence autopay and explicit-trigger reminders on real PostgreSQL", () => {
    let service: MealPrepModuleService,
      pool: any,
      occurrence: any,
      bill: any,
      setup: any,
      consent: any;
    let provider: AutopayProvider & SavedMethodProvider,
      observation: AutopayObservation | undefined;
    const count = async (t: string) =>
      Number(
        (await pool.query(`select count(*) from meal_prep_${t}`)).rows[0].count,
      );
    const cmd = (operation: string, extra: any = {}, actor: any = customer) =>
      service.executeTestAutopayCommand(
        {
          subjectId: occurrence.subjectId,
          ...bill,
          idempotencyKey: operation,
          operation,
          ...extra,
        },
        actor,
      );
    const opt = (extra: any = {}) =>
      cmd("opt_in", {
        expectedVersion: 3,
        setupId: setup.setupId,
        totalMinor: 1000,
        currency: "USD",
        authorization: "charge_exact_occurrence_once",
        termsVersion: "test-occurrence-consent-v1",
        ...extra,
      });
    const schedule = async (kind = "autopay", extra: any = {}) => {
      const now = Date.now();
      const clock = jest.spyOn(Date, "now").mockReturnValue(now - 120000);
      try {
        return await cmd(
          "schedule",
          {
            expectedVersion: 3,
            kind,
            trigger: {
              at: new Date(now - 60000).toISOString(),
              policyReference: "fixture-policy-not-product-approval",
              approvalReference: "fixture-approved-instant",
              fixture: "test-only-unresolved-D01",
            },
            ...extra,
          },
          chef,
        );
      } finally {
        clock.mockRestore();
      }
    };
    const prepared = async () => {
      consent = await opt();
      return schedule();
    };
    const event = async (
      attemptId: string,
      eventId = "evt_auto",
      extra: any = {},
    ) =>
      handleTestAutopayWebhook(
        service,
        provider,
        Buffer.from(
          JSON.stringify({
            attemptId,
            eventId,
            accountId: "acct_testchef",
            intentId: "pi_auto",
            ...extra,
          }),
        ),
        "valid",
      );
    const manual = () =>
      service.authorizeTestManualPayment(
        {
          subjectId: occurrence.subjectId,
          ...bill,
          expectedVersion: 3,
          idempotencyKey: "manual",
          authorization: "pay_exact_quote_once",
        },
        customer,
      );
    beforeEach(async () => {
      ({ service, pool, occurrence } = get());
      const menu = await get().approveMenu();
      bill = await service.approveTestBillingQuote(
        {
          subjectId: occurrence.subjectId,
          expectedVersion: 3,
          menuRevisionId: menu.revisionId,
          idempotencyKey: "bill",
          accountId: "acct_testchef",
          currency: "USD",
          totalMinor: 1000,
          components: [
            { kind: "cooking", amountMinor: 1000, provenance: "fixture" },
          ],
          policyFixture: "test-only-unresolved-D04-D05-D10-D11",
        },
        chef,
      );
      setup = await cmd("setup_method", { expectedVersion: 3 });
      observation = undefined;
      const ready = (r: any) => ({
        ...r,
        provider: "mock",
        providerCustomerId: "cus_fixture",
        sessionId: "setup_fixture",
        paymentMethodId: "pm_fixture",
        setupIntentId: "seti_fixture",
        url: null,
        state: "ready" as const,
        livemode: false as const,
      });
      provider = {
        createSetup: jest.fn(async (r) => ready(r)),
        retrieveSetup: jest.fn(async (r) => ready(r)),
        create: jest.fn(async (r) => {
          observation ??= {
            ...r,
            intentId: "pi_auto",
            livemode: false,
            state: "processing",
          };
          return { ...observation };
        }),
        retrieve: jest.fn(async () => ({ ...observation! })),
        cancel: jest.fn(async () => {
          observation!.state = "canceled";
          return { ...observation! };
        }),
        verify: jest.fn((raw, signature) => {
          if (signature !== "valid") throw new Error("INVALID_WEBHOOK");
          return JSON.parse(raw.toString());
        }),
      };
      await dispatchTestMethodSetup(service, provider, setup.setupId);
    });
    it("stores immutable exact consent with opt-in replay and never treats saved-method setup as consent", async () => {
      expect(await count("autopay_consent")).toBe(0);
      await expect(schedule()).rejects.toThrow("CONSENT_REVOKED_OR_INVALID");
      const results = await Promise.all([opt(), opt()]);
      expect(results[0]).toEqual(results[1]);
      expect(await count("autopay_consent")).toBe(1);
      await expect(
        pool.query("update meal_prep_autopay_consent set total_minor=1"),
      ).rejects.toThrow("append-only");
      await expect(
        pool.query("delete from meal_prep_autopay_consent"),
      ).rejects.toThrow("append-only");
      await expect(opt({ totalMinor: 999 })).rejects.toThrow(
        "IDEMPOTENCY_CONFLICT",
      );
    });
    it.each([
      { totalMinor: 999 },
      { currency: "EUR" },
      { quoteId: "forged" },
      { expectedVersion: 2 },
      { setupId: "forged" },
      { authorization: "pay_exact_quote_once" },
    ])("rejects non-exact or unauthorized opt-in %j", async (extra) => {
      await expect(opt(extra)).rejects.toThrow();
      expect(await count("autopay_consent")).toBe(0);
    });
    it("rejects chef opt-in and cross-customer/cross-household receipt access", async () => {
      const input = {
        expectedVersion: 3,
        setupId: setup.setupId,
        totalMinor: 1000,
        currency: "USD",
        authorization: "charge_exact_occurrence_once",
        termsVersion: "test-occurrence-consent-v1",
      };
      await expect(cmd("opt_in", input, chef)).rejects.toThrow(
        "AUTHORIZATION_REQUIRED",
      );
      await expect(
        cmd("opt_in", input, { ...customer, customerId: "other" }),
      ).rejects.toThrow("NOT_FOUND");
      consent = await opt();
      await pool.query(
        "update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'",
      );
      await expect(opt()).rejects.toThrow("NOT_FOUND");
    });
    it.each(["revoke", "invalidate_method"])(
      "%s prevents new provider attempts without deleting consent/history",
      async (operation) => {
        const a = await prepared();
        const input =
          operation === "revoke"
            ? { consentId: consent.consentId }
            : { setupId: setup.setupId };
        // Revocations intentionally have no stale-version requirement.
        const { quoteId, ...base } = bill;
        bill = base;
        await cmd(operation, input);
        await dispatchTestAutopay(service, provider, a.attemptId);
        bill = { ...bill, quoteId };
        await expect(manual()).resolves.toHaveProperty("attemptId");
        expect(provider.create).not.toHaveBeenCalled();
        expect(await count("autopay_consent")).toBe(1);
      },
    );
    it("serializes manual/autopay authorization and forbids a second charge path", async () => {
      consent = await opt();
      const outcomes = await Promise.allSettled([schedule(), manual()]);
      expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(
        (await count("autopay_attempt")) + (await count("payment_attempt")),
      ).toBe(1);
    });
    it("uses the same durable key for concurrent dispatch and duplicate schedules", async () => {
      const a = await prepared();
      // Replay exact schedule from its immutable command receipt.
      const row = (
        await pool.query(
          "select result from meal_prep_command where operation='autopay_schedule'",
        )
      ).rows[0];
      expect(row.result).toEqual(a);
      await Promise.all([
        dispatchTestAutopay(service, provider, a.attemptId),
        dispatchTestAutopay(service, provider, a.attemptId),
      ]);
      expect(
        new Set(
          (provider.create as jest.Mock).mock.calls.map(
            (c) => c[0].idempotencyKey,
          ),
        ).size,
      ).toBe(1);
      expect(await count("autopay_attempt")).toBe(1);
      await expect(manual()).rejects.toThrow("Autopay reconciliation required");
    });
    it("recovers timeout after provider success and never creates another intent after binding", async () => {
      const a = await prepared(),
        original = provider.create;
      provider.create = jest.fn(async (r) => {
        await original(r);
        observation!.state = "succeeded";
        throw new Error("ambiguous timeout");
      });
      await expect(
        dispatchTestAutopay(service, provider, a.attemptId),
      ).rejects.toThrow("RECONCILIATION_REQUIRED");
      expect(await count("payment_collection")).toBe(0);
      await expect(manual()).rejects.toThrow("Autopay reconciliation required");
      provider.create = original;
      await dispatchTestAutopay(service, provider, a.attemptId);
      const calls = (provider.create as jest.Mock).mock.calls.length;
      await dispatchTestAutopay(service, provider, a.attemptId);
      expect(provider.create).toHaveBeenCalledTimes(calls);
      expect(await count("payment_collection")).toBe(1);
      expect(
        (await service.readTestBill(occurrence.subjectId, customer)).paid,
      ).toBe(true);
    });
    it("does not retry an ambiguous create after revocation, but still reconciles signed success", async () => {
      const a = await prepared(),
        original = provider.create;
      provider.create = jest.fn(async (r) => {
        await original(r);
        observation!.state = "succeeded";
        throw new Error("timeout");
      });
      await expect(
        dispatchTestAutopay(service, provider, a.attemptId),
      ).rejects.toThrow();
      const { quoteId, ...base } = bill;
      bill = base;
      await cmd("revoke", { consentId: consent.consentId });
      await expect(
        dispatchTestAutopay(service, provider, a.attemptId),
      ).rejects.toThrow("CONSENT_REVOKED_OR_INVALID");
      await event(a.attemptId);
      expect(await count("payment_collection")).toBe(1);
    });
    it("refuses an ambiguous create outside provider idempotency retention", async () => {
      const a = await prepared();
      provider.create = jest.fn(async () => {
        throw new Error("timeout");
      });
      await expect(
        dispatchTestAutopay(service, provider, a.attemptId),
      ).rejects.toThrow();
      const clock = jest
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + 24 * 3600000);
      try {
        await expect(
          dispatchTestAutopay(service, provider, a.attemptId),
        ).rejects.toThrow("RECONCILIATION_REQUIRED");
      } finally {
        clock.mockRestore();
      }
      expect(provider.create).toHaveBeenCalledTimes(1);
    });
    it.each(["requires_action", "failed"] as const)(
      "%s preserves scheduling, prepares fallback and prevents collection until original intent is canceled",
      async (state) => {
        const before = await service.readApprovalState(
          occurrence.subjectId,
          customer,
        );
        const a = await prepared();
        await dispatchTestAutopay(service, provider, a.attemptId);
        observation!.state = state;
        await event(a.attemptId);
        const n = (
          await pool.query(
            "select * from meal_prep_notification_intent where kind='autopay_fallback'",
          )
        ).rows[0];
        expect(n.state).toBe("pending");
        await expect(manual()).rejects.toThrow(
          "Autopay reconciliation required",
        );
        await expect(service.claimTestTimedNotification(n.id)).rejects.toThrow(
          "RECONCILIATION_REQUIRED",
        );
        await prepareTestManualFallback(service, provider, a.attemptId);
        const ma = await manual();
        const manualProvider: any = {
          create: jest.fn(async (r: any) => ({
            ...r,
            sessionId: "cs_test_fallback",
            intentId: null,
            url: "https://checkout.stripe.com/c/pay/fallback",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            livemode: false,
            state: "open",
          })),
        };
        await dispatchTestManualPayment(service, manualProvider, ma.attemptId);
        expect(
          await service.readTestBill(occurrence.subjectId, customer),
        ).toMatchObject({
          total_minor: 1000,
          url: "https://checkout.stripe.com/c/pay/fallback",
          paid: false,
        });
        expect(
          await service.readApprovalState(occurrence.subjectId, customer),
        ).toEqual(before);
        expect(
          (await pool.query("select follow_up from meal_prep_autopay_attempt"))
            .rows[0].follow_up,
        ).toBe(true);
        const sink = { send: jest.fn() };
        await dispatchTestTimedNotification(service, sink, n.id);
        expect(sink.send).toHaveBeenCalledTimes(1);
      },
    );
    it("ambiguous cancellation blocks fallback, and racing success suppresses it", async () => {
      const a = await prepared();
      await dispatchTestAutopay(service, provider, a.attemptId);
      observation!.state = "requires_action";
      await event(a.attemptId);
      provider.cancel = jest.fn(async () => {
        throw new Error("timeout");
      });
      await expect(
        prepareTestManualFallback(service, provider, a.attemptId),
      ).rejects.toThrow("RECONCILIATION_REQUIRED");
      await expect(manual()).rejects.toThrow();
      provider.cancel = jest.fn(async () => ({
        ...observation!,
        state: "succeeded" as const,
      }));
      await prepareTestManualFallback(service, provider, a.attemptId);
      const n = (
        await pool.query("select id from meal_prep_notification_intent")
      ).rows[0];
      const sink = { send: jest.fn() };
      await dispatchTestTimedNotification(service, sink, n.id);
      expect(sink.send).not.toHaveBeenCalled();
      expect(await count("payment_collection")).toBe(1);
    });
    it("deduplicates webhook replay, refuses changed payloads, and never reverses success", async () => {
      const a = await prepared();
      await dispatchTestAutopay(service, provider, a.attemptId);
      observation!.state = "succeeded";
      await Promise.all([event(a.attemptId), event(a.attemptId)]);
      expect(await count("payment_collection")).toBe(1);
      expect(await count("autopay_event")).toBe(1);
      observation!.state = "failed";
      await event(a.attemptId, "evt_late");
      expect(
        (await pool.query("select state from meal_prep_autopay_attempt"))
          .rows[0].state,
      ).toBe("succeeded");
      await expect(
        event(a.attemptId, "evt_auto", { changed: true }),
      ).rejects.toThrow("EVENT_REPLAY_CONFLICT");
    });
    it.each([
      "totalMinor",
      "currency",
      "accountId",
      "quoteId",
      "consentId",
      "providerCustomerId",
      "paymentMethodId",
      "livemode",
    ])(
      "rejects mismatched provider %s before recording success or poisoning replay",
      async (field) => {
        const a = await prepared();
        await dispatchTestAutopay(service, provider, a.attemptId);
        observation!.state = "succeeded";
        (observation as any)[field] =
          field === "totalMinor" ? 999 : field === "livemode" ? true : "forged";
        await expect(event(a.attemptId)).rejects.toThrow("PROVIDER_MISMATCH");
        expect(await count("payment_collection")).toBe(0);
        expect(await count("autopay_event")).toBe(0);
      },
    );
    it("authenticates before private reads and rejects wrong-account webhooks", async () => {
      await expect(
        handleTestAutopayWebhook(
          service,
          provider,
          Buffer.from("{}"),
          "forged",
        ),
      ).rejects.toThrow("INVALID_WEBHOOK");
      expect(provider.retrieve).not.toHaveBeenCalled();
      const a = await prepared();
      await expect(
        event(a.attemptId, "evt_wrong", { accountId: "acct_other" }),
      ).rejects.toThrow("PROVIDER_MISMATCH");
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
    it("rolls back collection failure and reconciles the same provider intent", async () => {
      const a = await prepared();
      await dispatchTestAutopay(service, provider, a.attemptId);
      observation!.state = "succeeded";
      await pool.query(
        "alter table meal_prep_payment_collection add constraint auto_fail check(false)",
      );
      try {
        await expect(event(a.attemptId)).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_payment_collection drop constraint auto_fail",
        );
      }
      expect(await count("autopay_event")).toBe(0);
      expect(await count("payment_collection")).toBe(0);
      await event(a.attemptId);
      expect(await count("payment_collection")).toBe(1);
      expect(provider.create).toHaveBeenCalledTimes(1);
    });
    it("rejects missing timing policy, past approvals and premature dispatch without selecting a timezone", async () => {
      consent = await opt();
      await expect(
        cmd("schedule", { expectedVersion: 3, kind: "autopay" }, chef),
      ).rejects.toThrow();
      await expect(
        schedule("autopay", {
          trigger: {
            at: new Date().toISOString(),
            fixture: "test-only-unresolved-D01",
          },
        }),
      ).rejects.toThrow();
      await expect(
        schedule("autopay", {
          trigger: {
            at: "2000-01-01T00:00:00Z",
            policyReference: "fixture",
            approvalReference: "fixture",
            fixture: "test-only-unresolved-D01",
          },
        }),
      ).rejects.toThrow("LATE_TRIGGER_REQUIRES_POLICY");
      const a = await schedule("autopay", {
        trigger: {
          at: "2099-01-01T00:00:00+04:00",
          policyReference: "fixture",
          approvalReference: "fixture",
          fixture: "test-only-unresolved-D01",
        },
      });
      await expect(
        dispatchTestAutopay(service, provider, a.attemptId),
      ).rejects.toThrow("TRIGGER_NOT_DUE");
      expect(provider.create).not.toHaveBeenCalled();
    });
    it("suppresses a reminder when payment succeeds between claim and final dispatch authorization", async () => {
      const a = await prepared(),
        n = await schedule("unpaid_reminder", { idempotencyKey: "reminder" });
      const claim = await service.claimTestTimedNotification(n.notificationId);
      expect(claim).toBeTruthy();
      await dispatchTestAutopay(service, provider, a.attemptId);
      observation!.state = "succeeded";
      await event(a.attemptId);
      expect(
        await service.authorizeTestTimedNotification(
          n.notificationId,
          claim!.dispatchId,
        ),
      ).toBe(false);
      const sink = { send: jest.fn() };
      await dispatchTestTimedNotification(service, sink, n.notificationId);
      expect(sink.send).not.toHaveBeenCalled();
      expect(
        (await pool.query("select state from meal_prep_notification_intent"))
          .rows[0].state,
      ).toBe("suppressed");
    });
    it("retries delivery timeout with one key and durable dispatch/results, suppressing concurrent workers", async () => {
      const n = await schedule("unpaid_reminder"),
        delivered = new Set();
      let first = true;
      const sink = {
        send: jest.fn(async (m: any) => {
          delivered.add(m.idempotencyKey);
          if (first) {
            first = false;
            throw new Error("timeout after accepted");
          }
        }),
      };
      await expect(
        dispatchTestTimedNotification(service, sink, n.notificationId),
      ).rejects.toThrow("NOTIFICATION_RETRY_REQUIRED");
      await Promise.all([
        dispatchTestTimedNotification(service, sink, n.notificationId),
        dispatchTestTimedNotification(service, sink, n.notificationId),
      ]);
      await dispatchTestTimedNotification(service, sink, n.notificationId);
      expect(delivered.size).toBe(1);
      expect(sink.send).toHaveBeenCalledTimes(2);
      expect(await count("notification_dispatch")).toBe(2);
      expect(await count("notification_result")).toBe(2);
    });
    it("recovers an abandoned reminder lease with the same deduplication key and rejects stale authorization", async () => {
      const n = await schedule("unpaid_reminder");
      const first = await service.claimTestTimedNotification(n.notificationId);
      await pool.query(
        "update meal_prep_notification_intent set lease_until=now()-interval '1 second' where id=$1",
        [n.notificationId],
      );
      const second = await service.claimTestTimedNotification(n.notificationId);
      expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
      expect(second!.dispatchId).not.toBe(first!.dispatchId);
      expect(
        await service.authorizeTestTimedNotification(
          n.notificationId,
          first!.dispatchId,
        ),
      ).toBe(false);
      expect(
        await service.authorizeTestTimedNotification(
          n.notificationId,
          second!.dispatchId,
        ),
      ).toBe(true);
      await service.finishTestTimedNotification(
        n.notificationId,
        second!.dispatchId,
        "sent",
      );
      await service.finishTestTimedNotification(
        n.notificationId,
        first!.dispatchId,
        "retry",
      );
      expect(
        (await pool.query("select state from meal_prep_notification_intent"))
          .rows[0].state,
      ).toBe("sent");
    });
    it("reconciles an in-flight charge after opt-out without authorizing any further create", async () => {
      const a = await prepared();
      const original = provider.create;
      provider.create = jest.fn(async (r) => {
        await original(r);
        const { quoteId, ...base } = bill;
        bill = base;
        await cmd("revoke", { consentId: consent.consentId });
        return { ...observation!, state: "succeeded" as const };
      });
      await dispatchTestAutopay(service, provider, a.attemptId);
      await dispatchTestAutopay(service, provider, a.attemptId);
      expect(provider.create).toHaveBeenCalledTimes(1);
      expect(await count("payment_collection")).toBe(1);
      expect(await count("autopay_revocation")).toBe(1);
    });
    it("refuses populated downgrade and preserves immutable setup and trigger identity", async () => {
      const a = await prepared();
      expect(a.attemptId).toBeTruthy();
      await expect(
        get().migrate(Migration20261031000700, "down"),
      ).rejects.toThrow("Autopay rollback refused");
      await expect(
        pool.query("update meal_prep_payment_trigger set trigger_at=now()"),
      ).rejects.toThrow("append-only");
      await expect(
        pool.query(
          "update meal_prep_method_setup set payment_method_id='forged'",
        ),
      ).rejects.toThrow("immutable");
    });
  });
}
