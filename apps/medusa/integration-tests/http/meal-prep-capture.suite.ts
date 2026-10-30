import { Migration20261015000200 } from "../../src/modules/experience-type/migrations/Migration20261015000200";
import { Migration20261015000300 } from "../../src/modules/chef-event/migrations/Migration20261015000300";
import { Migration20261030000200 } from "../../src/modules/shared-scheduling/migrations/Migration20261030000200";
import { approvalTests } from "./meal-prep-approvals.suite";
import { Migration20261030000500 } from "../../src/modules/meal-prep/migrations/Migration20261030000500";
/** Real PostgreSQL + actual Medusa service; explicit disposable server only. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { isSharedConnectionSymbol } from "@medusajs/framework/utils";
import { Migration20261030000100 } from "../../src/modules/meal-prep/migrations/Migration20261030000100";
import { Migration20261030000400 } from "../../src/modules/meal-prep/migrations/Migration20261030000400";
import { Migration20261015000100 } from "../../src/modules/availability/migrations/Migration20261015000100";
import { Migration20261030000300 } from "../../src/modules/availability/migrations/Migration20261030000300";
import type MealPrepModuleService from "../../src/modules/meal-prep/service";
import {
  chef,
  customer,
  offerInput,
  household,
  request,
  general,
  enabledSetup,
} from "../../src/modules/meal-prep/__tests__/capture-fixtures";
const { Pool } = require("pg");
const { initModules } = require("@medusajs/test-utils/dist/init-modules");
const url = process.env.MEAL_PREP_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "immutable dated offers, intake and ownership on PostgreSQL",
  () => {
    const schema = `meal_capture_${randomUUID().replace(/-/g, "")}`;
    let admin: any,
      pool: any,
      service: MealPrepModuleService,
      shutdown: (() => Promise<void>) | undefined;
    let offerId: string, intakeId: string;
    const migrate = async (Class: any, direction = "up") => {
      const migration = new Class(undefined, undefined);
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
    beforeAll(async () => {
      admin = new Pool({ connectionString: url });
      await admin.query(`create schema ${schema}`);
      pool = new Pool({
        connectionString: url,
        options: `-c search_path=${schema},public`,
      });
      await pool.query(
        `create table chef_event(id text primary key,status text not null default 'pending',"requestedDate" timestamptz not null,"requestedTime" text not null,"estimatedDuration" int,"productId" text,updated_at timestamptz default now(),deleted_at timestamptz)`,
      );
      await pool.query("create table experience_type(id text primary key)");
      for (const Class of [
        Migration20261015000100,
        Migration20261030000300,
        Migration20261030000100,
        Migration20261015000200,
        Migration20261015000300,
        Migration20261030000200,
      ])
        await migrate(Class);
      // Populated upgrade fixture: existing settings and foundation draft remain byte-for-byte intact.
      await pool.query(
        `insert into availability_setting(id,timezone,weekly,overrides,meal_prep) values ('chef-default','UTC','{}','{"2027-01-01":[]}', $1)`,
        [JSON.stringify(enabledSetup())],
      );
      await pool.query(
        `insert into meal_prep_subject(id,chef_id,customer_id,kind) values ('legacy','chef-default','customer-1','arrangement')`,
      );
      const before = (await pool.query("select * from availability_setting"))
        .rows;
      await migrate(Migration20261030000400);
      expect(
        (await pool.query("select * from availability_setting")).rows,
      ).toEqual(before);
      expect(
        (await pool.query("select id from meal_prep_subject")).rows,
      ).toEqual([{ id: "legacy" }]);
      await migrate(Migration20261030000400, "down");
      await migrate(Migration20261030000400);
      await migrate(Migration20261030000500);
      await migrate(Migration20261030000500, "down");
      await migrate(Migration20261030000500);
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
      service = loaded.medusaApp.modules.mealPrep;
      shutdown = loaded.shutdown;
    }, 60000);
    beforeEach(async () => {
      await pool.query("truncate meal_prep_capture cascade");
      await pool.query(
        `update availability_setting set meal_prep=$1,deleted_at=null`,
        [JSON.stringify(enabledSetup())],
      );
      offerId = (await service.saveCapture(offerInput, chef)).revisionId;
      intakeId = (await service.saveCapture(household, chef)).revisionId;
    });
    afterAll(async () => {
      await shutdown?.();
      await pool?.end();
      if (admin) {
        await admin.query(`drop schema if exists ${schema} cascade`);
        await admin.end();
      }
    });
    approvalTests(() => ({ service, pool, offerId, intakeId, migrate }));
    const count = async (table: string) =>
      Number(
        (await pool.query(`select count(*) from meal_prep_${table}`)).rows[0]
          .count,
      );

    it.each([
      "individual_dishes",
      "package",
      "chosen_menu",
      "tailored_plan",
    ] as const)(
      "persists %s requests without approval, price or side effects",
      async (style) => {
        const input = request(offerId, intakeId);
        const lines = input.body.selection.lines;
        input.body.selection =
          style === "package"
            ? { style, packageId: "package-1", lines }
            : style === "chosen_menu"
              ? { style, menuId: "menu-1", lines }
              : style === "tailored_plan"
                ? { style, brief: "PRIVATE tailored request", lines: [] }
                : { style, lines };
        const result = await service.saveCapture(input, customer);
        expect(
          (await service.readCaptureSnapshot(result.revisionId, customer)).body,
        ).toEqual(input.body);
        expect(
          (await service.readCaptureSnapshot(result.revisionId, chef))
            .availabilityVersion,
        ).toBeGreaterThan(0);
        expect(await count("approval")).toBe(0);
        expect(await count("outbox")).toBe(0);
        expect(
          JSON.stringify(
            (await pool.query("select * from meal_prep_capture_receipt")).rows,
          ),
        ).not.toMatch(/PRIVATE|Peanuts|Larger portions/);
        await expect(
          service.revalidateSelectionRequest(
            result.revisionId,
            "2027-01-01",
            chef,
          ),
        ).resolves.toMatchObject(result);
      },
    );
    it.each(["delivery", "pickup"] as const)(
      "stores conditional %s intake and rejects a stale method snapshot",
      async (method) => {
        const input = request(offerId, intakeId);
        input.body.method = method;
        await expect(
          service.saveCapture(input, customer),
        ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
        const intake =
          method === "delivery"
            ? {
                method,
                ...general,
                address: "PRIVATE DELIVERY",
                deliveryInstructions: null,
              }
            : { method, ...general };
        const next = await service.saveCapture(
          {
            ...household,
            expectedVersion: 1,
            idempotencyKey: "method",
            body: { kind: "household", intake },
          },
          customer,
        );
        input.body.intakeRevisionId = next.revisionId;
        await expect(
          service.saveCapture(input, customer),
        ).resolves.toMatchObject({ version: 1 });
        expect(
          (await service.readCaptureSnapshot(intakeId, customer)).body,
        ).toEqual(household.body);
      },
    );
    it("enforces customer, chef and household scope before reads, writes or idempotent receipt replay", async () => {
      const input = request(offerId, intakeId);
      const result = await service.saveCapture(input, customer);
      for (const principal of [
        { ...customer, customerId: "other" },
        { ...customer, chefId: "other" },
        { ...chef, chefId: "other" },
        {},
      ]) {
        await expect(
          service.saveCapture(input, principal as any),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        for (const revisionId of [intakeId, result.revisionId])
          await expect(
            service.readCaptureSnapshot(revisionId, principal as any),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      await expect(
        service.readCaptureSnapshot(offerId, customer),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.saveCapture(
          { ...household, captureId: "enrollment" },
          customer,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const other = await service.saveCapture(
        { ...household, captureId: "household-2", customerId: "other" },
        chef,
      );
      await expect(
        service.saveCapture(
          {
            ...input,
            captureId: "forged",
            body: { ...input.body, intakeRevisionId: other.revisionId },
          },
          chef,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const sameOwner = await service.saveCapture(
        { ...household, captureId: "household-3" },
        chef,
      );
      await expect(
        service.saveCapture(
          {
            ...input,
            captureId: "forged",
            body: { ...input.body, intakeRevisionId: sameOwner.revisionId },
          },
          customer,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await pool.query(
        `update meal_prep_capture set deleted_at=now(),version=version+1 where id='household-1'`,
      );
      await expect(service.saveCapture(input, customer)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        service.readCaptureSnapshot(result.revisionId, customer),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("keeps historical requests unchanged when offers/intake change and revalidates before review", async () => {
      const input = request(offerId, intakeId);
      const result = await service.saveCapture(input, customer);
      await expect(
        service.revalidateSelectionRequest(
          result.revisionId,
          "2027-01-02",
          chef,
        ),
      ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
      await service.saveCapture(
        {
          ...offerInput,
          expectedVersion: 1,
          idempotencyKey: "new-offer",
          body: {
            ...offerInput.body,
            dates: { kind: "date", date: "2027-02-01" },
          },
        },
        chef,
      );
      expect(
        (await service.readCaptureSnapshot(result.revisionId, customer)).body,
      ).toEqual(input.body);
      await expect(
        service.saveCapture({ ...input, captureId: "new-request" }, customer),
      ).rejects.toMatchObject({ code: "STALE_REFERENCE" });
      await expect(
        service.revalidateSelectionRequest(
          result.revisionId,
          "2027-01-01",
          chef,
        ),
      ).rejects.toMatchObject({ code: "STALE_REFERENCE" });
      for (const table of ["snapshot", "receipt"]) {
        await expect(
          pool.query(`update meal_prep_capture_${table} set deleted_at=now()`),
        ).rejects.toThrow("append-only");
        await expect(
          pool.query(`delete from meal_prep_capture_${table}`),
        ).rejects.toThrow("append-only");
      }
      await expect(
        service.updateMealPrepCaptureSnapshots({
          id: offerId,
          body: { changed: true },
        }),
      ).rejects.toThrow("append-only");
    });
    it("rejects stale intake and superseded request reviews", async () => {
      const input = request(offerId, intakeId);
      const first = await service.saveCapture(input, customer);
      await service.saveCapture(
        { ...input, expectedVersion: 1, idempotencyKey: "change" },
        customer,
      );
      await expect(
        service.revalidateSelectionRequest(
          first.revisionId,
          "2027-01-01",
          chef,
        ),
      ).rejects.toMatchObject({ code: "STALE_REFERENCE" });
      await service.saveCapture(
        { ...household, expectedVersion: 1, idempotencyKey: "updated-intake" },
        customer,
      );
      await expect(
        service.saveCapture({ ...input, captureId: "new" }, customer),
      ).rejects.toMatchObject({ code: "STALE_REFERENCE" });
    });
    it("serializes duplicate creation retries and stale writers; changed payload cannot reuse a key", async () => {
      const input = request(offerId, intakeId);
      const duplicate = await Promise.all([
        service.saveCapture(input, customer),
        service.saveCapture(input, customer),
      ]);
      expect(duplicate[0]).toEqual(duplicate[1]);
      expect(await count("capture_snapshot")).toBe(3);
      await expect(
        service.saveCapture(
          { ...input, body: { ...input.body, requestedDate: "2027-01-02" } },
          customer,
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const changes = await Promise.allSettled(
        ["change1", "change2"].map((idempotencyKey) =>
          service.saveCapture(
            { ...input, expectedVersion: 1, idempotencyKey },
            customer,
          ),
        ),
      );
      expect(changes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (changes.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.code,
      ).toBe("STALE_VERSION");
    });
    it("does not replay another actor's command receipt", async () => {
      const input = request(offerId, intakeId);
      await service.saveCapture(input, customer);
      await expect(service.saveCapture(input, chef)).rejects.toMatchObject({
        code: "STALE_VERSION",
      });
    });
    it("rolls back root, snapshot, receipt and version when the final write fails", async () => {
      await pool.query(
        `alter table meal_prep_capture_receipt add constraint test_fail check(capture_id <> 'selection-1')`,
      );
      try {
        await expect(
          service.saveCapture(request(offerId, intakeId), customer),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "alter table meal_prep_capture_receipt drop constraint test_fail",
        );
      }
      expect(await count("capture")).toBe(2);
      expect(await count("capture_snapshot")).toBe(2);
      await expect(
        service.saveCapture(request(offerId, intakeId), customer),
      ).resolves.toMatchObject({ version: 1 });
    });
    it("rechecks disabled methods/styles and creates no capacity or time reservation effects", async () => {
      const setup = enabledSetup();
      setup.selection_styles.individual_dishes = false;
      await pool.query("update availability_setting set meal_prep=$1", [
        JSON.stringify(setup),
      ]);
      await expect(
        service.saveCapture(request(offerId, intakeId), customer),
      ).rejects.toMatchObject({ code: "METHOD_OR_STYLE_DISABLED" });
      setup.selection_styles.individual_dishes = true;
      await pool.query("update availability_setting set meal_prep=$1", [
        JSON.stringify(setup),
      ]);
      for (let i = 0; i < 20; i++) {
        const input = request(offerId, intakeId);
        input.body.selection.lines[0].servings = 1000000;
        await service.saveCapture(
          { ...input, captureId: `request-${i}` },
          customer,
        );
      }
      expect(await count("capture_snapshot")).toBe(22);
      expect(
        (await pool.query("select overrides from availability_setting")).rows[0]
          .overrides,
      ).toEqual({ "2027-01-01": [] });
    });
    it("database guards prevent forged ownership and references through direct/generated writers", async () => {
      await expect(
        pool.query(
          `update meal_prep_capture set customer_id='other',version=version+1 where id='household-1'`,
        ),
      ).rejects.toThrow("identity is immutable");
      await expect(
        pool.query(
          `insert into meal_prep_capture(id,chef_id,customer_id,kind,household_id) values ('forged','chef-default','other','selection','household-1')`,
        ),
      ).rejects.toThrow("Invalid household reference");
      await expect(
        pool.query(`delete from meal_prep_capture where id='offer-1'`),
      ).rejects.toThrow("cannot be deleted");
      const input = request(offerId, intakeId);
      await service.saveCapture(input, customer);
      const other = await service.saveCapture(
        { ...household, captureId: "household-other" },
        chef,
      );
      await pool.query(
        `update meal_prep_capture set version=version+1 where id='selection-1'`,
      );
      await expect(
        pool.query(
          `insert into meal_prep_capture_snapshot(id,capture_id,chef_id,kind,revision_number,body,offer_revision_id,intake_revision_id,availability_version,contract_version,created_by)
      values ('forged','selection-1','chef-default','selection',2,$1,$2,$3,1,'1.1-r4','chef-user')`,
          [
            JSON.stringify({
              ...input.body,
              intakeRevisionId: other.revisionId,
            }),
            offerId,
            other.revisionId,
          ],
        ),
      ).rejects.toThrow("Invalid or stale snapshot reference");
    });
    it("waits for concurrent Availability edits and validates the committed enablement", async () => {
      const blocker = await pool.connect();
      await blocker.query("begin");
      const setup = enabledSetup();
      setup.methods.in_home.enabled = false;
      await blocker.query("update availability_setting set meal_prep=$1", [
        JSON.stringify(setup),
      ]);
      const pending = service.saveCapture(request(offerId, intakeId), customer);
      // Poll server lock state, not a timing assumption, to prove the service is waiting.
      try {
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          waiting =
            (
              await pool.query(
                "select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%select version, meal_prep from availability_setting%' and pid <> pg_backend_pid()",
              )
            ).rows.length > 0;
          if (!waiting) await new Promise((done) => setTimeout(done, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        await blocker.query("commit");
        blocker.release();
      }
      await expect(pending).rejects.toMatchObject({
        code: "METHOD_OR_STYLE_DISABLED",
      });
      expect(await count("capture")).toBe(2);
    });
    it("waits for offer revision changes and rejects a racing stale reference", async () => {
      const blocker = await pool.connect();
      await blocker.query("begin");
      await blocker.query(
        "update meal_prep_capture set version=version+1 where id='offer-1'",
      );
      const pending = service.saveCapture(request(offerId, intakeId), customer);
      try {
        let waiting = false;
        for (let i = 0; i < 100 && !waiting; i++) {
          waiting =
            (
              await pool.query(
                "select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%select * from meal_prep_capture where%' and pid <> pg_backend_pid()",
              )
            ).rows.length > 0;
          if (!waiting) await new Promise((done) => setTimeout(done, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        await blocker.query("commit");
        blocker.release();
      }
      await expect(pending).rejects.toMatchObject({ code: "STALE_REFERENCE" });
      expect(await count("capture")).toBe(2);
    });
    it("refuses populated rollback, including soft-deleted identities, and preserves legacy data", async () => {
      await pool.query(
        `update meal_prep_capture set deleted_at=now(),version=version+1`,
      );
      await expect(migrate(Migration20261030000400, "down")).rejects.toThrow(
        "rollback refused",
      );
      expect(await count("capture_snapshot")).toBe(2);
      expect(
        (await pool.query("select id from meal_prep_subject")).rows,
      ).toEqual([{ id: "legacy" }]);
    });
  },
);
