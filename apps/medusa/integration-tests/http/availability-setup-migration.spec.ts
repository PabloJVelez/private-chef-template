/** Explicit disposable PostgreSQL only, including the real migration trigger. */
import { randomUUID } from 'node:crypto';
import { Migration20261015000100 } from '../../src/modules/availability/migrations/Migration20261015000100';
import { Migration20261024000100 } from '../../src/modules/availability/migrations/Migration20261024000100';
import { Migration20261030000300 } from '../../src/modules/availability/migrations/Migration20261030000300';
import AvailabilityModuleService from '../../src/modules/availability/service';
import { emptyMealPrepSetup } from '../../src/lib/availability/slots';
const { Pool } = require('pg');
const url = process.env.AVAILABILITY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('Availability setup migration and revision guards', () => {
  const schema = `setup_${randomUUID().replace(/-/g, '')}`;
  let admin: any, pool: any;
  async function migrate(C: any, direction = 'up') {
    const migration = new C(undefined, undefined);
    await migration[direction]();
    const connection = await pool.connect();
    try {
      await connection.query('begin');
      for (const sql of migration.getQueries()) await connection.query(sql);
      await connection.query('commit');
    } catch (error) {
      await connection.query('rollback');
      throw error;
    } finally {
      connection.release();
    }
  }
  const current = async () =>
    (await pool.query("select * from availability_setting where id='chef-default'")).rows[0];
  const service = Object.create(AvailabilityModuleService.prototype) as AvailabilityModuleService;
  const context = (client: any) => {
    const manager = {
      execute: async (sql: string, args: unknown[]) => {
        let i = 0;
        return (
          await client.query(
            sql.replace(/\?/g, () => `$${++i}`),
            args,
          )
        ).rows;
      },
    };
    return { manager, transactionManager: manager } as never;
  };
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
    await migrate(Migration20261015000100);
    await migrate(Migration20261024000100);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });
  it('upgrades populated private-event Availability without altering schedule, notice, Google, or timestamps', async () => {
    await pool.query(`insert into availability_setting(id,timezone,weekly,overrides,google_mode,notice_rules)
      values ('chef-default','UTC','{"1":[{"start":"09:00","end":"17:00"}]}','{"2026-11-02":[]}','required','[]')`);
    const before = await current();
    await migrate(Migration20261030000300);
    expect(await current()).toEqual({ ...before, version: 0, meal_prep: null });
  });
  it('direct writes advance versions even if the writer supplies an old revision', async () => {
    const before = await current();
    await pool.query("update availability_setting set version=0, google_mode='internal_only'");
    expect((await current()).version).toBe(before.version + 1);
    await expect(
      service.saveSchedule({ ...before, timezone: 'Europe/London' }, context(pool)),
    ).rejects.toThrow('another editor');
    expect((await current()).timezone).toBe('UTC');
  });
  it('two real save transactions have exactly one winner and replace nested maps completely', async () => {
    const before = await current();
    const a = await pool.connect(),
      b = await pool.connect();
    try {
      await a.query('begin');
      await b.query('begin');
      const setup = emptyMealPrepSetup();
      setup.methods.pickup.enabled = true;
      await service.saveSchedule({ ...before, meal_prep: setup }, context(a));
      const loser = service.saveSchedule({ ...before, timezone: 'Europe/London' }, context(b));
      const rejected = expect(loser).rejects.toThrow('another editor');
      await a.query('commit');
      await rejected;
      await b.query('rollback');
      expect((await current()).version).toBe(before.version + 1);
      expect((await current()).meal_prep).toEqual(setup);
      await service.saveSchedule(
        { ...(await current()), meal_prep: emptyMealPrepSetup(), weekly: {}, overrides: {} },
        context(pool),
      );
      expect((await current()).weekly).toEqual({});
      expect((await current()).overrides).toEqual({});
    } finally {
      await a.query('rollback');
      await b.query('rollback');
      a.release();
      b.release();
    }
  });
  it('refuses populated downgrade atomically; empty rollback and reapply preserve legacy settings', async () => {
    await expect(migrate(Migration20261030000300, 'down')).rejects.toThrow('preserve it');
    const before = await current();
    expect(before.meal_prep).toEqual(emptyMealPrepSetup());
    await pool.query('update availability_setting set meal_prep=null');
    const cleared = await current();
    await migrate(Migration20261030000300, 'down');
    const { meal_prep, version, ...legacy } = cleared;
    expect(await current()).toEqual(legacy);
    await migrate(Migration20261030000300);
    expect(await current()).toEqual({ ...legacy, version: 0, meal_prep: null });
  });
});
