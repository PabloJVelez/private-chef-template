import { generateCandidates } from "../../src/modules/meal-prep/recurrence";
import type MealPrepModuleService from "../../src/modules/meal-prep/service";
import {
  chef,
  customer,
  request,
} from "../../src/modules/meal-prep/__tests__/capture-fixtures";
import { Migration20261031000600 } from "../../src/modules/meal-prep/migrations/Migration20261031000600";
import {
  dispatchTestManualPayment,
  handleTestPaymentWebhook,
  dispatchTestPaymentNotification,
} from "../../src/modules/meal-prep/manual-payment-worker";
import type {
  ManualPaymentProvider,
  PaymentObservation,
  PaymentRequest,
} from "../../src/modules/meal-prep/billing-contracts";
import { MedusaTestBillingAdapter } from "../../src/modules/meal-prep/medusa-test-billing-adapter";

export function billingTests(
  get: () => {
    service: MealPrepModuleService;
    pool: any;
    occurrence: any;
    menu: any;
    approveMenu: () => Promise<any>;
    run: (...args: any[]) => Promise<any>;
    migrate: (Class: any, direction?: string) => Promise<void>;
  },
) {
  describe("approved-price billing and manual links on real PostgreSQL", () => {
    let service: MealPrepModuleService,
      pool: any,
      occurrence: any,
      approved: any;
    const quote = (extra: any = {}) => ({
      subjectId: occurrence.subjectId,
      expectedVersion: 3,
      menuRevisionId: approved.revisionId,
      idempotencyKey: "bill",
      accountId: "acct_testchef",
      currency: "USD",
      totalMinor: 1000,
      components: [
        {
          kind: "cooking",
          amountMinor: 1000,
          provenance: "fixture-exact-chef-amount",
        },
      ],
      policyFixture: "test-only-unresolved-D04-D05-D10-D11",
      ...extra,
    });
    const authorize = (bill: any, extra: any = {}) => ({
      subjectId: occurrence.subjectId,
      expectedVersion: 3,
      ...bill,
      idempotencyKey: "pay",
      authorization: "pay_exact_quote_once",
      ...extra,
    });
    const count = async (table: string) =>
      Number(
        (await pool.query(`select count(*) from meal_prep_${table}`)).rows[0]
          .count,
      );
    const setup = async () => {
      const bill = await service.approveTestBillingQuote(quote(), chef);
      const a = await service.authorizeTestManualPayment(
        authorize(bill),
        customer,
      );
      return { ...bill, ...a };
    };
    let provider: ManualPaymentProvider,
      observation: PaymentObservation | undefined,
      createCount: number;
    beforeEach(async () => {
      ({ service, pool, occurrence } = get());
      approved = await get().approveMenu();
      observation = undefined;
      createCount = 0;
      provider = {
        create: jest.fn(async (r: PaymentRequest) => {
          createCount++;
          observation ??= {
            ...r,
            sessionId: "cs_test_manual",
            intentId: null,
            url: "https://checkout.stripe.com/c/pay/test",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            livemode: false,
            state: "open",
          };
          return { ...observation };
        }),
        retrieve: jest.fn(async () => ({ ...observation! })),
        verify: jest.fn((raw: Buffer, signature: string) => {
          if (signature !== "mock-valid") throw new Error("INVALID_WEBHOOK");
          return JSON.parse(raw.toString());
        }),
      };
    });
    const webhook = (
      attemptId: string,
      eventId = "evt_success",
      extra: any = {},
    ) =>
      handleTestPaymentWebhook(
        service,
        provider,
        Buffer.from(
          JSON.stringify({
            eventId,
            accountId: "acct_testchef",
            sessionId: "cs_test_manual",
            attemptId,
            ...extra,
          }),
        ),
        "mock-valid",
      );
    it("atomically snapshots an exact approved price and immediately queues one notification, without collecting", async () => {
      const results = await Promise.all([
        service.approveTestBillingQuote(quote(), chef),
        service.approveTestBillingQuote(quote(), chef),
      ]);
      expect(results[0]).toEqual(results[1]);
      for (const table of ["billing_quote", "bill", "payment_notification"])
        expect(await count(table)).toBe(1);
      expect(await count("payment_attempt")).toBe(0);
      expect(await count("payment_collection")).toBe(0);
      expect(
        (
          await pool.query(
            "select topic from meal_prep_outbox where topic='meal_prep.manual_payment_requested'",
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: false, total_minor: 1000, state: null });
      await expect(
        service.approveTestBillingQuote(
          quote({ accountId: "acct_other" }),
          chef,
        ),
      ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    });
    it.each([
      {
        totalMinor: 999,
        components: [
          { kind: "cooking", amountMinor: 999, provenance: "fixture" },
        ],
      },
      {
        components: [
          { kind: "cooking", amountMinor: 999, provenance: "fixture" },
        ],
      },
      { totalMinor: 10.1 },
      { totalMinor: 0 },
      { currency: "JPY" },
      { policyFixture: "approved" },
      { menuRevisionId: "forged" },
      { expectedVersion: 2 },
    ])(
      "rejects unknown, changed, stale or unsupported quote input %j",
      async (extra) => {
        await expect(
          service.approveTestBillingQuote(quote(extra), chef),
        ).rejects.toThrow();
        expect(await count("bill")).toBe(0);
      },
    );
    it("does not promote an approved unknown price into a bill", async () => {
      // The original revision is immutable: use a new occurrence with an unknown review.
      const candidate = (
        await service.readApprovalState(occurrence.subjectId, customer)
      ).state.candidate!;
      const state = await service.readApprovalState("arrangement", customer);
      const r = (
        await pool.query("select body from meal_prep_revision where id=$1", [
          state.state.arrangementRevisionId,
        ])
      ).rows[0];
      const c = generateCandidates({
        arrangementId: "arrangement",
        revisionId: state.state.arrangementRevisionId,
        recurrence: r.body.recurrence,
        bounds: { from: "2027-01-02", through: "2027-01-02" },
      })[0];
      await get().run(c.occurrenceId, 0, "record_candidate", {
        arrangementId: "arrangement",
        arrangementRevisionId: state.state.arrangementRevisionId,
        localDate: c.localDate,
        slotId: c.slotId,
      });
      const original = (
        await pool.query(
          "select body from meal_prep_capture_snapshot where id=$1",
          [get().menu.selectionRevisionId],
        )
      ).rows[0].body;
      const input = request(
        original.offerRevisionId,
        original.intakeRevisionId,
      );
      input.captureId = "next-selection";
      input.idempotencyKey = "next-selection";
      input.body.requestedDate = "2027-01-02";
      const selection = await service.saveCapture(input, customer);
      const proposal = await get().run(
        c.occurrenceId,
        1,
        "propose_menu",
        {
          menu: {
            selectionRevisionId: selection.revisionId,
            quote: { status: "unknown" },
          },
        },
        customer,
      );
      await get().run(c.occurrenceId, 2, "decide_menu", {
        revisionId: proposal.revisionId,
        decision: "approved",
      });
      await expect(
        service.approveTestBillingQuote(
          quote({
            subjectId: c.occurrenceId,
            menuRevisionId: proposal.revisionId,
            expectedVersion: 3,
          }),
          chef,
        ),
      ).rejects.toThrow("Billing requires exact");
      expect(candidate).toBeDefined();
    });
    it("rolls back quote, obligation, notification and audit if receipt insertion fails", async () => {
      await pool.query(
        "alter table meal_prep_command add constraint billing_fail check(operation<>'approve_billing_quote')",
      );
      try {
        await expect(
          service.approveTestBillingQuote(quote(), chef),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_command drop constraint billing_fail",
        );
      }
      for (const t of ["billing_quote", "bill", "payment_notification"])
        expect(await count(t)).toBe(0);
      expect(
        (
          await pool.query(
            "select * from meal_prep_outbox where topic='meal_prep.manual_payment_requested'",
          )
        ).rows,
      ).toEqual([]);
    });
    it("requires explicit customer authorization and rejects cross-owner reads, forged references and revoked households", async () => {
      const bill = await service.approveTestBillingQuote(quote(), chef);
      await expect(
        service.authorizeTestManualPayment(authorize(bill), chef),
      ).rejects.toThrow("CUSTOMER_AUTHORIZATION_REQUIRED");
      await expect(
        service.approveTestBillingQuote(quote(), customer),
      ).rejects.toThrow("NOT_FOUND");
      await expect(
        service.authorizeTestManualPayment(authorize(bill), {
          ...customer,
          role: "customer",
          customerId: "other",
        }),
      ).rejects.toThrow("NOT_FOUND");
      await expect(
        service.readTestBill(occurrence.subjectId, {
          ...customer,
          role: "customer",
          customerId: "other",
        }),
      ).rejects.toThrow("NOT_FOUND");
      await expect(
        service.authorizeTestManualPayment(
          authorize(bill, { quoteId: "other" }),
          customer,
        ),
      ).rejects.toThrow("NOT_FOUND");
      const a = await service.authorizeTestManualPayment(
        authorize(bill),
        customer,
      );
      await pool.query(
        "update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'",
      );
      await expect(
        service.authorizeTestManualPayment(authorize(bill), customer),
      ).rejects.toThrow("NOT_FOUND");
      await expect(
        dispatchTestManualPayment(service, provider, a.attemptId),
      ).rejects.toThrow("NOT_FOUND");
      expect(createCount).toBe(0);
    });
    it("serializes duplicate authorization and competing keys into one durable attempt", async () => {
      const bill = await service.approveTestBillingQuote(quote(), chef);
      const same = await Promise.all([
        service.authorizeTestManualPayment(authorize(bill), customer),
        service.authorizeTestManualPayment(authorize(bill), customer),
      ]);
      expect(same[0]).toEqual(same[1]);
      await expect(
        service.authorizeTestManualPayment(
          authorize(bill, { idempotencyKey: "other" }),
          customer,
        ),
      ).rejects.toThrow("EXISTING_ATTEMPT_RECONCILE");
      expect(await count("payment_attempt")).toBe(1);
    });
    it("persists the attempt before provider I/O and retries an ambiguous create with identical identity", async () => {
      const a = await setup();
      const original = provider.create;
      provider.create = jest.fn(async (request) => {
        expect(
          (
            await pool.query(
              "select state from meal_prep_payment_attempt where id=$1",
              [a.attemptId],
            )
          ).rows[0].state,
        ).toBe("unknown");
        await original(request);
        throw new Error("timeout after provider success");
      });
      await expect(
        dispatchTestManualPayment(service, provider, a.attemptId),
      ).rejects.toThrow("RECONCILIATION_REQUIRED");
      expect(await count("payment_collection")).toBe(0);
      provider.create = original;
      await dispatchTestManualPayment(service, provider, a.attemptId);
      expect((provider.create as jest.Mock).mock.calls[0][0]).toEqual(
        (provider.create as jest.Mock).mock.calls[1][0],
      );
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: false, state: "open" });
    });
    it("does not treat link creation, checkout completion without paid status, or redirect as collection", async () => {
      const a = await setup();
      await dispatchTestManualPayment(service, provider, a.attemptId);
      observation!.state = "processing";
      await webhook(a.attemptId, "evt_unpaid_completed");
      expect(await count("payment_collection")).toBe(0);
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: false, state: "processing", url: null });
    });
    it("deduplicates concurrent success and stale events, preserving one immutable collection", async () => {
      const a = await setup();
      await dispatchTestManualPayment(service, provider, a.attemptId);
      observation!.state = "succeeded";
      observation!.intentId = "pi_exact";
      await Promise.all([webhook(a.attemptId), webhook(a.attemptId)]);
      expect(await count("payment_collection")).toBe(1);
      expect(await count("payment_event")).toBe(1);
      observation!.state = "failed";
      await webhook(a.attemptId, "evt_late_failure");
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: true, state: "succeeded", url: null });
      await expect(
        webhook(a.attemptId, "evt_success", { extra: "changed" }),
      ).rejects.toThrow("EVENT_REPLAY_CONFLICT");
      await expect(
        pool.query("update meal_prep_payment_collection set total_minor=1"),
      ).rejects.toThrow("append-only");
    });
    it.each([
      "accountId",
      "quoteId",
      "currency",
      "totalMinor",
      "attemptId",
      "billId",
      "idempotencyKey",
      "livemode",
    ])(
      "rejects mismatched provider %s without collection or dedup poisoning",
      async (field) => {
        const a = await setup();
        await dispatchTestManualPayment(service, provider, a.attemptId);
        observation!.state = "succeeded";
        observation!.intentId = "pi_exact";
        (observation as any)[field] =
          field === "totalMinor" ? 999 : field === "livemode" ? true : "forged";
        await expect(webhook(a.attemptId)).rejects.toThrow("PROVIDER_MISMATCH");
        expect(await count("payment_collection")).toBe(0);
        expect(await count("payment_event")).toBe(0);
      },
    );
    it("authenticates webhook bytes before private reads and rejects wrong-account events", async () => {
      await expect(
        handleTestPaymentWebhook(
          service,
          provider,
          Buffer.from("{}"),
          "forged",
        ),
      ).rejects.toThrow("INVALID_WEBHOOK");
      expect(provider.retrieve).not.toHaveBeenCalled();
      const a = await setup();
      await expect(
        webhook(a.attemptId, "evt_wrong", { accountId: "acct_other" }),
      ).rejects.toThrow("PROVIDER_MISMATCH");
      expect(provider.retrieve).not.toHaveBeenCalled();
    });
    it.each(["failed", "requires_action", "expired"] as const)(
      "preserves scheduling and flags follow-up on %s",
      async (state) => {
        const a = await setup();
        const before = await service.readApprovalState(
          occurrence.subjectId,
          customer,
        );
        await dispatchTestManualPayment(service, provider, a.attemptId);
        observation!.state = state;
        await webhook(a.attemptId);
        expect(
          await service.readApprovalState(occurrence.subjectId, customer),
        ).toEqual(before);
        expect(
          (await pool.query("select follow_up from meal_prep_payment_attempt"))
            .rows[0].follow_up,
        ).toBe(true);
        expect(await count("payment_collection")).toBe(0);
        if (state === "expired")
          await expect(
            dispatchTestManualPayment(service, provider, a.attemptId),
          ).rejects.toThrow("LINK_TERMINAL");
      },
    );
    it("blocks menu/price replacement once billed, while requests and rejections remain possible", async () => {
      await setup();
      const change = await get().run(
        occurrence.subjectId,
        3,
        "request_change",
        { change: { type: "portions", menu: get().menu } },
        customer,
      );
      await expect(
        get().run(occurrence.subjectId, 4, "decide_change", {
          revisionId: change.revisionId,
          decision: "approved",
        }),
      ).rejects.toMatchObject({ code: "POLICY_REQUIRED", decisions: ["D06"] });
      expect(
        (await service.readApprovalState(occurrence.subjectId, customer)).state
          .confirmedMenuRevisionId,
      ).toBe(approved.revisionId);
      await get().run(occurrence.subjectId, 4, "decide_change", {
        revisionId: change.revisionId,
        decision: "rejected",
      });
      await expect(
        service.approveTestBillingQuote(
          quote({ expectedVersion: 5, idempotencyKey: "replacement" }),
          chef,
        ),
      ).rejects.toThrow("POLICY_REQUIRED_D06");
    });
    it("serializes a same-price menu change against billing the old menu", async () => {
      const change = await get().run(
        occurrence.subjectId,
        3,
        "request_change",
        { change: { type: "menu", menu: get().menu } },
        customer,
      );
      const outcomes = await Promise.allSettled([
        service.approveTestBillingQuote(quote({ expectedVersion: 4 }), chef),
        get().run(occurrence.subjectId, 4, "decide_change", {
          revisionId: change.revisionId,
          decision: "approved",
        }),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const current = await service.readApprovalState(
        occurrence.subjectId,
        customer,
      );
      if (outcomes[0].status === "fulfilled") {
        expect(current.state.confirmedMenuRevisionId).toBe(approved.revisionId);
        expect(await count("bill")).toBe(1);
      } else {
        expect(current.state.confirmedMenuRevisionId).toBe(change.revisionId);
        expect(await count("bill")).toBe(0);
      }
    });
    it("uses one provider key across concurrent dispatch and recovers a success that preceded local binding", async () => {
      const a = await setup();
      const original = provider.create;
      provider.create = jest.fn(async (r) => {
        await original(r);
        observation!.state = "succeeded";
        observation!.intentId = "pi_race";
        await webhook(a.attemptId, "evt_before_bind");
        return { ...observation! };
      });
      await Promise.all([
        dispatchTestManualPayment(service, provider, a.attemptId),
        dispatchTestManualPayment(service, provider, a.attemptId),
      ]);
      const keys = (provider.create as jest.Mock).mock.calls.map(
        (call) => call[0].idempotencyKey,
      );
      expect(new Set(keys).size).toBe(1);
      expect(await count("payment_collection")).toBe(1);
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: true });
    });
    it("rolls back a local success if collection insertion fails, then reconciles without another checkout", async () => {
      const a = await setup();
      await dispatchTestManualPayment(service, provider, a.attemptId);
      observation!.state = "succeeded";
      observation!.intentId = "pi_exact";
      await pool.query(
        "alter table meal_prep_payment_collection add constraint fail_collection check(false)",
      );
      try {
        await expect(webhook(a.attemptId)).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_payment_collection drop constraint fail_collection",
        );
      }
      expect(await count("payment_collection")).toBe(0);
      expect(await count("payment_event")).toBe(0);
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ paid: false, state: "open" });
      await webhook(a.attemptId);
      expect(createCount).toBe(1);
      expect(await count("payment_collection")).toBe(1);
    });
    it("refuses ambiguous creates past provider-key retention and hides expired URLs", async () => {
      const a = await setup();
      const now = Date.now();
      const clock = jest
        .spyOn(Date, "now")
        .mockReturnValue(now + 24 * 60 * 60 * 1000);
      try {
        await expect(
          dispatchTestManualPayment(service, provider, a.attemptId),
        ).rejects.toThrow("RECONCILIATION_REQUIRED");
      } finally {
        clock.mockRestore();
      }
      expect(createCount).toBe(0);
      await dispatchTestManualPayment(service, provider, a.attemptId);
      observation!.expiresAt = Math.floor(now / 1000) - 1;
      await webhook(a.attemptId, "evt_old_url");
      expect(
        await service.readTestBill(occurrence.subjectId, customer),
      ).toMatchObject({ url: null, paid: false });
    });
    it("still reconciles an already dispatched payment after household access is revoked", async () => {
      const a = await setup();
      await dispatchTestManualPayment(service, provider, a.attemptId);
      await pool.query(
        "update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'",
      );
      observation!.state = "succeeded";
      observation!.intentId = "pi_exact";
      await webhook(a.attemptId);
      expect(await count("payment_collection")).toBe(1);
      await expect(
        service.readTestBill(occurrence.subjectId, customer),
      ).rejects.toThrow("NOT_FOUND");
    });
    it("retries notification failure without undoing approval or duplicating delivered messages", async () => {
      const bill = await service.approveTestBillingQuote(quote(), chef);
      const delivered = new Set<string>();
      let first = true;
      const sink = {
        send: jest.fn(async (message: any) => {
          delivered.add(message.idempotencyKey);
          if (first) {
            first = false;
            throw new Error("timeout");
          }
        }),
      };
      await expect(
        dispatchTestPaymentNotification(service, sink, bill.billId),
      ).rejects.toThrow("NOTIFICATION_RETRY_REQUIRED");
      await dispatchTestPaymentNotification(service, sink, bill.billId);
      await dispatchTestPaymentNotification(service, sink, bill.billId);
      expect(delivered.size).toBe(1);
      expect(sink.send).toHaveBeenCalledTimes(2);
      expect(
        (
          await pool.query(
            "select state,attempts from meal_prep_payment_notification",
          )
        ).rows[0],
      ).toEqual({ state: "sent", attempts: 2 });
      expect(
        (await service.readApprovalState(occurrence.subjectId, customer)).state
          .confirmedMenuRevisionId,
      ).toBe(approved.revisionId);
    });
    it("suppresses an undispatched request notification after verified collection", async () => {
      const a = await setup();
      await dispatchTestManualPayment(service, provider, a.attemptId);
      observation!.state = "succeeded";
      observation!.intentId = "pi_exact";
      await webhook(a.attemptId);
      const sink = { send: jest.fn() };
      await dispatchTestPaymentNotification(service, sink, a.billId);
      expect(sink.send).not.toHaveBeenCalled();
    });
    it("refuses populated billing rollback and immutable quote edits", async () => {
      await setup();
      await expect(
        get().migrate(Migration20261031000600, "down"),
      ).rejects.toThrow("Billing rollback refused");
      await expect(
        pool.query("update meal_prep_billing_quote set total_minor=1"),
      ).rejects.toThrow("append-only");
      await expect(pool.query("delete from meal_prep_bill")).rejects.toThrow(
        "append-only",
      );
    });
    it("durably links dedicated Medusa resources and blocks duplicate creation after a partial timeout", async () => {
      const bill = await service.approveTestBillingQuote(quote(), chef);
      let order: any, collection: any;
      const orders: any = {
        createOrders: jest.fn(async (input) => {
          order = { ...input, id: "order_meal", total: 10 };
          return order;
        }),
        retrieveOrder: jest.fn(async () => order),
      };
      let fail = true;
      const payments: any = {
        createPaymentCollections: jest.fn(async (input) => {
          collection = { ...input, id: "paycol_meal" };
          if (fail) {
            fail = false;
            throw new Error("timeout");
          }
          return collection;
        }),
        retrievePaymentCollection: jest.fn(async () => collection),
      };
      const adapter = new MedusaTestBillingAdapter(service, orders, payments);
      await expect(adapter.materialize(bill.billId)).rejects.toThrow("timeout");
      await expect(adapter.materialize(bill.billId)).rejects.toThrow(
        "COMMERCE_RECONCILIATION_REQUIRED",
      );
      expect(orders.createOrders).toHaveBeenCalledTimes(1);
      expect(payments.createPaymentCollections).toHaveBeenCalledTimes(1);
      await adapter.recover(bill.billId, "collection", "paycol_meal");
      expect(await adapter.materialize(bill.billId)).toEqual({
        order: "order_meal",
        collection: "paycol_meal",
      });
      expect(await count("payment_collection")).toBe(0);
      collection.metadata.meal_prep_quote_id = "forged";
      await expect(
        adapter.recover(bill.billId, "collection", "paycol_meal"),
      ).rejects.toThrow("COMMERCE_MISMATCH");
    });
  });
}
