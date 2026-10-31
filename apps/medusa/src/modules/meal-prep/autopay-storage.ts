import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/knex";
import type { MealPrepPrincipal } from "./contracts";
import { readApprovalState } from "./approval-storage";
import { BillingError } from "./billing-contracts";
import {
  assertAutopayObservation,
  type AutopayCommand,
  type AutopayRequest,
  type AutopayObservation,
  type SetupRequest,
  type SetupObservation,
} from "./autopay-contracts";
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const fail = (code: string): never => {
  throw new BillingError(code);
};

async function lockBill(m: EntityManager, billId: string) {
  const [b] = await m.execute(
    `select b.*,q.account_id,q.currency,q.total_minor,q.menu_revision_id,s.customer_id,s.chef_id
    from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id join meal_prep_subject s on s.id=b.subject_id where b.id=?`,
    [billId],
  );
  if (!b) fail("NOT_FOUND");
  await m.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${b.subject_id}`,
  ]);
  await m.execute(`select id from meal_prep_subject where id=? for update`, [
    b.subject_id,
  ]);
  return b;
}
async function paid(m: EntityManager, billId: string) {
  return (
    (
      await m.execute(
        `select id from meal_prep_payment_collection where bill_id=?`,
        [billId],
      )
    ).length > 0
  );
}
async function currentOwner(m: EntityManager, b: any, actorId: string) {
  const current = await readApprovalState(m, b.subject_id, {
    role: "customer",
    actorId,
    customerId: b.customer_id,
    chefId: b.chef_id,
  });
  if (current.state.confirmedMenuRevisionId !== b.menu_revision_id)
    fail("PRICE_NOT_APPROVED");
  return current;
}
async function validConsent(m: EntityManager, c: any) {
  if (
    !c ||
    (
      await m.execute(
        `select consent_id from meal_prep_autopay_revocation where consent_id=?`,
        [c.id],
      )
    ).length ||
    (
      await m.execute(
        `select setup_id from meal_prep_method_invalidation where setup_id=?`,
        [c.setup_id],
      )
    ).length
  )
    fail("AUTOPAY_CONSENT_REVOKED_OR_INVALID");
}
async function enqueue(
  m: EntityManager,
  b: any,
  kind: "unpaid_reminder" | "autopay_fallback",
  triggerId: string | null,
) {
  const notificationId = id("mpnotice");
  await m.execute(
    `insert into meal_prep_notification_intent(id,bill_id,kind,trigger_id,state) values(?,?,?,?,'pending') on conflict(bill_id,kind) do nothing`,
    [notificationId, b.id, kind, triggerId],
  );
  await m.execute(
    `insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version)
    values(?,?,?,?,?,'1.1-r4') on conflict(deduplication_key) do nothing`,
    [
      id("mpo"),
      b.subject_id,
      b.menu_revision_id,
      `meal_prep.${kind}`,
      `${kind}:${b.id}`,
    ],
  );
}
export async function command(
  m: EntityManager,
  input: AutopayCommand,
  actor: MealPrepPrincipal,
) {
  // Authorization precedes receipt/private-state reads, including revocation and replay.
  const b = await lockBill(m, input.billId);
  if (b.subject_id !== input.subjectId) fail("NOT_FOUND");
  const locked = await readApprovalState(m, input.subjectId, actor);
  if (
    input.operation === "schedule"
      ? actor.role !== "chef"
      : actor.role !== "customer"
  )
    fail("AUTHORIZATION_REQUIRED");
  const hash = createHash("sha256")
    .update(JSON.stringify({ input, actor }))
    .digest("hex");
  const operation = `autopay_${input.operation}`;
  const [prior] = await m.execute(
    `select request_hash,result from meal_prep_command where subject_id=? and actor_id=? and operation=? and idempotency_key=?`,
    [input.subjectId, actor.actorId, operation, input.idempotencyKey],
  );
  if (prior) {
    if (prior.request_hash !== hash) fail("IDEMPOTENCY_CONFLICT");
    return prior.result;
  }
  if (
    "expectedVersion" in input &&
    (locked.version !== input.expectedVersion ||
      b.quote_id !== input.quoteId ||
      locked.state.confirmedMenuRevisionId !== b.menu_revision_id)
  )
    fail("STALE_QUOTE_OR_VERSION");
  let result: any;
  switch (input.operation) {
    case "setup_method": {
      if (await paid(m, b.id)) fail("ALREADY_PAID");
      const setupId = id("mpsetup");
      await m.execute(
        `insert into meal_prep_method_setup(id,bill_id,customer_id,chef_id,account_id,actor_id,idempotency_key,state) values(?,?,?,?,?,?,?,'prepared')`,
        [
          setupId,
          b.id,
          b.customer_id,
          b.chef_id,
          b.account_id,
          actor.actorId,
          `setup:${setupId}`,
        ],
      );
      result = { setupId };
      break;
    }
    case "opt_in": {
      if (input.totalMinor !== b.total_minor || input.currency !== b.currency)
        fail("EXACT_AMOUNT_REQUIRED");
      if (await paid(m, b.id)) fail("ALREADY_PAID");
      const consentId = id("mpconsent");
      await m.execute(
        `insert into meal_prep_autopay_consent(id,bill_id,quote_id,setup_id,customer_id,actor_id,approval_version,total_minor,currency,account_id,authorization_kind,terms_version)
        values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          consentId,
          b.id,
          b.quote_id,
          input.setupId,
          b.customer_id,
          actor.actorId,
          input.expectedVersion,
          input.totalMinor,
          input.currency,
          b.account_id,
          input.authorization,
          input.termsVersion,
        ],
      );
      result = { consentId };
      break;
    }
    case "revoke": {
      const [c] = await m.execute(
        `select * from meal_prep_autopay_consent where id=? and bill_id=? and customer_id=?`,
        [input.consentId, b.id, b.customer_id],
      );
      if (!c) fail("NOT_FOUND");
      await m.execute(
        `insert into meal_prep_autopay_revocation(consent_id,actor_id) values(?,?) on conflict do nothing`,
        [c.id, actor.actorId],
      );
      // No external operation can exist before the durable dispatch marker. Release
      // only undispatched work so opt-out does not strand the customer's manual path.
      await m.execute(
        `update meal_prep_autopay_attempt set state='canceled',updated_at=now()
        where consent_id=? and state='prepared' and dispatched_at is null`,
        [c.id],
      );
      result = { consentId: c.id, revoked: true };
      break;
    }
    case "invalidate_method": {
      const [s] = await m.execute(
        `select id from meal_prep_method_setup where id=? and bill_id=? and customer_id=?`,
        [input.setupId, b.id, b.customer_id],
      );
      if (!s) fail("NOT_FOUND");
      await m.execute(
        `insert into meal_prep_method_invalidation(setup_id,actor_id) values(?,?) on conflict do nothing`,
        [s.id, actor.actorId],
      );
      const canceled = await m.execute(
        `update meal_prep_autopay_attempt set state='canceled',follow_up=true,updated_at=now()
        where bill_id=? and state='prepared' and dispatched_at is null returning id`,
        [b.id],
      );
      if (canceled.length) await enqueue(m, b, "autopay_fallback", null);
      result = { setupId: s.id, invalidated: true };
      break;
    }
    case "schedule": {
      if (await paid(m, b.id)) fail("ALREADY_PAID");
      const triggerId = id("mptrigger");
      // Accept only an explicit future approved instant. No late-approval/catch-up policy is inferred.
      if (Date.parse(input.trigger.at) <= Date.now())
        fail("LATE_TRIGGER_REQUIRES_POLICY");
      await m.execute(
        `insert into meal_prep_payment_trigger(id,bill_id,quote_id,kind,trigger_at,policy_reference,approval_reference,actor_id,fixture) values(?,?,?,?,?,?,?,?,?)`,
        [
          triggerId,
          b.id,
          b.quote_id,
          input.kind,
          input.trigger.at,
          input.trigger.policyReference,
          input.trigger.approvalReference,
          actor.actorId,
          input.trigger.fixture,
        ],
      );
      if (input.kind === "autopay") {
        const [c] = await m.execute(
          `select * from meal_prep_autopay_consent where bill_id=?`,
          [b.id],
        );
        await validConsent(m, c);
        const attemptId = id("mpauto");
        await m.execute(
          `insert into meal_prep_autopay_attempt(id,bill_id,consent_id,trigger_id,idempotency_key,state) values(?,?,?,?,?,'prepared')`,
          [attemptId, b.id, c.id, triggerId, `autopay:${attemptId}`],
        );
        result = { triggerId, attemptId };
      } else {
        await enqueue(m, b, "unpaid_reminder", triggerId);
        const [n] = await m.execute(
          `select id from meal_prep_notification_intent where bill_id=? and kind='unpaid_reminder'`,
          [b.id],
        );
        result = { triggerId, notificationId: n.id };
      }
      break;
    }
  }
  await m.execute(
    `insert into meal_prep_audit(id,subject_id,revision_id,actor_id,action,resulting_version,contract_version) values(?,?,?,?,?,?,'1.1-r4')`,
    [
      id("mpa"),
      b.subject_id,
      b.menu_revision_id,
      actor.actorId,
      operation,
      locked.version,
    ],
  );
  await m.execute(
    `insert into meal_prep_command(id,subject_id,actor_id,operation,idempotency_key,request_hash,result) values(?,?,?,?,?,?,?::jsonb)`,
    [
      id("mpc"),
      b.subject_id,
      actor.actorId,
      operation,
      input.idempotencyKey,
      hash,
      JSON.stringify(result),
    ],
  );
  return result;
}
export async function setupRequest(
  m: EntityManager,
  setupId: string,
  dispatch: boolean,
) {
  const [identity] = await m.execute(
    `select bill_id from meal_prep_method_setup where id=?`,
    [setupId],
  );
  if (!identity) fail("NOT_FOUND");
  const b = await lockBill(m, identity.bill_id);
  const [row] = await m.execute(
    `select * from meal_prep_method_setup where id=? for update`,
    [setupId],
  );
  await currentOwner(m, b, row.actor_id);
  if (
    (
      await m.execute(
        `select setup_id from meal_prep_method_invalidation where setup_id=?`,
        [setupId],
      )
    ).length
  )
    fail("METHOD_INVALIDATED");
  if (
    dispatch &&
    !row.session_id &&
    Date.now() - new Date(row.created_at).getTime() >= 23 * 3600000
  )
    fail("SETUP_RECONCILIATION_REQUIRED");
  const request: SetupRequest = {
    setupId,
    accountId: row.account_id,
    customerId: row.customer_id,
    chefId: row.chef_id,
    idempotencyKey: row.idempotency_key,
  };
  return {
    request,
    sessionId: row.session_id as string | null,
    complete: row.state === "ready",
  };
}
export async function recordSetup(
  m: EntityManager,
  setupId: string,
  o: SetupObservation,
) {
  const { request } = await setupRequest(m, setupId, false);
  for (const k of ["setupId", "accountId", "customerId", "chefId"] as const)
    if (request[k] !== o[k]) fail("SETUP_MISMATCH");
  if (
    o.livemode !== false ||
    !o.provider ||
    !o.providerCustomerId ||
    !o.sessionId ||
    !["ready", "pending"].includes(o.state) ||
    (o.state === "ready" && (!o.paymentMethodId || !o.setupIntentId))
  )
    fail("SETUP_MISMATCH");
  const [row] = await m.execute(
    `select * from meal_prep_method_setup where id=?`,
    [setupId],
  );
  if (row.state === "ready") {
    if (
      row.payment_method_id !== o.paymentMethodId ||
      row.setup_intent_id !== o.setupIntentId ||
      row.session_id !== o.sessionId ||
      row.provider_customer_id !== o.providerCustomerId ||
      row.provider !== o.provider
    )
      fail("SETUP_MISMATCH");
    return;
  }
  await m.execute(
    `update meal_prep_method_setup set provider=?,provider_customer_id=?,session_id=?,payment_method_id=?,setup_intent_id=?,url=?,state=? where id=?`,
    [
      o.provider,
      o.providerCustomerId,
      o.sessionId,
      o.paymentMethodId,
      o.setupIntentId,
      o.state === "ready" ? null : o.url,
      o.state,
      setupId,
    ],
  );
}
export async function autoRow(m: EntityManager, attemptId: string) {
  const [identity] = await m.execute(
    `select bill_id from meal_prep_autopay_attempt where id=?`,
    [attemptId],
  );
  if (!identity) fail("NOT_FOUND");
  const b = await lockBill(m, identity.bill_id);
  const [row] = await m.execute(
    `select a.*,c.setup_id,c.actor_id,m.provider,m.provider_customer_id,m.payment_method_id,t.trigger_at
    from meal_prep_autopay_attempt a join meal_prep_autopay_consent c on c.id=a.consent_id join meal_prep_method_setup m on m.id=c.setup_id
    join meal_prep_payment_trigger t on t.id=a.trigger_id where a.id=? for update of a`,
    [attemptId],
  );
  const request: AutopayRequest = {
    attemptId,
    billId: b.id,
    quoteId: b.quote_id,
    accountId: b.account_id,
    currency: b.currency,
    totalMinor: b.total_minor,
    idempotencyKey: row.idempotency_key,
    consentId: row.consent_id,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    paymentMethodId: row.payment_method_id,
  };
  return { row, b, request };
}
export async function prepareAutopay(m: EntityManager, attemptId: string) {
  const { row, b, request } = await autoRow(m, attemptId);
  if (["succeeded", "canceled"].includes(row.state))
    return { request, intentId: row.intent_id, action: "complete" as const };
  // A known intent is retrieved, never re-created or re-confirmed, even after revocation.
  if (row.intent_id)
    return {
      request,
      intentId: row.intent_id as string,
      action: "retrieve" as const,
    };
  await currentOwner(m, b, row.actor_id);
  await validConsent(m, { id: row.consent_id, setup_id: row.setup_id });
  if (await paid(m, b.id)) fail("ALREADY_PAID");
  if (Date.now() < new Date(row.trigger_at).getTime()) fail("TRIGGER_NOT_DUE");
  // Starts at first dispatch, not consent creation: this is provider key retention, not a billing deadline.
  if (
    row.dispatched_at &&
    Date.now() - new Date(row.dispatched_at).getTime() >= 23 * 3600000
  )
    fail("AUTOPAY_RECONCILIATION_REQUIRED");
  await m.execute(
    `update meal_prep_autopay_attempt set state='unknown',dispatched_at=coalesce(dispatched_at,now()),dispatch_count=dispatch_count+1,updated_at=now() where id=?`,
    [attemptId],
  );
  return { request, intentId: null, action: "create" as const };
}
export async function preCreateRejection(m: EntityManager, attemptId: string) {
  const { row, b } = await autoRow(m, attemptId);
  // The occurrence lock serializes this decision against dispatch and manual
  // authorization. Never erase a prior dispatch marker: an earlier call may
  // have created an intent even if this invocation never reached the provider.
  if (row.state !== "unknown" || row.intent_id || row.dispatch_count !== 1)
    return false;
  await m.execute(
    `update meal_prep_autopay_attempt set state='canceled',follow_up=true,updated_at=now() where id=?`,
    [attemptId],
  );
  await enqueue(m, b, "autopay_fallback", null);
  return true;
}
export async function transportFailure(m: EntityManager, attemptId: string) {
  const { row } = await autoRow(m, attemptId);
  if (row.state !== "succeeded")
    await m.execute(
      `update meal_prep_autopay_attempt set follow_up=true,updated_at=now() where id=?`,
      [attemptId],
    );
}
export async function recordAutopay(
  m: EntityManager,
  attemptId: string,
  o: AutopayObservation,
  event?: { eventId: string; accountId: string; payloadHash: string },
) {
  const { row, b, request } = await autoRow(m, attemptId);
  assertAutopayObservation(request, o);
  if (!row.dispatched_at || (row.intent_id && row.intent_id !== o.intentId))
    fail("PROVIDER_MISMATCH");
  if (event) {
    if (event.accountId !== request.accountId) fail("PROVIDER_MISMATCH");
    const [prior] = await m.execute(
      `select * from meal_prep_autopay_event where account_id=? and event_id=?`,
      [event.accountId, event.eventId],
    );
    if (prior) {
      if (
        prior.payload_hash !== event.payloadHash ||
        prior.attempt_id !== attemptId
      )
        fail("EVENT_REPLAY_CONFLICT");
      return;
    }
  }
  if (!["succeeded", "canceled"].includes(row.state)) {
    await m.execute(
      `update meal_prep_autopay_attempt set state=?,intent_id=?,follow_up=?,updated_at=now() where id=?`,
      [
        o.state,
        o.intentId,
        ["failed", "requires_action", "canceled"].includes(o.state),
        attemptId,
      ],
    );
    if (o.state === "succeeded")
      await m.execute(
        `insert into meal_prep_payment_collection(id,bill_id,autopay_attempt_id,account_id,intent_id,total_minor,currency) values(?,?,?,?,?,?,?)`,
        [
          id("mpcol"),
          b.id,
          attemptId,
          b.account_id,
          o.intentId,
          b.total_minor,
          b.currency,
        ],
      );
    if (["failed", "requires_action", "canceled"].includes(o.state))
      await enqueue(m, b, "autopay_fallback", null);
  } else if (row.state === "canceled" && o.state === "succeeded")
    fail("TERMINAL_PROVIDER_CONFLICT");
  if (event)
    await m.execute(
      `insert into meal_prep_autopay_event(id,account_id,event_id,attempt_id,payload_hash,observed_state) values(?,?,?,?,?,?)`,
      [
        id("mpevt"),
        event.accountId,
        event.eventId,
        attemptId,
        event.payloadHash,
        o.state,
      ],
    );
}
// A fallback notification is held until the original provider intent is definitively canceled.
// Hosted checkout still uses PR6's explicit customer authorization; this never fabricates consent.
export async function prepareFallback(m: EntityManager, attemptId: string) {
  const { row, b, request } = await autoRow(m, attemptId);
  if (row.state === "succeeded") return null;
  // Includes proven no-create rejection and undispatched opt-out/invalidation.
  if (row.state === "canceled" && !row.intent_id) return null;
  if (
    !row.intent_id ||
    !["failed", "requires_action", "canceled"].includes(row.state)
  )
    fail("AUTOPAY_RECONCILIATION_REQUIRED");
  await enqueue(m, b, "autopay_fallback", null);
  return {
    request,
    intentId: row.intent_id as string,
    canceled: row.state === "canceled",
  };
}
export async function claimNotification(
  m: EntityManager,
  notificationId: string,
) {
  const [identity] = await m.execute(
    `select bill_id from meal_prep_notification_intent where id=?`,
    [notificationId],
  );
  if (!identity) fail("NOT_FOUND");
  const b = await lockBill(m, identity.bill_id);
  const [n] = await m.execute(
    `select n.*,t.trigger_at from meal_prep_notification_intent n left join meal_prep_payment_trigger t on t.id=n.trigger_id where n.id=? for update of n`,
    [notificationId],
  );
  if (["sent", "suppressed"].includes(n.state)) return null;
  if (await paid(m, b.id)) {
    await m.execute(
      `update meal_prep_notification_intent set state='suppressed' where id=?`,
      [notificationId],
    );
    return null;
  }
  if (n.trigger_at && Date.now() < new Date(n.trigger_at).getTime())
    fail("TRIGGER_NOT_DUE");
  if (
    n.kind === "autopay_fallback" &&
    !(
      await m.execute(
        `select id from meal_prep_autopay_attempt where bill_id=? and state='canceled'`,
        [b.id],
      )
    ).length
  )
    fail("AUTOPAY_RECONCILIATION_REQUIRED");
  await currentOwner(m, b, "notification-worker");
  if (n.state === "inflight" && new Date(n.lease_until).getTime() > Date.now())
    return null;
  const dispatchId = id("mpdispatch");
  await m.execute(
    `insert into meal_prep_notification_dispatch(id,notification_id) values(?,?)`,
    [dispatchId, notificationId],
  );
  await m.execute(
    `update meal_prep_notification_intent set state='inflight',claim_id=?,lease_until=now()+interval '60 seconds' where id=?`,
    [dispatchId, notificationId],
  );
  await m.execute(
    `update meal_prep_outbox set attempts=attempts+1 where deduplication_key=?`,
    [`${n.kind}:${b.id}`],
  );
  return {
    notificationId,
    dispatchId,
    billId: b.id as string,
    subjectId: b.subject_id as string,
    kind: n.kind as "unpaid_reminder" | "autopay_fallback",
    idempotencyKey: `${n.kind}:${b.id}`,
  };
}
export async function authorizeNotification(
  m: EntityManager,
  notificationId: string,
  dispatchId: string,
) {
  const [n] = await m.execute(
    `select * from meal_prep_notification_intent where id=?`,
    [notificationId],
  );
  if (!n) fail("NOT_FOUND");
  const b = await lockBill(m, n.bill_id);
  const [latest] = await m.execute(
    `select * from meal_prep_notification_intent where id=?`,
    [notificationId],
  );
  if (
    latest.state !== "inflight" ||
    latest.claim_id !== dispatchId ||
    new Date(latest.lease_until).getTime() <= Date.now()
  )
    return false;
  if (await paid(m, b.id)) {
    await finishNotification(m, notificationId, dispatchId, "suppressed");
    return false;
  }
  await currentOwner(m, b, "notification-worker");
  return true;
}
export async function finishNotification(
  m: EntityManager,
  notificationId: string,
  dispatchId: string,
  outcome: "sent" | "retry" | "suppressed",
) {
  const [n] = await m.execute(
    `select * from meal_prep_notification_intent where id=?`,
    [notificationId],
  );
  if (!n) fail("NOT_FOUND");
  await lockBill(m, n.bill_id);
  const [d] = await m.execute(
    `select id from meal_prep_notification_dispatch where id=? and notification_id=?`,
    [dispatchId, notificationId],
  );
  if (!d) fail("NOT_FOUND");
  const [prior] = await m.execute(
    `select outcome from meal_prep_notification_result where dispatch_id=?`,
    [dispatchId],
  );
  if (prior) {
    if (prior.outcome !== outcome) fail("NOTIFICATION_RESULT_CONFLICT");
    return;
  }
  await m.execute(
    `insert into meal_prep_notification_result(dispatch_id,outcome) values(?,?) on conflict do nothing`,
    [dispatchId, outcome],
  );
  await m.execute(
    `update meal_prep_notification_intent set state=?,lease_until=null where id=? and claim_id=? and state='inflight'`,
    [outcome === "retry" ? "pending" : outcome, notificationId, dispatchId],
  );
  if (outcome === "sent")
    await m.execute(
      `update meal_prep_outbox set delivered_at=coalesce(delivered_at,now()) where deduplication_key=?`,
      [`${n.kind}:${n.bill_id}`],
    );
}
