/** Exact current-main migration history, then the additive cutover; never reads another branch. */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Migration20261109000100 } from '../../src/modules/chef-event/migrations/Migration20261109000100';
import { Migration20261109000300 } from '../../src/modules/scheduling/migrations/Migration20261109000300';
import { Migration20261109000200 } from '../../src/modules/scheduling/migrations/Migration20261109000200';
const { Client } = require('pg');
let db: any;
const migrate = async (MigrationClass: any, direction = 'up') => {
  const migration = new MigrationClass(undefined, undefined);
  await migration[direction]();
  for (const sql of migration.getQueries()) await db.query(sql);
};
describe('current-main populated Scheduling upgrade', () => {
  beforeEach(async () => {
    const url = process.env.BOOKING_TEST_DATABASE_URL;
    if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
      throw new Error('Disposable loopback BOOKING_TEST_DATABASE_URL required');
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query('begin');
    const schema = `booking_upgrade_${randomUUID().replace(/-/g, '')}`;
    await db.query(`create schema ${schema}`);
    await db.query(`set local search_path = ${schema}, public`);
    for (const module of ['chef-event', 'availability', 'experience-type']) {
      const directory = path.resolve(__dirname, '../../src/modules', module, 'migrations');
      for (const file of fs
        .readdirSync(directory)
        .filter((name) => /^Migration\d+\.ts$/.test(name) && name < 'Migration202611')
        .sort()) {
        const exports = require(path.join(directory, file));
        await migrate(Object.values(exports)[0]);
      }
    }
    // Main's existing acceptance API is how both accepted history and active claims are created.
    await db.query(`insert into chef_event(id,"requestedDate","requestedTime","partySize","eventType","templateProductId","locationType","locationAddress","firstName","lastName",email,phone,notes,"totalPrice","raw_totalPrice","specialRequirements","estimatedDuration")
      select id, '2026-08-15T23:30:00Z', '18:30', 4, 'plated_dinner', 'menu', 'customer_location', '', 'Fixture', 'Guest', 'fixture@example.invalid', '', '', 400, '{"value":"400","precision":20}', '', 60
      from unnest(array['accepted','completed','claim','pending','cancelled','deleted']) as id`);
    await db.query(`update chef_event set "acceptanceToken" = id || '-token',
      "occupiedStart" = case id when 'accepted' then '2026-08-15T22:30:00Z'::timestamptz when 'completed' then '2026-08-17T10:00Z'::timestamptz else '2026-08-19T10:00Z'::timestamptz end,
      "occupiedEnd" = case id when 'accepted' then '2026-08-16T04:30:00Z'::timestamptz when 'completed' then '2026-08-17T12:00Z'::timestamptz else '2026-08-19T12:00Z'::timestamptz end,
      "availabilitySnapshot" = '{"duration_minutes":180,"preparation_minutes":60,"travel_minutes":60,"cleanup_minutes":60,"timezone":"America/Chicago"}'
      where id in ('accepted','completed','claim')`);
    await db.query(
      `update chef_event set status='confirmed', "acceptanceToken"=null, "productId"='product-' || id where id in ('accepted','completed')`,
    );
    await db.query(
      `update chef_event set status='completed' where id='completed'; update chef_event set status='cancelled' where id='cancelled'; update chef_event set deleted_at=now() where id='deleted'`,
    );
    await migrate(Migration20261109000100);
    await migrate(Migration20261109000200);
  });
  afterEach(async () => {
    await db?.query('rollback');
    await db?.end();
  });

  it('copies historical intervals, snapshots and active claims exactly and retires old new-claim writers', async () => {
    const before = (
      await db.query(
        `select id,"occupiedStart","occupiedEnd","availabilitySnapshot" from chef_event order by id`,
      )
    ).rows;
    await migrate(Migration20261109000300);
    const rows = (await db.query('select * from scheduling_reservation order by owner_id')).rows;
    expect(rows.map((r: any) => [r.owner_id, r.state, r.attempt_id])).toEqual([
      ['accepted', 'confirmed', 'legacy-accepted'],
      ['claim', 'held', 'claim-token'],
      ['completed', 'confirmed', 'legacy-completed'],
    ]);
    for (const row of rows) {
      const original = before.find((e: any) => e.id === row.owner_id);
      expect(row.starts_at).toEqual(original.occupiedStart);
      expect(row.ends_at).toEqual(original.occupiedEnd);
    }
    expect(
      (
        await db.query(
          `select id,"occupiedStart","occupiedEnd","availabilitySnapshot" from chef_event order by id`,
        )
      ).rows,
    ).toEqual(before);
    await db.query('savepoint old_writer');
    await expect(
      db.query(
        `update chef_event set "acceptanceToken"='old-code',"occupiedStart"='2027-01-01T10:00Z',"occupiedEnd"='2027-01-01T11:00Z' where id='pending'`,
      ),
    ).rejects.toThrow('Scheduling cutover');
    await db.query('rollback to savepoint old_writer');
    await migrate(Migration20261109000300, 'down');
    expect(
      (
        await db.query(
          `select conname from pg_constraint where conrelid='chef_event'::regclass and conname='chef_event_no_overlap'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('refuses rollback if a protected reservation cannot be represented by the legacy snapshot', async () => {
    await migrate(Migration20261109000300);
    await db.query(
      `insert into scheduling_reservation(id,owner_id,attempt_id,starts_at,ends_at) values('orphan','missing','attempt','2027-01-01T10:00Z','2027-01-01T11:00Z')`,
    );
    await expect(migrate(Migration20261109000300, 'down')).rejects.toThrow('reconciliation');
  });
  it('fails the whole cutover for nonfinite intervals instead of advertising an empty schedule', async () => {
    await db.query('alter table chef_event disable trigger chef_availability_guard');
    await db.query(`update chef_event set "occupiedEnd"='infinity' where id='claim'`);
    await db.query('alter table chef_event enable trigger chef_availability_guard');
    await expect(migrate(Migration20261109000300)).rejects.toThrow('scheduling_interval_valid');
  });
});
