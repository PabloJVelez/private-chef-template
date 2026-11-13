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
  MEAL_PREP_CONTRACT,
  principalSchema,
  stageRevisionSchema,
  type JsonValue,
  type MealPrepPrincipal,
  type StageRevisionInput,
  type StageRevisionResult,
} from "./contracts";

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
