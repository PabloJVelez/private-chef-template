import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/knex";
import type { MealPrepPrincipal } from "./contracts";
import { readApprovalState } from "./approval-storage";
import {
  BillingError,
  assertObservation,
  type BillingQuoteInput,
  type AuthorizePaymentInput,
  type PaymentRequest,
  type PaymentObservation,
} from "./billing-contracts";

const uuid = (prefix: string) => `${prefix}_${randomUUID()}`;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Same lock order as approval commands; financial and menu transitions serialize.
async function lock(
  manager: EntityManager,
  subjectId: string,
  actor: MealPrepPrincipal,
) {
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${subjectId}`,
  ]);
  await manager.execute(
    `select id from meal_prep_subject where id=? for update`,
    [subjectId],
  );
  return readApprovalState(manager, subjectId, actor);
}
async function replay(
  manager: EntityManager,
  input: { subjectId: string; idempotencyKey: string },
  actor: MealPrepPrincipal,
  operation: string,
) {
  const [prior] = await manager.execute(
    `select request_hash,result from meal_prep_command where subject_id=? and actor_id=? and operation=? and idempotency_key=?`,
    [input.subjectId, actor.actorId, operation, input.idempotencyKey],
  );
  if (prior && prior.request_hash !== hash({ input, actor }))
    throw new BillingError("IDEMPOTENCY_CONFLICT");
  return prior?.result;
}
async function receipt(
  manager: EntityManager,
  input: { subjectId: string; idempotencyKey: string },
  actor: MealPrepPrincipal,
  operation: string,
  result: object,
) {
  await manager.execute(
    `insert into meal_prep_command(id,subject_id,actor_id,operation,idempotency_key,request_hash,result) values(?,?,?,?,?,?,?::jsonb)`,
    [
      uuid("mpc"),
      input.subjectId,
      actor.actorId,
      operation,
      input.idempotencyKey,
      hash({ input, actor }),
      JSON.stringify(result),
    ],
  );
}
export async function approveBillingQuote(
  manager: EntityManager,
  input: BillingQuoteInput,
  actor: MealPrepPrincipal,
) {
  if (actor.role !== "chef" || actor.chefId !== "chef-default")
    throw new BillingError("NOT_FOUND");
  const current = await lock(manager, input.subjectId, actor);
  const prior = await replay(manager, input, actor, "approve_billing_quote");
  if (prior) return prior as { billId: string; quoteId: string };
  if (current.version !== input.expectedVersion)
    throw new BillingError("STALE_VERSION");
  if (current.state.confirmedMenuRevisionId !== input.menuRevisionId)
    throw new BillingError("PRICE_NOT_APPROVED");
  const [existing] = await manager.execute(
    `select id from meal_prep_bill where subject_id=?`,
    [input.subjectId],
  );
  if (existing) throw new BillingError("POLICY_REQUIRED_D06");
  const result = { billId: uuid("mpbill"), quoteId: uuid("mpquote") };
  await manager.execute(
    `insert into meal_prep_billing_quote(id,subject_id,menu_revision_id,approval_version,chef_actor_id,account_id,currency,total_minor,components,policy_fixture,test_only)
    values(?,?,?,?,?,?,?,?,?::jsonb,?,true)`,
    [
      result.quoteId,
      input.subjectId,
      input.menuRevisionId,
      input.expectedVersion,
      actor.actorId,
      input.accountId,
      input.currency,
      input.totalMinor,
      JSON.stringify(input.components),
      input.policyFixture,
    ],
  );
  await manager.execute(
    `insert into meal_prep_bill(id,subject_id,quote_id) values(?,?,?)`,
    [result.billId, input.subjectId, result.quoteId],
  );
  await manager.execute(
    `insert into meal_prep_payment_notification(id,bill_id,state) values(?,?,'pending')`,
    [uuid("mpnotify"), result.billId],
  );
  await manager.execute(
    `insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version)
    values(?,?,?,'meal_prep.manual_payment_requested',?,'1.1-r4')`,
    [
      uuid("mpo"),
      input.subjectId,
      input.menuRevisionId,
      `manual-payment:${result.billId}`,
    ],
  );
  await manager.execute(
    `insert into meal_prep_audit(id,subject_id,revision_id,actor_id,action,resulting_version,contract_version)
    values(?,?,?,?,'test_billing_quote_approved',?,'1.1-r4')`,
    [
      uuid("mpa"),
      input.subjectId,
      input.menuRevisionId,
      actor.actorId,
      input.expectedVersion,
    ],
  );
  await receipt(manager, input, actor, "approve_billing_quote", result);
  return result;
}
export async function authorizeManualPayment(
  manager: EntityManager,
  input: AuthorizePaymentInput,
  actor: MealPrepPrincipal,
) {
  if (actor.role !== "customer")
    throw new BillingError("CUSTOMER_AUTHORIZATION_REQUIRED");
  const current = await lock(manager, input.subjectId, actor);
  const prior = await replay(manager, input, actor, "authorize_manual_payment");
  if (prior) return prior as { attemptId: string };
  if (current.version !== input.expectedVersion)
    throw new BillingError("STALE_VERSION");
  const [bill] = await manager.execute(
    `select b.*,q.menu_revision_id from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id
    where b.id=? and b.subject_id=? and q.id=?`,
    [input.billId, input.subjectId, input.quoteId],
  );
  if (!bill || bill.menu_revision_id !== current.state.confirmedMenuRevisionId)
    throw new BillingError("NOT_FOUND");
  const [existing] = await manager.execute(
    `select id,state from meal_prep_payment_attempt where bill_id=?`,
    [input.billId],
  );
  if (existing) throw new BillingError("EXISTING_ATTEMPT_RECONCILE");
  const result = { attemptId: uuid("mpattempt") };
  await manager.execute(
    `insert into meal_prep_payment_attempt(id,bill_id,customer_id,actor_id,authorization_kind,idempotency_key,state)
    values(?,?,?,?,?,?,'prepared')`,
    [
      result.attemptId,
      input.billId,
      actor.customerId,
      actor.actorId,
      input.authorization,
      `meal-prep:${result.attemptId}`,
    ],
  );
  await receipt(manager, input, actor, "authorize_manual_payment", result);
  return result;
}
export async function readBill(
  manager: EntityManager,
  subjectId: string,
  actor: MealPrepPrincipal,
) {
  await lock(manager, subjectId, actor); // Authorization and revoked household check precede private reads.
  const [bill] = await manager.execute(
    `select b.id,b.quote_id,q.total_minor,q.currency,q.menu_revision_id,a.id as attempt_id,a.state,
    case when a.state in ('open','requires_action','failed') and a.expires_at > extract(epoch from now()) then a.url else null end as url,
    exists(select 1 from meal_prep_payment_collection c where c.bill_id=b.id) as paid
    from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id left join meal_prep_payment_attempt a on a.bill_id=b.id where b.subject_id=?`,
    [subjectId],
  );
  if (!bill) throw new BillingError("NOT_FOUND");
  return bill;
}
export async function attempt(manager: EntityManager, attemptId: string) {
  // Worker-only data. This method is not a customer authorization boundary.
  const [identity] = await manager.execute(
    `select b.subject_id from meal_prep_payment_attempt a join meal_prep_bill b on b.id=a.bill_id where a.id=?`,
    [attemptId],
  );
  if (!identity) throw new BillingError("NOT_FOUND");
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${identity.subject_id}`,
  ]);
  await manager.execute(
    `select id from meal_prep_subject where id=? for update`,
    [identity.subject_id],
  );
  const [row] = await manager.execute(
    `select a.*,q.account_id,q.currency,q.total_minor,q.id as quote_id,b.subject_id,q.menu_revision_id
    from meal_prep_payment_attempt a join meal_prep_bill b on b.id=a.bill_id join meal_prep_billing_quote q on q.id=b.quote_id where a.id=? for update of a`,
    [attemptId],
  );
  return row;
}
export function paymentRequest(row: any): PaymentRequest {
  return {
    attemptId: row.id,
    billId: row.bill_id,
    quoteId: row.quote_id,
    accountId: row.account_id,
    currency: row.currency,
    totalMinor: row.total_minor,
    idempotencyKey: row.idempotency_key,
  };
}
export async function prepareDispatch(
  manager: EntityManager,
  attemptId: string,
) {
  const row = await attempt(manager, attemptId);
  if (row.state === "succeeded")
    return {
      request: paymentRequest(row),
      sessionId: row.session_id as string,
      complete: true,
    };
  if (row.state === "expired") throw new BillingError("LINK_TERMINAL");
  // Revocation prevents new dispatch. Reconciliation of an already dispatched payment must still run.
  const [owner] = await manager.execute(
    `select s.id from meal_prep_subject s join meal_prep_approval_state st on st.subject_id=s.id
    join meal_prep_capture h on h.id=st.body->>'householdId' where s.id=? and s.deleted_at is null and h.deleted_at is null
    and h.customer_id=? and st.body->>'confirmedMenuRevisionId'=? order by st.version desc limit 1`,
    [row.subject_id, row.customer_id, row.menu_revision_id],
  );
  if (!owner) throw new BillingError("NOT_FOUND");
  // Stripe's idempotency retention is finite. Never risk a second checkout after an ambiguous old create.
  if (
    !row.session_id &&
    Date.now() - new Date(row.created_at).getTime() >= 23 * 60 * 60 * 1000
  )
    throw new BillingError("RECONCILIATION_REQUIRED");
  await manager.execute(
    `update meal_prep_payment_attempt set state=case when session_id is null then 'unknown' else state end,
    dispatch_count=dispatch_count+1,updated_at=now() where id=?`,
    [row.id],
  );
  return {
    request: paymentRequest(row),
    sessionId: row.session_id as string | null,
    complete: false,
  };
}
export async function recordObservation(
  manager: EntityManager,
  attemptId: string,
  result: PaymentObservation,
  event?: { eventId: string; accountId: string; payloadHash: string },
) {
  const row = await attempt(manager, attemptId);
  assertObservation(paymentRequest(row), result);
  if (
    (row.session_id && row.session_id !== result.sessionId) ||
    (row.intent_id && result.intentId !== row.intent_id)
  )
    throw new BillingError("PROVIDER_MISMATCH");
  if (event) {
    if (event.accountId !== row.account_id)
      throw new BillingError("PROVIDER_MISMATCH");
    const [prior] = await manager.execute(
      `select * from meal_prep_payment_event where account_id=? and event_id=?`,
      [event.accountId, event.eventId],
    );
    if (prior) {
      if (
        prior.payload_hash !== event.payloadHash ||
        prior.attempt_id !== attemptId
      )
        throw new BillingError("EVENT_REPLAY_CONFLICT");
      return { duplicate: true, paid: row.state === "succeeded" };
    }
  }
  // Success is monotonic. Late failures/expiry cannot erase a collected payment.
  if (row.state !== "succeeded") {
    await manager.execute(
      `update meal_prep_payment_attempt set state=?,session_id=?,intent_id=?,url=?,expires_at=?,follow_up=?,updated_at=now() where id=?`,
      [
        result.state,
        result.sessionId,
        result.intentId,
        result.state === "expired" || result.state === "succeeded"
          ? null
          : result.url,
        result.expiresAt,
        ["failed", "requires_action", "expired"].includes(result.state),
        row.id,
      ],
    );
    if (result.state === "succeeded")
      await manager.execute(
        `insert into meal_prep_payment_collection(id,bill_id,attempt_id,account_id,intent_id,total_minor,currency) values(?,?,?,?,?,?,?)`,
        [
          uuid("mpcol"),
          row.bill_id,
          row.id,
          row.account_id,
          result.intentId,
          row.total_minor,
          row.currency,
        ],
      );
  }
  if (event)
    await manager.execute(
      `insert into meal_prep_payment_event(id,account_id,event_id,attempt_id,payload_hash,observed_state) values(?,?,?,?,?,?)`,
      [
        uuid("mpevt"),
        event.accountId,
        event.eventId,
        row.id,
        event.payloadHash,
        result.state,
      ],
    );
  return {
    duplicate: false,
    paid: row.state === "succeeded" || result.state === "succeeded",
  };
}
export async function prepareNotification(
  manager: EntityManager,
  billId: string,
) {
  const [bill] = await manager.execute(
    `select subject_id from meal_prep_bill where id=?`,
    [billId],
  );
  if (!bill) throw new BillingError("NOT_FOUND");
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${bill.subject_id}`,
  ]);
  const [row] = await manager.execute(
    `select * from meal_prep_payment_notification where bill_id=? for update`,
    [billId],
  );
  if (!row || ["sent", "suppressed"].includes(row.state)) return null;
  const [paid] = await manager.execute(
    `select id from meal_prep_payment_collection where bill_id=?`,
    [billId],
  );
  if (paid) {
    await manager.execute(
      `update meal_prep_payment_notification set state='suppressed' where id=?`,
      [row.id],
    );
    return null;
  }
  await manager.execute(
    `update meal_prep_payment_notification set attempts=attempts+1 where id=?`,
    [row.id],
  );
  await manager.execute(
    `update meal_prep_outbox set attempts=attempts+1 where deduplication_key=?`,
    [`manual-payment:${billId}`],
  );
  return {
    billId,
    subjectId: bill.subject_id as string,
    idempotencyKey: `manual-payment:${billId}`,
  };
}
export async function finishNotification(
  manager: EntityManager,
  billId: string,
  delivered: boolean,
) {
  await manager.execute(
    `update meal_prep_payment_notification set state=?,delivered_at=case when ? then now() else null end
    where bill_id=? and state in ('pending','failed')`,
    [delivered ? "sent" : "failed", delivered, billId],
  );
  if (delivered)
    await manager.execute(
      `update meal_prep_outbox set delivered_at=now() where deduplication_key=? and delivered_at is null`,
      [`manual-payment:${billId}`],
    );
}
export async function commerceResource(
  manager: EntityManager,
  billId: string,
  kind: "order" | "collection",
  resourceId?: string,
) {
  const [bill] = await manager.execute(
    `select q.*,b.id as bill_id from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id where b.id=?`,
    [billId],
  );
  if (!bill) throw new BillingError("NOT_FOUND");
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${bill.subject_id}`,
  ]);
  const [prior] = await manager.execute(
    `select resource_id from meal_prep_commerce_resource where bill_id=? and kind=?`,
    [billId, kind],
  );
  if (resourceId) {
    if (!prior || (prior.resource_id && prior.resource_id !== resourceId))
      throw new BillingError("COMMERCE_RECONCILIATION_REQUIRED");
    await manager.execute(
      `update meal_prep_commerce_resource set resource_id=? where bill_id=? and kind=?`,
      [resourceId, billId, kind],
    );
  } else if (!prior) {
    await manager.execute(
      `insert into meal_prep_commerce_resource(bill_id,kind) values(?,?)`,
      [billId, kind],
    );
  }
  return {
    claimed: !prior,
    resourceId: resourceId ?? prior?.resource_id ?? null,
    snapshot: {
      billId,
      quoteId: bill.id,
      subjectId: bill.subject_id,
      currency: bill.currency as "USD",
      totalMinor: bill.total_minor as number,
    },
  };
}
