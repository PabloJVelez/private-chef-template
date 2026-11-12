import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { MedusaApp } from '@medusajs/framework/modules-sdk';
import type SchedulingModuleService from '../../src/modules/scheduling/service';
import { Migration20261109000200 } from '../../src/modules/scheduling/migrations/Migration20261109000200';
const { Client } = require('@medusajs/framework/pg');
const databaseName = `booking_test_scheduling_${randomUUID().replace(/-/g, '')}`;
let admin: any, db: any, app: Awaited<ReturnType<typeof MedusaApp>>, scheduling: SchedulingModuleService;
const reservation = (id: string, start = '2027-01-02T10:00Z', end = '2027-01-02T11:00Z') => ({
  id,
  ownerId: `event-${id}`,
  attemptId: `attempt-${id}`,
  start,
  end,
});

describe('Scheduling native module contract', () => {
  beforeAll(async () => {
    const raw = process.env.BOOKING_TEST_DATABASE_URL;
    if (!raw || !['127.0.0.1', 'localhost'].includes(new URL(raw).hostname))
      throw new Error('Disposable loopback BOOKING_TEST_DATABASE_URL required');
    admin = new Client({ connectionString: raw });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    const url = new URL(raw);
    url.pathname = `/${databaseName}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    // Exercise the additive module migration independently of client-specific cutover migrations.
    const migration = new Migration20261109000200(undefined as never, undefined as never);
    await migration.up();
    await db.query('begin');
    for (const sql of migration.getQueries()) await db.query(sql);
    await db.query('commit');
    app = await MedusaApp({
      sharedResourcesConfig: { database: { clientUrl: url.toString() } },
      modulesConfig: { scheduling: { resolve: path.resolve(__dirname, '../../src/modules/scheduling') } },
    });
    scheduling = app.modules.scheduling as unknown as SchedulingModuleService;
  }, 30000);
  afterAll(async () => {
    await app?.onApplicationPrepareShutdown();
    await app?.onApplicationShutdown();
    await db?.end();
    if (admin) {
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.query('truncate scheduling_reservation');
  });

  it('allows only one concurrent overlapping acquire and permits adjacency', async () => {
    const results = await Promise.allSettled([
      scheduling.acquire(reservation('a')),
      scheduling.acquire(reservation('b')),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    await scheduling.acquire(reservation('c', '2027-01-02T11:00Z', '2027-01-02T12:00Z'));
  });
  it('preserves ownership and exact retry semantics', async () => {
    const input = reservation('a');
    await scheduling.acquire(input);
    await scheduling.acquire(input);
    await expect(scheduling.acquire({ ...input, ownerId: 'stranger' })).rejects.toThrow('identity');
    await expect(scheduling.release({ ...input, attemptId: 'stale' })).rejects.toThrow('ownership');
    await scheduling.confirm(input);
    await scheduling.confirm(input);
    await scheduling.release(input);
    await scheduling.release(input);
    await expect(scheduling.acquire(input)).rejects.toThrow('resolved attempt');
  });
  it('selects reservations starting before the window and excludes half-open adjacency', async () => {
    await scheduling.acquire(reservation('a', '2027-01-01T10:00Z', '2027-01-03T10:00Z'));
    expect(await scheduling.overlapping('2027-01-02T10:00Z', '2027-01-02T11:00Z')).toHaveLength(1);
    expect(await scheduling.overlapping('2027-01-03T10:00Z', '2027-01-03T11:00Z')).toHaveLength(0);
    await expect(scheduling.overlapping('invalid', '2027-01-03T11:00Z')).rejects.toThrow('finite');
  });
  it('rolls back through a real module-local Medusa transaction context', async () => {
    const manager = (scheduling as any).baseRepository_.manager_;
    expect(manager).toBeDefined();
    await expect(
      manager.transactional(async (transactionManager: any) => {
        await scheduling.acquire(reservation('rollback'), { transactionManager });
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    expect(await scheduling.listReservations({ id: 'rollback' })).toHaveLength(0);
  });
  it('rejects incomplete overlap reads and never returns a false free window', async () => {
    await db.query(`insert into scheduling_reservation(id,owner_id,attempt_id,starts_at,ends_at)
      select 'many-' || n, 'many-' || n, 'many-' || n,
        '2027-01-02T00:00Z'::timestamptz + n * interval '1 second',
        '2027-01-02T00:00Z'::timestamptz + (n+1) * interval '1 second'
      from generate_series(0,10000) n`);
    await expect(scheduling.overlapping('2027-01-02T00:00Z', '2027-01-03T00:00Z')).rejects.toThrow(
      'complete-read bound',
    );
  });
});
