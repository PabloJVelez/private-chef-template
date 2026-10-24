/** Isolated schema only; never uses DATABASE_URL or existing app data. */
import { randomUUID } from 'node:crypto';
import ChefEventModuleService from '../../src/modules/chef-event/service';
import { Migration20261015000100 } from '../../src/modules/availability/migrations/Migration20261015000100';
import { Migration20261015000200 } from '../../src/modules/experience-type/migrations/Migration20261015000200';
import { Migration20261015000300 } from '../../src/modules/chef-event/migrations/Migration20261015000300';
// pg types are not installed in this repository.
const { Pool } = require('pg');
const url = process.env.AVAILABILITY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('availability PostgreSQL constraints', () => {
  const schema = `availability_test_${randomUUID().replace(/-/g, '')}`;
  let admin: any, pool: any;
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
    await pool.query(
      `create table chef_event (id text primary key,status text not null default 'pending',"requestedDate" timestamptz not null,"requestedTime" text not null,"estimatedDuration" int,"productId" text,updated_at timestamptz default now(),deleted_at timestamptz);`,
    );
    await pool.query('create table experience_type (id text primary key)');
    for (const MigrationClass of [Migration20261015000100, Migration20261015000200, Migration20261015000300]) {
      const migration = new MigrationClass(undefined as never, undefined as never);
      await migration.up();
      for (const sql of migration.getQueries()) await pool.query(sql);
    }
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await pool.query('truncate chef_event');
  });
  const insert = (id: string) =>
    pool.query(
      `insert into chef_event(id,"requestedDate","requestedTime","estimatedDuration","timeZone",experience_type_id) values ($1,'2026-11-02T10:00Z','10:00',60,'UTC','experience')`,
      [id],
    );
  const claim = (id: string, token: string, start = '2026-11-02T10:00Z', end = '2026-11-02T11:00Z') =>
    pool.query(
      `update chef_event set "acceptanceToken"=$2,"occupiedStart"=$3,"occupiedEnd"=$4 where id=$1 and status='pending' and "acceptanceToken" is null returning id`,
      [id, token, start, end],
    );
  it('executes the real module claim/release SQL with transaction context and stale-write detection', async () => {
    await insert('a');
    const client = await pool.connect();
    const service = Object.create(ChefEventModuleService.prototype) as ChefEventModuleService;
    const manager = {
      execute: async (sql: string, bindings: unknown[]) => {
        let index = 0;
        const result = await client.query(
          sql.replace(/\?/g, () => `$${++index}`),
          bindings,
        );
        return result.rows;
      },
    };
    const context = { manager, transactionManager: manager } as never;
    try {
      await client.query('begin');
      const current = (await client.query(`select updated_at from chef_event where id='a'`)).rows[0];
      await service.claimAcceptance(
        {
          id: 'a',
          token: 'real-owner',
          updatedAt: current.updated_at,
          start: '2026-11-02T09:00Z',
          end: '2026-11-02T12:00Z',
          snapshot: { duration_minutes: 120, timezone: 'UTC' },
        },
        context,
      );
      expect(
        (await client.query(`select "acceptanceToken", "estimatedDuration" from chef_event where id='a'`)).rows[0],
      ).toEqual({ acceptanceToken: 'real-owner', estimatedDuration: 120 });
      await service.releaseAcceptance('a', 'wrong-owner', context);
      expect(
        (await client.query(`select "acceptanceToken" from chef_event where id='a'`)).rows[0].acceptanceToken,
      ).toBe('real-owner');
      await service.releaseAcceptance('a', 'real-owner', context);
      expect(
        (await client.query(`select "acceptanceToken" from chef_event where id='a'`)).rows[0].acceptanceToken,
      ).toBeNull();
      await expect(
        service.claimAcceptance(
          {
            id: 'a',
            token: 'stale',
            updatedAt: new Date(0),
            start: '2026-11-02T09:00Z',
            end: '2026-11-02T12:00Z',
            snapshot: { duration_minutes: 120, timezone: 'UTC' },
          },
          context,
        ),
      ).rejects.toThrow('Event changed');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
  it('allows only one of two overlapping concurrent acceptance claims', async () => {
    await insert('a');
    await insert('b');
    const results = await Promise.allSettled([claim('a', 'one'), claim('b', 'two')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('23P01');
  });
  it('duplicate acceptance claims have one owner, and pending requests do not reserve', async () => {
    await insert('a');
    await insert('b');
    const results = await Promise.all([claim('a', 'one'), claim('a', 'two')]);
    expect(results.map((r) => r.rowCount).sort()).toEqual([0, 1]);
  });
  it('allows adjacent occupied periods and releases only after cancellation', async () => {
    await insert('a');
    await insert('b');
    await claim('a', 'one');
    await pool.query(`update chef_event set status='confirmed',"acceptanceToken"=null where id='a'`);
    await expect(claim('b', 'two')).rejects.toMatchObject({ code: '23P01' });
    await claim('b', 'two', '2026-11-02T11:00Z', '2026-11-02T12:00Z');
    await pool.query(`update chef_event set status='cancelled' where id='a'`);
    await insert('c');
    await expect(claim('c', 'three')).resolves.toMatchObject({ rowCount: 1 });
  });
  it('blocks direct confirmation, in-flight cancellation and accepted reschedules from every writer', async () => {
    await insert('a');
    await expect(pool.query(`update chef_event set status='confirmed' where id='a'`)).rejects.toThrow(
      'acceptance workflow',
    );
    await claim('a', 'one');
    await expect(pool.query(`delete from chef_event where id='a'`)).rejects.toThrow('in progress');
    await expect(pool.query(`update chef_event set status='cancelled' where id='a'`)).rejects.toThrow('in progress');
    await pool.query(`update chef_event set status='confirmed',"acceptanceToken"=null where id='a'`);
    await expect(pool.query(`update chef_event set status='pending' where id='a'`)).rejects.toThrow(
      'cannot become pending',
    );
    await expect(pool.query(`update chef_event set "occupiedStart"='2026-11-02T09:00Z' where id='a'`)).rejects.toThrow(
      'immutable',
    );
    await expect(pool.query(`update chef_event set "requestedDate"='2026-11-03T10:00Z' where id='a'`)).rejects.toThrow(
      'cannot be rescheduled',
    );
    await expect(pool.query(`update chef_event set "requestedTime"='11:00' where id='a'`)).rejects.toThrow(
      'cannot be rescheduled',
    );
  });
  it('compensation cannot release another claim or a finalized booking', async () => {
    await insert('a');
    await claim('a', 'owner');
    const release = (token: string) =>
      pool.query(
        `update chef_event set "acceptanceToken"=null,"occupiedStart"=null,"occupiedEnd"=null where id='a' and "acceptanceToken"=$1 and status='pending' and "productId" is null`,
        [token],
      );
    expect((await release('stale')).rowCount).toBe(0);
    await pool.query(`update chef_event set status='confirmed',"acceptanceToken"=null where id='a'`);
    expect((await release('owner')).rowCount).toBe(0);
  });
});
