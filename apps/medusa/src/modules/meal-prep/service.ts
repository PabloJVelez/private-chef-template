import { createHash, randomUUID } from "node:crypto";
import type { Context } from "@medusajs/framework/types";
import type { EntityManager } from "@mikro-orm/knex";
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils";
import * as models from "./models/records";
import {
  parseCapture,
  localDateSchema,
  MealPrepCaptureError,
} from "./capture-contracts";
import { saveCapture, readCapture, revalidateCapture } from "./capture-storage";
import {
  MEAL_PREP_CONTRACT,
  principalSchema,
  stageRevisionSchema,
  type JsonValue,
  type MealPrepPrincipal,
  type StageRevisionInput,
  type StageRevisionResult,
} from "./contracts";

import {
  approvalCommandSchema,
  MealPrepApprovalError,
} from "./approval-contracts";
import { executeApprovalCommand, readApprovalState } from "./approval-storage";
import * as billing from "./billing-storage";
import {
  billingQuoteSchema,
  authorizePaymentSchema,
  requireBillingTestMode,
  type PaymentObservation,
} from "./billing-contracts";

import * as autopay from "./autopay-storage";
import {
  autopayCommandSchema,
  type SetupObservation,
  type AutopayObservation,
} from "./autopay-contracts";

import * as fulfillment from "./fulfillment-storage";
import {
  fulfillmentCommandSchema,
  operationsQuerySchema,
  requireFulfillmentTestMode,
} from "./fulfillment-contracts";

export class MealPrepFoundationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "STALE_VERSION"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_REVISION",
  ) {
    super(code);
  }
}

