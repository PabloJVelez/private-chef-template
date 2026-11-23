/** Explicit disposable test server only. Never reads DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { isSharedConnectionSymbol } from "@medusajs/framework/utils";
import { Migration20261030000100 } from "../../src/modules/meal-prep/migrations/Migration20261030000100";
import { Migration20261015000100 } from "../../src/modules/availability/migrations/Migration20261015000100";
import { Migration20261015000200 } from "../../src/modules/experience-type/migrations/Migration20261015000200";
import { Migration20261015000300 } from "../../src/modules/chef-event/migrations/Migration20261015000300";
import type MealPrepModuleService from "../../src/modules/meal-prep/service";
import type {
  MealPrepPrincipal,
  StageRevisionInput,
} from "../../src/modules/meal-prep/contracts";
const { Pool } = require("pg");
const { initModules } = require("@medusajs/test-utils/dist/init-modules");
const url = process.env.MEAL_PREP_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("meal-prep foundations on isolated PostgreSQL", () => {
  const schema = `meal_prep_test_${randomUUID().replace(/-/g, "")}`;
  let admin: any, pool: any, shutdown: (() => Promise<void>) | undefined;
  let service: MealPrepModuleService;
  const chef: MealPrepPrincipal = {
    role: "chef",
    actorId: "chef-user",
    chefId: "chef-1",
  };
  const customer: MealPrepPrincipal = {
    role: "customer",
    actorId: "customer-user",
    chefId: "chef-1",
    customerId: "customer-1",
  };
  const input = (
    extra: Partial<StageRevisionInput> = {},
  ): StageRevisionInput => ({
    subjectId: "arrangement-1",
    expectedVersion: 0,
    idempotencyKey: "request-1",
    kind: "arrangement",
    body: { note: "private draft" },
    ...extra,
  });
  const migrate = async (
    direction: "up" | "down",
    MigrationClass = Migration20261030000100,
  ) => {
    const migration = new MigrationClass(
      undefined as never,
      undefined as never,
    );
    await migration[direction]();
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const sql of migration.getQueries()) await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  const subjects = async () => {
    await pool.query(
      `insert into meal_prep_subject (id, chef_id, customer_id, kind) values ('arrangement-1','chef-1','customer-1','arrangement')`,
    );
    await pool.query(`insert into meal_prep_subject (id, chef_id, customer_id, kind, parent_id, parent_kind, generation_key)
      values ('occurrence-1','chef-1','customer-1','occurrence','arrangement-1','arrangement','explicit-generation-key')`);
  };
  const count = async (table: string) =>
    Number(
      (await pool.query(`select count(*) from meal_prep_${table}`)).rows[0]
        .count,
    );
  const decision = (
    revisionId: string,
    subjectId = "arrangement-1",
    kind = "arrangement",
  ) =>
    pool.query(
      `insert into meal_prep_approval (id, subject_id, revision_id, revision_kind, decision, chef_actor_id, expected_version, contract_version)
     values ($1,$2,$3,$4,'approved','chef-user',1,'1.1-r4')`,
      [randomUUID(), subjectId, revisionId, kind],
    );
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    // Upgrade fixture includes legacy active/completed/soft-deleted events and the actual Availability migrations.
    await pool.query(
      `create table chef_event (id text primary key,status text not null default 'pending',"requestedDate" timestamptz not null,"requestedTime" text not null,"estimatedDuration" int,"productId" text,updated_at timestamptz default now(),deleted_at timestamptz)`,
    );
    await pool.query("create table experience_type (id text primary key)");
    await pool.query(`insert into chef_event (id,status,"requestedDate","requestedTime","estimatedDuration",deleted_at) values
      ('active','confirmed','2026-11-02T10:00Z','10:00',60,null),
      ('completed','completed','2026-11-01T10:00Z','10:00',60,null),
      ('deleted','confirmed','2026-11-02T10:00Z','10:00',null,now())`);
    for (const MigrationClass of [
      Migration20261015000100,
      Migration20261015000200,
      Migration20261015000300,
    ]) {
      await migrate("up", MigrationClass);
    }
    const before = (await pool.query("select * from chef_event order by id"))
      .rows;
    await migrate("up");
    expect(
      (await pool.query("select * from chef_event order by id")).rows,
    ).toEqual(before);
    await migrate("down"); // Empty rollback works, followed by fresh installation.
    await migrate("up");
    // Reuse the SDK's schema-scoped connection for both raw SQL and ORM reads.
    const loaded = await initModules({
      databaseConfig: { clientUrl: url, schema },
      modulesConfig: {
        mealPrep: {
          resolve: resolve(__dirname, "../../src/modules/meal-prep"),
          options: {
            database: { clientUrl: url, schema },
            [isSharedConnectionSymbol]: true,
          },
        },
      },
    });
    shutdown = loaded.shutdown;
    service = loaded.medusaApp.modules.mealPrep;
  }, 60000);
  beforeEach(async () => {
    // TRUNCATE is confined to this generated schema on an explicit test server.
    await pool.query("truncate meal_prep_subject cascade");
    await subjects();
  });
  afterAll(async () => {
    await shutdown?.();
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  it("loads the real Medusa module and atomically persists a private draft with reference-only audit/outbox", async () => {
    const result = await service.stageRevision(input(), customer);
    expect(result.version).toBe(1);
    expect(
      (await service.retrieveMealPrepRevision(result.revisionId)).body,
    ).toEqual({ note: "private draft" });
    for (const table of ["revision", "audit", "outbox", "command"])
      expect(await count(table)).toBe(1);
    for (const table of ["audit", "outbox", "command"]) {
      expect(
        JSON.stringify(
          (await pool.query(`select * from meal_prep_${table}`)).rows,
        ),
      ).not.toContain("private draft");
    }
    expect(await count("approval")).toBe(0);
  });
  it("serializes concurrent duplicate retries and replays despite the now-stale expected version", async () => {
    const results = await Promise.all([
      service.stageRevision(input(), chef),
      service.stageRevision(input(), chef),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await service.stageRevision(input(), chef)).toEqual(results[0]);
    for (const table of ["revision", "audit", "outbox", "command"])
      expect(await count(table)).toBe(1);
  });
  it("canonicalizes object key order and rejects idempotency-key reuse with different content", async () => {
    const first = await service.stageRevision(
      input({ body: { a: 1, b: { c: 2, d: 3 } } }),
      chef,
    );
    expect(
      await service.stageRevision(
        input({ body: { b: { d: 3, c: 2 }, a: 1 } }),
        chef,
      ),
    ).toEqual(first);
    await expect(
      service.stageRevision(input({ body: { a: 9 } }), chef),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await count("revision")).toBe(1);
  });
  it("allows only one concurrent command for an expected version", async () => {
    const results = await Promise.allSettled([
      service.stageRevision(input(), chef),
      service.stageRevision(input({ idempotencyKey: "other" }), chef),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.code,
    ).toBe("STALE_VERSION");
    expect(await count("revision")).toBe(1);
  });
  it("checks chef and customer ownership before receipt lookup", async () => {
    await service.stageRevision(input(), customer);
    for (const principal of [
      { ...customer, customerId: "other" },
      { ...customer, chefId: "other" },
      { ...chef, chefId: "other" },
    ]) {
      await expect(
        service.stageRevision(input(), principal),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await count("revision")).toBe(1);
  });
  it("rejects invalid revision kinds without advancing a version", async () => {
    await expect(
      service.stageRevision(input({ kind: "menu" }), chef),
    ).rejects.toMatchObject({ code: "INVALID_REVISION" });
    expect(
      (
        await pool.query(
          `select version from meal_prep_subject where id='arrangement-1'`,
        )
      ).rows[0].version,
    ).toBe(0);
  });
  it("rolls back the entire transaction when the final receipt write fails", async () => {
    await pool.query(
      `alter table meal_prep_command add constraint test_receipt_failure check (operation <> 'stage_revision')`,
    );
    try {
      await expect(service.stageRevision(input(), chef)).rejects.toThrow();
      for (const table of ["revision", "audit", "outbox", "command"])
        expect(await count(table)).toBe(0);
      expect(
        (
          await pool.query(
            `select version from meal_prep_subject where id='arrangement-1'`,
          )
        ).rows[0].version,
      ).toBe(0);
    } finally {
      await pool.query(
        "alter table meal_prep_command drop constraint test_receipt_failure",
      );
    }
    await expect(service.stageRevision(input(), chef)).resolves.toMatchObject({
      version: 1,
    });
  });
  it("keeps an exact prior approval unchanged while staging a pending change", async () => {
    const first = await service.stageRevision(input(), chef);
    await decision(first.revisionId);
    const before = (await pool.query("select * from meal_prep_approval")).rows;
    const pending = await service.stageRevision(
      input({
        expectedVersion: 1,
        idempotencyKey: "change",
        kind: "change",
        body: { request: "pause" },
      }),
      customer,
    );
    await pool.query(
      `insert into meal_prep_change_request (id,subject_id,revision_id,revision_kind,request_type,base_version,requested_by)
      values ('change','arrangement-1',$1,'change','pause',1,'customer-user')`,
      [pending.revisionId],
    );
    expect((await pool.query("select * from meal_prep_approval")).rows).toEqual(
      before,
    );
    expect(await count("approval")).toBe(1);
    for (const table of [
      "revision",
      "approval",
      "change_request",
      "audit",
      "command",
    ]) {
      await expect(
        pool.query(`update meal_prep_${table} set deleted_at=now()`),
      ).rejects.toThrow("append-only");
      await expect(
        pool.query(`delete from meal_prep_${table}`),
      ).rejects.toThrow("append-only");
    }
    await expect(
      service.updateMealPrepRevisions({
        id: first.revisionId,
        body: { changed: true },
      }),
    ).rejects.toThrow("append-only");
  });
  it("enforces exact approval references and keeps arrangement decisions separate from occurrence menus", async () => {
    const first = await service.stageRevision(input(), chef);
    await expect(
      decision(first.revisionId, "occurrence-1"),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      decision(first.revisionId, "arrangement-1", "menu"),
    ).rejects.toMatchObject({ code: "23503" });
    await decision(first.revisionId);
    const menu = await service.stageRevision(
      input({ subjectId: "occurrence-1", kind: "menu" }),
      chef,
    );
    expect(
      (await pool.query("select revision_id from meal_prep_approval")).rows,
    ).toEqual([{ revision_id: first.revisionId }]);
    await decision(menu.revisionId, "occurrence-1", "menu");
    expect(await count("approval")).toBe(2);
  });
  it("permits only one initial arrangement approval across revisions", async () => {
    const first = await service.stageRevision(input(), chef);
    await decision(first.revisionId);
    const second = await service.stageRevision(
      input({ expectedVersion: 1, idempotencyKey: "second" }),
      chef,
    );
    await expect(decision(second.revisionId)).rejects.toMatchObject({
      code: "23505",
    });
    expect(await count("approval")).toBe(1);
  });
  it("prevents cross-owner parents, identity rewrites and generation-key reuse after soft deletion", async () => {
    await expect(
      pool.query(`insert into meal_prep_subject (id,chef_id,customer_id,kind,parent_id,parent_kind,generation_key)
      values ('forged','chef-1','other','occurrence','arrangement-1','arrangement','new-key')`),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        `update meal_prep_subject set customer_id='other',version=version+1 where id='occurrence-1'`,
      ),
    ).rejects.toThrow("identity is immutable");
    await pool.query(
      `update meal_prep_subject set deleted_at=now(),version=version+1 where id='occurrence-1'`,
    );
    await expect(
      pool.query(`delete from meal_prep_subject where id='occurrence-1'`),
    ).rejects.toThrow("cannot be deleted");
    await expect(
      service.stageRevision(
        input({ subjectId: "occurrence-1", kind: "menu" }),
        chef,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      pool.query(`insert into meal_prep_subject (id,chef_id,customer_id,kind,parent_id,parent_kind,generation_key)
      values ('duplicate','chef-1','customer-1','occurrence','arrangement-1','arrangement','explicit-generation-key')`),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("preserves durable outbox identity while permitting delivery bookkeeping", async () => {
    await service.stageRevision(input(), chef);
    await pool.query(
      "update meal_prep_outbox set attempts=1,delivered_at=now()",
    );
    await expect(
      pool.query(`update meal_prep_outbox set topic='other'`),
    ).rejects.toThrow("identity is immutable");
    await expect(
      pool.query("update meal_prep_outbox set delivered_at=null"),
    ).rejects.toThrow("cannot move backwards");
    await expect(
      pool.query("update meal_prep_outbox set attempts=0"),
    ).rejects.toThrow("cannot move backwards");
    await expect(pool.query("delete from meal_prep_outbox")).rejects.toThrow(
      "cannot be deleted",
    );
  });
  it("refuses populated rollback without losing data or touching legacy booking protection", async () => {
    await service.stageRevision(input(), chef);
    await expect(migrate("down")).rejects.toThrow("rollback refused");
    expect(await count("revision")).toBe(1);
    expect(
      (await pool.query("select count(*) from chef_event")).rows[0].count,
    ).toBe("3");
    await expect(
      pool.query(
        `update chef_event set "requestedDate"='2026-11-05T10:00Z' where id='active'`,
      ),
    ).rejects.toThrow("cannot be rescheduled");
    expect(
      (
        await pool.query(
          `select "occupiedStart" from chef_event where id='deleted'`,
        )
      ).rows[0].occupiedStart,
    ).toBeNull();
  });
});
