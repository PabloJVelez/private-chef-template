import { Client } from 'pg';
import { Migration20261015000300 } from '../../src/modules/chef-event/migrations/Migration20261015000300';

// Run against disposable PostgreSQL: TEST_DATABASE_URL=... yarn jest integration-tests/availability/legacy-migration.spec.ts --runInBand
const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite('availability upgrade with legacy bookings', () => {
  let db: Client;
  const migrate = async () => {
    const sql: string[] = [];
    const migration = Object.create(Migration20261015000300.prototype);
    migration.addSql = (statement: string) => sql.push(statement);
    await migration.up();
    for (const statement of sql) await db.query(statement);
  };
  beforeEach(async () => {
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA availability_upgrade_fixture');
    await db.query('SET LOCAL search_path TO availability_upgrade_fixture, public');
    await db.query(`CREATE TABLE chef_event (
      id text primary key, status text not null, deleted_at timestamptz,
      "requestedDate" timestamptz not null, "estimatedDuration" integer, "requestedTime" text
    )`);
    await db.query(`INSERT INTO chef_event (id,status,deleted_at,"requestedDate","estimatedDuration") VALUES
      ('confirmed', 'confirmed', null, '2026-08-15T23:30:00Z', 240),
      ('deleted-demo', 'completed', now(), '2026-08-15T23:00:00Z', 210)`);
  });
  afterEach(async () => {
    await db.query('ROLLBACK');
    await db.end();
  });
  test('migrates overlapping deleted history without changing the active booking', async () => {
    await migrate();
    const { rows } = await db.query(`SELECT id, "occupiedStart", "occupiedEnd" FROM chef_event ORDER BY id`);
    expect(rows[0]['occupiedStart'].toISOString()).toBe('2026-08-15T23:30:00.000Z');
    expect(rows[0]['occupiedEnd'].toISOString()).toBe('2026-08-16T03:30:00.000Z');
    expect(rows[1]['occupiedStart']).toBeNull();
    await expect(db.query(`UPDATE chef_event SET deleted_at = null WHERE id = 'deleted-demo'`))
      .rejects.toMatchObject({ code: '23514', constraint: 'chef_event_occupied_valid' });
  });
  test('still rejects overlapping active bookings', async () => {
    await db.query(`UPDATE chef_event SET deleted_at = null WHERE id = 'deleted-demo'`);
    await expect(migrate()).rejects.toMatchObject({ code: '23P01', constraint: 'chef_event_no_overlap' });
  });
  test('still rejects invalid active legacy durations', async () => {
    await db.query(`UPDATE chef_event SET "estimatedDuration" = 0 WHERE id = 'confirmed'`);
    await expect(migrate()).rejects.toThrow('audit legacy booking durations');
  });
  test('still rejects an active acceptance claim without an occupied interval', async () => {
    await migrate();
    await expect(db.query(`INSERT INTO chef_event (id,status,"requestedDate","estimatedDuration","acceptanceToken")
      VALUES ('invalid-claim','pending','2026-09-01T00:00:00Z',60,'claim')`))
      .rejects.toMatchObject({ code: '23514', constraint: 'chef_event_occupied_valid' });
  });
});