// Canonical object key ordering; arrays preserve order. Validated JSON only.
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export default class MealPrepModuleService extends MedusaService(models) {
  @InjectTransactionManager()
  async executeTestFulfillmentCommand(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireFulfillmentTestMode();
    return fulfillment.command(
      context.transactionManager!,
      fulfillmentCommandSchema.parse(input),
      principalSchema.parse(principal),
    );
  }
  @InjectTransactionManager()
  async readTestOperations(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireFulfillmentTestMode();
    return fulfillment.operations(
      context.transactionManager!,
      operationsQuerySchema.parse(input).subjectIds,
      principalSchema.parse(principal),
    );
  }

  @InjectTransactionManager()
  async executeTestAutopayCommand(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.command(
      context.transactionManager!,
      autopayCommandSchema.parse(input),
      principalSchema.parse(principal),
    );
  }
  @InjectTransactionManager()
  async prepareTestMethodSetup(
    setupId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.setupRequest(context.transactionManager!, setupId, true);
  }
  @InjectTransactionManager()
  async recordTestMethodSetup(
    setupId: string,
    observation: SetupObservation,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.recordSetup(
      context.transactionManager!,
      setupId,
      observation,
    );
  }
  @InjectTransactionManager()
  async prepareTestAutopayDispatch(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.prepareAutopay(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async readTestAutopayRequest(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.autoRow(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async recordTestAutopayObservation(
    attemptId: string,
    observation: AutopayObservation,
    event?: { eventId: string; accountId: string; payloadHash: string },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.recordAutopay(
      context.transactionManager!,
      attemptId,
      observation,
      event,
    );
  }
  @InjectTransactionManager()
  async recordTestAutopayPreCreateRejection(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.preCreateRejection(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async flagTestAutopayTransportFailure(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.transportFailure(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async prepareTestAutopayFallback(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.prepareFallback(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async claimTestTimedNotification(
    notificationId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.claimNotification(
      context.transactionManager!,
      notificationId,
    );
  }
  @InjectTransactionManager()
  async authorizeTestTimedNotification(
    notificationId: string,
    dispatchId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.authorizeNotification(
      context.transactionManager!,
      notificationId,
      dispatchId,
    );
  }
  @InjectTransactionManager()
  async finishTestTimedNotification(
    notificationId: string,
    dispatchId: string,
    outcome: "sent" | "retry" | "suppressed",
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return autopay.finishNotification(
      context.transactionManager!,
      notificationId,
      dispatchId,
      outcome,
    );
  }
  // Explicit test harness boundaries only. No route/job resolves these methods.
  // Production activation requires policy decisions plus a reviewed access/commerce adapter.
  @InjectTransactionManager()
  async approveTestBillingQuote(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.approveBillingQuote(
      context.transactionManager!,
      billingQuoteSchema.parse(input),
      principalSchema.parse(principal),
    );
  }
  @InjectTransactionManager()
  async authorizeTestManualPayment(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.authorizeManualPayment(
      context.transactionManager!,
      authorizePaymentSchema.parse(input),
      principalSchema.parse(principal),
    );
  }
  @InjectTransactionManager()
  async readTestBill(
    subjectId: string,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.readBill(
      context.transactionManager!,
      subjectId,
      principalSchema.parse(principal),
    );
  }
  @InjectTransactionManager()
  async prepareTestPaymentDispatch(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.prepareDispatch(context.transactionManager!, attemptId);
  }
  @InjectTransactionManager()
  async readTestPaymentRequest(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.paymentRequest(
      await billing.attempt(context.transactionManager!, attemptId),
    );
  }
  @InjectTransactionManager()
  async recordTestPaymentObservation(
    attemptId: string,
    observation: PaymentObservation,
    event?: { eventId: string; accountId: string; payloadHash: string },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.recordObservation(
      context.transactionManager!,
      attemptId,
      observation,
      event,
    );
  }
  @InjectTransactionManager()
  async flagTestPaymentTransportFailure(
    attemptId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    const row = await billing.attempt(context.transactionManager!, attemptId);
    if (row.state !== "succeeded")
      await context.transactionManager!.execute(
        `update meal_prep_payment_attempt set follow_up=true,updated_at=now() where id=?`,
        [attemptId],
      );
  }
  @InjectTransactionManager()
  async prepareTestPaymentNotification(
    billId: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.prepareNotification(context.transactionManager!, billId);
  }
  @InjectTransactionManager()
  async finishTestPaymentNotification(
    billId: string,
    delivered: boolean,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    return billing.finishNotification(
      context.transactionManager!,
      billId,
      delivered,
    );
  }
  @InjectTransactionManager()
  async claimTestCommerceResource(
    billId: string,
    kind: "order" | "collection",
    resourceId?: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    requireBillingTestMode();
    if (!["order", "collection"].includes(kind))
      throw new Error("INVALID_COMMERCE_KIND");
    return billing.commerceResource(
      context.transactionManager!,
      billId,
      kind,
      resourceId,
    );
  }
  /** Trusted internal commands only; production execution and access remain disabled. */
  @InjectTransactionManager()
  async executeApprovalCommand(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const actor = principalSchema.safeParse(principal);
    if (!actor.success) throw new MealPrepApprovalError("NOT_FOUND");
    const command = approvalCommandSchema.safeParse(input);
    if (!command.success) throw new MealPrepApprovalError("INVALID_INPUT");
    return executeApprovalCommand(
      context.transactionManager!,
      command.data,
      actor.data,
    );
  }

  @InjectTransactionManager()
  async readApprovalState(
    subjectId: string,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const actor = principalSchema.safeParse(principal);
    if (
      !actor.success ||
      typeof subjectId !== "string" ||
      !subjectId ||
      subjectId.length > 200
    )
      throw new MealPrepApprovalError("NOT_FOUND");
    return readApprovalState(
      context.transactionManager!,
      subjectId,
      actor.data,
    );
  }

  /** Internal command boundary only. The principal is supplied by a trusted resolver,
   * never request JSON. D10 customer adapters remain absent/disabled. */
  @InjectTransactionManager()
  async saveCapture(
    input: unknown,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const actor = principalSchema.safeParse(principal);
    if (!actor.success) throw new MealPrepCaptureError("NOT_FOUND");
    return saveCapture(
      context.transactionManager!,
      parseCapture(input),
      actor.data,
    );
  }

  @InjectTransactionManager()
  async readCaptureSnapshot(
    revisionId: string,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const actor = principalSchema.safeParse(principal);
    if (
      !actor.success ||
      typeof revisionId !== "string" ||
      !revisionId ||
      revisionId.length > 200
    )
      throw new MealPrepCaptureError("NOT_FOUND");
    return readCapture(context.transactionManager!, revisionId, actor.data);
  }

  @InjectTransactionManager()
  async revalidateSelectionRequest(
    revisionId: string,
    agreedDate: string,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const actor = principalSchema.safeParse(principal);
    if (!actor.success || actor.data.role !== "chef")
      throw new MealPrepCaptureError("NOT_FOUND");
    if (
      !localDateSchema.safeParse(agreedDate).success ||
      typeof revisionId !== "string" ||
      !revisionId ||
      revisionId.length > 200
    )
      throw new MealPrepCaptureError("INVALID_INPUT");
    return revalidateCapture(
      context.transactionManager!,
      revisionId,
      agreedDate,
      actor.data,
    );
  }

  /** Internal draft storage only. Principal must come from a trusted identity
   * resolver, never from request JSON. No routes/jobs use this in PR 1. */
  @InjectManager()
  async stageRevision(
    input: StageRevisionInput,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ): Promise<StageRevisionResult> {
    return this.stageRevision_(
      stageRevisionSchema.parse(input),
      principalSchema.parse(principal),
      context,
    );
  }

  @InjectTransactionManager()
  protected async stageRevision_(
    input: StageRevisionInput,
    principal: MealPrepPrincipal,
    @MedusaContext() context: Context<EntityManager> = {},
  ): Promise<StageRevisionResult> {
    const manager = context.transactionManager!;
    // Serialize all draft mutations and duplicate retries on the owning subject.
    // Authorize BEFORE looking up command receipts to avoid cross-owner leaks.
    const [subject] = await manager.execute(
      `select id, kind, version from meal_prep_subject
       where id = ? and chef_id = ? and deleted_at is null
         and (? = 'chef' or customer_id = ?) for update`,
      [
        input.subjectId,
        principal.chefId,
        principal.role,
        principal.role === "customer" ? principal.customerId : null,
      ],
    );
    if (!subject) throw new MealPrepFoundationError("NOT_FOUND");
    const { idempotencyKey, ...request } = input;
    const hash = createHash("sha256")
      .update(canonicalJson({ ...request, principal }))
      .digest("hex");
    const [existing] = await manager.execute(
      `select request_hash, result from meal_prep_command
       where subject_id = ? and actor_id = ? and operation = 'stage_revision' and idempotency_key = ?`,
      [input.subjectId, principal.actorId, idempotencyKey],
    );
    if (existing) {
      if (existing.request_hash !== hash)
        throw new MealPrepFoundationError("IDEMPOTENCY_CONFLICT");
      return existing.result as StageRevisionResult;
    }
    if (subject.version !== input.expectedVersion)
      throw new MealPrepFoundationError("STALE_VERSION");
    const allowed =
      subject.kind === "arrangement"
        ? ["arrangement", "change"]
        : ["menu", "quote", "change"];
    if (!allowed.includes(input.kind))
      throw new MealPrepFoundationError("INVALID_REVISION");
    const result = {
      revisionId: `mpr_${randomUUID()}`,
      version: subject.version + 1,
    };
    await manager.execute(
      "update meal_prep_subject set version = ?, updated_at = now() where id = ?",
      [result.version, input.subjectId],
    );
    await manager.execute(
      `insert into meal_prep_revision (id, subject_id, kind, revision_number, body, contract_version, created_by)
       values (?, ?, ?, ?, ?::jsonb, ?, ?)`,
      [
        result.revisionId,
        input.subjectId,
        input.kind,
        result.version,
        JSON.stringify(input.body),
        MEAL_PREP_CONTRACT,
        principal.actorId,
      ],
    );
    // Only reference metadata goes to audit/outbox. Intake and pricing bodies stay private.
    await manager.execute(
      `insert into meal_prep_audit (id, subject_id, revision_id, actor_id, action, resulting_version, contract_version)
       values (?, ?, ?, ?, 'revision_staged', ?, ?)`,
      [
        `mpa_${randomUUID()}`,
        input.subjectId,
        result.revisionId,
        principal.actorId,
        result.version,
        MEAL_PREP_CONTRACT,
      ],
    );
    await manager.execute(
      `insert into meal_prep_outbox (id, subject_id, revision_id, topic, deduplication_key, contract_version)
       values (?, ?, ?, 'meal_prep.revision_staged', ?, ?)`,
      [
        `mpo_${randomUUID()}`,
        input.subjectId,
        result.revisionId,
        `revision:${result.revisionId}`,
        MEAL_PREP_CONTRACT,
      ],
    );
    await manager.execute(
      `insert into meal_prep_command (id, subject_id, actor_id, operation, idempotency_key, request_hash, result)
       values (?, ?, ?, 'stage_revision', ?, ?, ?::jsonb)`,
      [
        `mpc_${randomUUID()}`,
        input.subjectId,
        principal.actorId,
        idempotencyKey,
        hash,
        JSON.stringify(result),
      ],
    );
    return result;
  }
}
