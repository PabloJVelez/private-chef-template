/** Explicit disposable PostgreSQL only. Never reads DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { isSharedConnectionSymbol } from "@medusajs/framework/utils";
import { Migration20261015000100 } from "../../src/modules/availability/migrations/Migration20261015000100";
import { Migration20261030000300 } from "../../src/modules/availability/migrations/Migration20261030000300";
import { Migration20261024000100 } from "../../src/modules/availability/migrations/Migration20261024000100";
import { Migration20261015000200 } from "../../src/modules/experience-type/migrations/Migration20261015000200";
import { Migration20261015000300 } from "../../src/modules/chef-event/migrations/Migration20261015000300";
import { Migration20261030000100 } from "../../src/modules/meal-prep/migrations/Migration20261030000100";
import { Migration20261030000200 } from "../../src/modules/shared-scheduling/migrations/Migration20261030000200";
import type SharedSchedulingService from "../../src/modules/shared-scheduling/service";
import ChefEventModuleService from "../../src/modules/chef-event/service";
import AvailabilityModuleService from "../../src/modules/availability/service";
const { Pool } = require("pg");
const { initModules } = require("@medusajs/test-utils/dist/init-modules");
const url = process.env.MEAL_PREP_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const start = "2026-11-02T10:00:00Z",
  end = "2026-11-02T11:00:00Z";

suite("shared occupied-time protection on PostgreSQL", () => {
  const schema = `shared_time_${randomUUID().replace(/-/g, "")}`;
  let pool: any, admin: any, shutdown: (() => Promise<void>) | undefined;
  let service: SharedSchedulingService;
  const migration = async (
    direction: "up" | "down",
    C: any = Migration20261030000200,
  ) => {
    const m = new C(undefined, undefined);
    await m[direction]();
    const c = await pool.connect();
    try {
      await c.query("begin");
      for (const sql of m.getQueries()) await c.query(sql);
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  };
  const event = (id = "event", client = pool) =>
    client.query(
      `insert into chef_event(id,"requestedDate","requestedTime","estimatedDuration") values ($1,$2,'10:00',60)`,
      [id, start],
    );
  const claim = (id = "event", client = pool, from = start, to = end) =>
    client.query(
      `update chef_event set "acceptanceToken"='owner',"occupiedStart"=$2,"occupiedEnd"=$3 where id=$1`,
      [id, from, to],
    );
  const block = (
    id = "block",
    client = pool,
    from = start,
    to = end,
    purpose = "preparation",
  ) =>
    client.query(
      `insert into chef_work_block(id,resource_id,chef_id,purpose,starts_at,ends_at) values ($1,'chef-default','chef-1',$4,$2,$3)`,
      [id, from, to, purpose],
    );
  const subjects = async (count = 2) => {
    await pool.query(
      `insert into meal_prep_subject(id,chef_id,customer_id,kind) values ('arr','chef-1','customer-1','arrangement')`,
    );
    for (let i = 0; i < count; i++)
      await pool.query(
        `insert into meal_prep_subject(id,chef_id,customer_id,kind,parent_id,parent_kind,generation_key)
       values ($1,'chef-1','customer-1','occurrence','arr','arrangement',$1)`,
        [`occ-${i}`],
      );
  };
  const link = (id = "block", occurrence = "occ-0", client = pool) =>
    client.query(
      `insert into chef_work_block_occurrence(block_id,occurrence_id,chef_id,customer_id,subject_kind)
     values ($1,$2,'chef-1','customer-1','occurrence')`,
      [id, occurrence],
    );
  const rows = async () =>
    (
      await pool.query(
        "select * from chef_time_reservation order by source_kind, source_id",
      )
    ).rows;
  const active = async () =>
    (await pool.query("select * from chef_time_reservation where active")).rows;
  const context = (client: any) => {
    const manager = {
      execute: async (sql: string, bindings: unknown[] = []) => {
        let i = 0;
        return (
          await client.query(
            sql.replace(/\?/g, () => `$${++i}`),
            bindings,
          )
        ).rows;
      },
    };
    return { manager, transactionManager: manager } as never;
  };
  const replacement = async (extra = {}) => ({
    id: "block",
    chefId: "chef-1",
    expectedVersion: 1,
    expectedAvailabilityVersion: (
      await pool.query(
        `select version from availability_setting where id='chef-default'`,
      )
    ).rows[0].version,
    start: "2026-11-02T12:00:00Z",
    end: "2026-11-02T13:00:00Z",
    ...extra,
  });
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    await pool.query(`create table chef_event (id text primary key,status text not null default 'pending',
      "requestedDate" timestamptz not null,"requestedTime" text not null,"estimatedDuration" int,"productId" text,
      updated_at timestamptz default now(),deleted_at timestamptz)`);
    await pool.query(
      "create table experience_type(id text primary key, advance_notice_days integer, requires_advance_notice boolean, deleted_at timestamptz)",
    );
    await pool.query(`insert into chef_event(id,status,"requestedDate","requestedTime","estimatedDuration",deleted_at) values
      ('legacy','confirmed','2026-11-01T10:00Z','10:00',60,null),
      ('completed','completed','2026-10-31T10:00Z','10:00',60,null),
      ('deleted','confirmed','2026-11-01T10:00Z','10:00',null,now())`);
    for (const C of [
      Migration20261015000100,
      Migration20261015000200,
      Migration20261024000100,
      Migration20261030000300,
      Migration20261015000300,
      Migration20261030000100,
    ])
      await migration("up", C);
    await event("in-progress");
    await claim("in-progress");
    const before = (await pool.query("select * from chef_event order by id"))
      .rows;
    await migration("up");
    expect(
      (await pool.query("select * from chef_event order by id")).rows,
    ).toEqual(before);
    expect(await active()).toHaveLength(3);
    expect(
      (await rows()).find((r: any) => r.source_id === "in-progress")
        .claim_token,
    ).toBe("owner");
    expect(
      (await rows()).find((r: any) => r.source_id === "deleted").active,
    ).toBe(false);
    expect(
      (await pool.query("select * from chef_time_reservation_drift")).rows,
    ).toEqual([]);
    await migration("down"); // Event-only downgrade retains the original guards.
    await expect(
      pool.query(
        `update chef_event set "requestedDate"='2026-12-01' where id='legacy'`,
      ),
    ).rejects.toThrow("cannot be rescheduled");
    await migration("up");
    const loaded = await initModules({
      databaseConfig: { clientUrl: url, schema },
      modulesConfig: {
        sharedScheduling: {
          resolve: resolve(__dirname, "../../src/modules/shared-scheduling"),
          options: {
            database: { clientUrl: url, schema },
            [isSharedConnectionSymbol]: true,
          },
        },
      },
    });
    shutdown = loaded.shutdown;
    service = loaded.medusaApp.modules.sharedScheduling;
  }, 60000);
  beforeEach(async () => {
    // Test-owner fixture reset only. Runtime TRUNCATE is explicitly rejected.
    const tables = [
      "chef_event",
      "chef_work_block",
      "chef_work_block_occurrence",
      "chef_time_reservation",
    ];
    for (const t of tables)
      await pool.query(
        `alter table ${t} disable trigger shared_time_no_truncate`,
      );
    await pool.query(
      "truncate chef_event, chef_work_block, chef_work_block_occurrence, chef_time_reservation, meal_prep_subject cascade",
    );
    for (const t of tables)
      await pool.query(
        `alter table ${t} enable trigger shared_time_no_truncate`,
      );
    await pool.query(`insert into availability_setting(id,timezone,weekly,overrides,google_mode,updated_at)
      values ('chef-default','UTC','{"1":[{"start":"08:00","end":"18:00"}]}','{}','internal_only','2026-10-30T00:00Z')
      on conflict(id) do update set weekly=excluded.weekly,overrides=excluded.overrides,updated_at=excluded.updated_at`);
  });
  afterEach(async () => {
    if (service) expect(await service.reservationDrift()).toEqual([]);
  });
  afterAll(async () => {
    await shutdown?.();
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  it.each(["event-first", "work-first"])(
    "serializes cross-domain race: %s, one winner without releasing the winner",
    async (order) => {
      await event();
      const a = await pool.connect(),
        b = await pool.connect();
      try {
        await a.query("begin");
        await b.query("begin");
        if (order === "event-first") await claim("event", a);
        else await block("block", a);
        let settled = false;
        const competing = (
          order === "event-first" ? block("block", b) : claim("event", b)
        )
          .then(
            () => ({ code: "unexpected-success" }),
            (e: any) => e,
          )
          .finally(() => {
            settled = true;
          });
        await new Promise((r) => setTimeout(r, 60));
        expect(settled).toBe(false);
        await a.query("commit");
        expect(await competing).toMatchObject({
          code: "23P01",
          constraint: "chef_time_reservation_no_overlap",
        });
        await b.query("rollback");
        expect(await active()).toHaveLength(1);
      } finally {
        await a.query("rollback");
        await b.query("rollback");
        a.release();
        b.release();
      }
    },
  );
  it("a rolled-back competing transaction lets the other domain secure the interval", async () => {
    await event();
    const a = await pool.connect();
    try {
      await a.query("begin");
      await claim("event", a);
      const pending = block();
      await a.query("rollback");
      await pending;
      expect((await active())[0].source_kind).toBe("meal_prep_work");
      expect(
        (await pool.query(`select "acceptanceToken" from chef_event`)).rows[0]
          .acceptanceToken,
      ).toBeNull();
    } finally {
      a.release();
    }
  });
  it("allows only one simultaneous overlapping in-home block, and allows half-open adjacency", async () => {
    const results = await Promise.allSettled([
      block("a", pool, start, end, "in_home"),
      block("b", pool, start, end, "in_home"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Concurrent GiST exclusion insertions can report a deadlock victim rather
    // than an exclusion violation; both must roll back the losing source write.
    expect(['23P01', '40P01']).toContain(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code,
    );
    expect(await active()).toHaveLength(1);
    const loser = results[0].status === 'rejected' ? 'a' : 'b';
    expect((await pool.query('select id from chef_work_block where id=$1', [loser])).rows).toEqual([]);
    await expect(block(loser, pool, start, end, 'in_home')).rejects.toMatchObject({ code: '23P01' });
    await block("adjacent", pool, end, "2026-11-02T12:00Z");
    expect(await active()).toHaveLength(2);
  });
  it("generated internal CRUD projects work and cannot bypass version, interval or resource guards", async () => {
    await service.createChefWorkBlocks({
      id: "block",
      chef_id: "chef-1",
      resource_id: "chef-default",
      purpose: "preparation",
      starts_at: new Date(start),
      ends_at: new Date(end),
    });
    expect(await active()).toHaveLength(1);
    await expect(
      service.updateChefWorkBlocks({
        id: "block",
        ends_at: new Date("2026-11-02T12:00Z"),
      }),
    ).rejects.toThrow("version must advance");
    await expect(block("zero", pool, end, end)).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      block("infinite", pool, end, "infinity"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `insert into chef_work_block(id,resource_id,chef_id,purpose,starts_at,ends_at)
      values ('bypass','other-resource','chef-1','preparation',$1,$2)`,
        [start, end],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("multiple pickup/delivery occurrence links share one planned block without count capacity or automatic appointments", async () => {
    await subjects(30);
    expect(await active()).toHaveLength(0);
    await block();
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => link("block", `occ-${i}`)),
    );
    expect(await active()).toHaveLength(1);
    expect(
      (await pool.query("select count(*) from chef_work_block_occurrence"))
        .rows[0].count,
    ).toBe("30");
    expect(await service.reviewWorkBlocks({ start, end })).toEqual([{
      id: 'block', purpose: 'preparation', start: new Date(start).toISOString(), end: new Date(end).toISOString(), linked_occurrences: 30,
    }]);
    expect(await service.reviewWorkBlocks({ start: end, end: '2026-11-02T12:00:00Z' })).toEqual([]);
    expect(await active()).toHaveLength(1);
  });
  it("in-home work is exclusive to one occurrence; forged cross-owner/arrangement links fail", async () => {
    await subjects();
    await block("home", pool, start, end, "in_home");
    await link("home");
    await expect(link("home", "occ-1")).rejects.toThrow("one occurrence");
    await block("other", pool, end, "2026-11-02T12:00Z");
    await expect(link("other", "arr")).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        `insert into chef_work_block_occurrence values ('other','occ-1','chef-1','forged','occurrence',now())`,
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("retains accepted-event, Google-style reschedule and in-flight cancellation guards", async () => {
    await event();
    await expect(
      pool.query(`update chef_event set status='confirmed'`),
    ).rejects.toThrow("acceptance workflow");
    await claim();
    await expect(pool.query(`delete from chef_event`)).rejects.toThrow(
      "in progress",
    );
    await expect(
      pool.query(`update chef_event set status='cancelled'`),
    ).rejects.toThrow("in progress");
    await pool.query(
      `update chef_event set status='confirmed',"acceptanceToken"=null`,
    );
    const before = await rows();
    for (const sql of [
      `"requestedDate"='2026-11-03T10:00Z'`,
      `"requestedTime"='11:00'`,
      `"estimatedDuration"=120`,
      `"timeZone"='Europe/London'`,
      `experience_type_id='new'`,
    ]) {
      await expect(pool.query(`update chef_event set ${sql}`)).rejects.toThrow(
        "cannot be rescheduled",
      );
    }
    await expect(
      pool.query(`update chef_event set "occupiedStart"='2026-11-02T09:00Z'`),
    ).rejects.toThrow("immutable");
    expect(await rows()).toEqual(before);
    await pool.query(`update chef_event set status='completed'`);
    await expect(block()).rejects.toMatchObject({ code: "23P01" });
  });
  it("private-event cancellation/soft-delete release and restore stay synchronous", async () => {
    await event();
    await claim();
    await pool.query(
      `update chef_event set status='confirmed',"acceptanceToken"=null`,
    );
    await pool.query(`update chef_event set deleted_at=now()`);
    expect(await active()).toHaveLength(0);
    await block();
    await expect(
      pool.query("update chef_event set deleted_at=null"),
    ).rejects.toMatchObject({ code: "23P01" });
    await pool.query(
      `update chef_work_block set released_at=now(),version=version+1`,
    );
    await pool.query("update chef_event set deleted_at=null");
    expect(await active()).toHaveLength(1);
    await pool.query(`update chef_event set status='cancelled'`);
    expect(await active()).toHaveLength(0);
  });
  it("real claim/release methods preserve owner tokens and do not expire uncertain claims", async () => {
    await event();
    const c = await pool.connect();
    const events = Object.create(
      ChefEventModuleService.prototype,
    ) as ChefEventModuleService;
    try {
      await c.query("begin");
      const current = (await c.query("select updated_at from chef_event"))
        .rows[0];
      await events.claimAcceptance(
        {
          id: "event",
          token: "owner",
          updatedAt: current.updated_at,
          start,
          end,
          snapshot: { timezone: "UTC", duration_minutes: 60 },
        },
        context(c),
      );
      await c.query("commit");
      await expect(block()).rejects.toMatchObject({ code: "23P01" });
      await c.query("begin");
      await events.releaseAcceptance("event", "wrong-owner", context(c));
      expect(
        (
          await c.query(
            `select claim_token from chef_time_reservation where active`,
          )
        ).rows[0].claim_token,
      ).toBe("owner");
      await events.releaseAcceptance("event", "owner", context(c));
      await c.query("commit");
      await block();
      expect(await active()).toHaveLength(1);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("failed atomic replacement preserves old interval, version and links", async () => {
    await block();
    await event();
    await claim("event", pool, "2026-11-02T12:00Z", "2026-11-02T13:00Z");
    const before = await rows();
    await expect(
      service.replaceUnlinkedWorkBlock(await replacement()),
    ).rejects.toThrow();
    expect(await rows()).toEqual(before);
    expect((await service.retrieveChefWorkBlock("block")).version).toBe(1);
    await expect(block("old-interval")).rejects.toMatchObject({
      code: "23P01",
    });
  });
  it("successful replacement is atomic; stale versions and wrong chef scope cannot replace again", async () => {
    await block();
    const input = await replacement();
    expect(await service.replaceUnlinkedWorkBlock(input)).toEqual({
      version: 2,
    });
    await expect(service.replaceUnlinkedWorkBlock(input)).rejects.toThrow(
      "changed",
    );
    await expect(
      service.replaceUnlinkedWorkBlock({
        ...input,
        expectedVersion: 2,
        chefId: "other",
      }),
    ).rejects.toThrow("changed");
    await block("old-interval");
    expect(
      await service.listOccupiedIntervals({ start, end: "2026-11-02T14:00Z" }),
    ).toHaveLength(2);
  });
  it("one concurrent replacement wins the expected version", async () => {
    await block();
    const input = await replacement();
    const results = await Promise.allSettled([
      service.replaceUnlinkedWorkBlock(input),
      service.replaceUnlinkedWorkBlock(input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.message,
    ).toContain("changed");
  });
  it("pending requests do not move work; linked work cannot be moved, detached, deleted or released", async () => {
    await subjects();
    await block();
    await link();
    await link("block", "occ-1");
    const before = await rows();
    await pool.query(`update meal_prep_subject set version=1 where id='occ-0'`);
    await pool.query(`insert into meal_prep_revision(id,subject_id,kind,revision_number,body,contract_version,created_by)
      values ('request','occ-0','change',1,'{"requested_start":"2026-11-03T12:00Z"}','1.1-r4','customer')`);
    await pool.query(`insert into meal_prep_change_request(id,subject_id,revision_id,revision_kind,request_type,base_version,requested_by)
      values ('change','occ-0','request','change','reschedule',0,'customer')`);
    expect(await rows()).toEqual(before);
    await expect(
      service.replaceUnlinkedWorkBlock(await replacement()),
    ).rejects.toThrow("every occurrence");
    for (const change of [`released_at=now()`, `deleted_at=now()`])
      await expect(
        pool.query(`update chef_work_block set ${change},version=version+1`),
      ).rejects.toThrow("every occurrence");
    await expect(
      pool.query("delete from chef_work_block_occurrence"),
    ).rejects.toThrow("approved occurrence");
    await expect(pool.query("delete from chef_work_block")).rejects.toThrow(
      "cannot be deleted",
    );
    expect(await rows()).toEqual(before);
  });
  it("linking waits for an in-progress release and then rejects the released block", async () => {
    await subjects();
    await block();
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "update chef_work_block set released_at=now(),version=version+1",
      );
      const pending = link().then(
        () => null,
        (e: any) => e,
      );
      await c.query("commit");
      expect((await pending).message).toContain("active block");
      expect(await active()).toHaveLength(0);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("a concurrent link prevents a block move after the linking transaction commits", async () => {
    await subjects();
    await block();
    const c = await pool.connect();
    try {
      await c.query("begin");
      await link("block", "occ-0", c);
      const pending = service
        .replaceUnlinkedWorkBlock(await replacement())
        .then(
          () => null,
          (e: any) => e,
        );
      await c.query("commit");
      expect((await pending).message).toContain("every occurrence");
      expect((await active())[0].starts_at.toISOString()).toBe(
        "2026-11-02T10:00:00.000Z",
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("checks global hours and settings revision; settings edits preserve existing reservations", async () => {
    await block();
    const input = await replacement();
    await expect(
      service.replaceUnlinkedWorkBlock({
        ...input,
        start: "2026-11-02T07:00:00Z",
        end: "2026-11-02T08:00:00Z",
      }),
    ).rejects.toThrow("global working availability");
    await pool.query(
      `update availability_setting set overrides='{"2026-11-02":[]}'`,
    );
    await expect(service.replaceUnlinkedWorkBlock(input)).rejects.toThrow(
      "Availability changed",
    );
    await expect(
      service.replaceUnlinkedWorkBlock(await replacement()),
    ).rejects.toThrow("global working availability");
    expect((await active())[0].starts_at.toISOString()).toBe(
      "2026-11-02T10:00:00.000Z",
    );
  });
  it("serializes real Availability snapshot saves with a replacement transaction", async () => {
    await block();
    const input = await replacement();
    const a = await pool.connect(),
      b = await pool.connect();
    const scheduling = Object.create(
      Object.getPrototypeOf(service),
    ) as SharedSchedulingService;
    const availability = Object.create(
      AvailabilityModuleService.prototype,
    ) as AvailabilityModuleService;
    try {
      await a.query("begin");
      await b.query("begin");
      await scheduling.replaceUnlinkedWorkBlock(input, context(a));
      let settled = false;
      const save = availability
        .saveSchedule(
          {
            timezone: "UTC",
            version: (await pool.query("select version from availability_setting where id='chef-default'")).rows[0].version,
            weekly: {},
            overrides: {},
            google_mode: "internal_only",
          },
          context(b),
        )
        .finally(() => {
          settled = true;
        });
      await new Promise((r) => setTimeout(r, 60));
      expect(settled).toBe(false);
      await a.query("commit");
      await save;
      await b.query("commit");
      expect((await active())[0].starts_at.toISOString()).toBe(
        "2026-11-02T12:00:00.000Z",
      );
      await expect(
        service.replaceUnlinkedWorkBlock({ ...input, expectedVersion: 2 }),
      ).rejects.toThrow("Availability changed");
    } finally {
      await a.query("rollback");
      await b.query("rollback");
      a.release();
      b.release();
    }
  });
  it("projection reads exclude only the specified private event, never a work block with the same ID", async () => {
    await event("same");
    await claim("same");
    await block("same", pool, end, "2026-11-02T12:00Z");
    const intervals = await service.listOccupiedIntervals({
      start,
      end: "2026-11-02T13:00Z",
      ignoreEventId: "same",
    });
    expect(intervals).toEqual([
      { start: "2026-11-02T11:00:00.000Z", end: "2026-11-02T12:00:00.000Z" },
    ]);
  });
  it("rejects direct projection edits and TRUNCATE bypasses", async () => {
    await block();
    for (const sql of [
      "delete from chef_time_reservation",
      "update chef_time_reservation set active=false",
      `insert into chef_time_reservation values ('private_event','forged','chef-default',null,null,false,null,'0')`,
    ])
      await expect(pool.query(sql)).rejects.toThrow("source-owned");
    for (const t of [
      "chef_time_reservation",
      "chef_event",
      "chef_work_block_occurrence",
    ])
      await expect(pool.query(`truncate ${t}`)).rejects.toThrow(
        "cannot be truncated",
      );
  });
  it("projection trigger failure rolls back the source write", async () => {
    await event();
    await pool.query(
      `alter table chef_time_reservation add constraint injected_failure check (not active)`,
    );
    try {
      await expect(claim()).rejects.toMatchObject({ code: "23514" });
    } finally {
      await pool.query(
        "alter table chef_time_reservation drop constraint injected_failure",
      );
    }
    expect(await active()).toHaveLength(0);
    expect(
      (await pool.query('select "acceptanceToken" from chef_event')).rows[0]
        .acceptanceToken,
    ).toBeNull();
  });
  it("removes a deleted pending source without orphaning a reservation", async () => {
    await event();
    expect(await rows()).toHaveLength(1);
    await pool.query("delete from chef_event");
    expect(await rows()).toEqual([]);
  });
  it("detects administrative projection drift and restores parity via synchronous source update", async () => {
    await event();
    await claim();
    await pool.query(
      "alter table chef_time_reservation disable trigger chef_time_projection_guard",
    );
    try {
      await pool.query("update chef_time_reservation set active=false");
    } finally {
      await pool.query(
        "alter table chef_time_reservation enable trigger chef_time_projection_guard",
      );
    }
    expect((await service.reservationDrift()).length).toBeGreaterThan(0);
    await expect(migration("down")).rejects.toThrow(
      "reconcile projection drift",
    );
    await pool.query("update chef_event set updated_at=now()");
    expect(await service.reservationDrift()).toEqual([]);
  });
  it("refuses rollback for active OR released meal-prep work without removing event guards", async () => {
    await block();
    await expect(migration("down")).rejects.toThrow("rollback refused");
    await pool.query(
      "update chef_work_block set released_at=now(),version=version+1",
    );
    await expect(migration("down")).rejects.toThrow("rollback refused");
    await event();
    await claim();
    expect(await active()).toHaveLength(1);
  });
  it("audits malformed active legacy intervals and rolls back the entire installation", async () => {
    await event();
    await claim();
    await migration("down");
    // Simulate corrupt older data using test-owner privileges, not a supported writer.
    await pool.query(
      "alter table chef_event disable trigger chef_availability_guard",
    );
    await pool.query(
      "alter table chef_event drop constraint chef_event_occupied_valid",
    );
    await pool.query('update chef_event set "occupiedStart"=null');
    try {
      await expect(migration("up")).rejects.toThrow(
        "audit legacy occupied intervals",
      );
      expect(
        (
          await pool.query(
            `select to_regclass('chef_time_reservation') as name`,
          )
        ).rows[0].name,
      ).toBeNull();
    } finally {
      await pool.query('update chef_event set "occupiedStart"=$1', [start]);
      await pool.query(`alter table chef_event add constraint chef_event_occupied_valid check (deleted_at is not null or
        (status not in ('confirmed','completed') and "acceptanceToken" is null) or
        ("occupiedStart" is not null and "occupiedEnd" is not null and "occupiedEnd">"occupiedStart"))`);
      await pool.query(
        "alter table chef_event enable trigger chef_availability_guard",
      );
      await migration("up");
    }
  });
  it("fails explicitly out of order without creating partial tables or dropping event constraints", async () => {
    await migration("down");
    await pool.query(
      "alter table chef_event rename constraint chef_event_no_overlap to prerequisite_missing",
    );
    try {
      await expect(migration("up")).rejects.toThrow("migrations first");
      expect(
        (
          await pool.query(
            `select to_regclass('chef_time_reservation') as name`,
          )
        ).rows[0].name,
      ).toBeNull();
    } finally {
      await pool.query(
        "alter table chef_event rename constraint prerequisite_missing to chef_event_no_overlap",
      );
      await migration("up");
    }
  });
  it("audits legacy overlap without skipping bookings or leaving partial backfill", async () => {
    await migration("down");
    // Simulate a divergent legacy constraint with test-owner DDL privileges.
    await pool.query(`alter table chef_event drop constraint chef_event_no_overlap,
      add constraint chef_event_no_overlap exclude using gist (tstzrange("occupiedStart","occupiedEnd",'[)') with &&) where (false)`);
    await event("a");
    await event("b");
    await claim("a");
    await claim("b");
    try {
      await expect(migration("up")).rejects.toThrow("audit legacy overlapping");
      expect(
        (
          await pool.query(
            `select to_regclass('chef_time_reservation') as name`,
          )
        ).rows[0].name,
      ).toBeNull();
      expect(
        (await pool.query("select count(*) from chef_event")).rows[0].count,
      ).toBe("2");
    } finally {
      await pool.query(
        `update chef_event set "acceptanceToken"=null where id='b'`,
      );
      await pool.query(`alter table chef_event drop constraint chef_event_no_overlap,
        add constraint chef_event_no_overlap exclude using gist (tstzrange("occupiedStart","occupiedEnd",'[)') with &&)
        where (deleted_at is null and (status in ('confirmed','completed') or "acceptanceToken" is not null))`);
      await migration("up");
    }
  });
});
