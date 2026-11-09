import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

jest.setTimeout(30000);
const worker = path.resolve(__dirname, '../booking/native-worker.ts');
const env = { ...process.env };
const { Client } = require('pg');
const databaseName = 'booking_test_native_' + randomUUID().replace(/-/g, '');
let admin: any;
// Deliberately fail, rather than skip, when explicitly selecting the durability suite without fixtures.
function run(id: string, extra: Record<string, string> = {}, killAt?: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    const child = fork(worker, [], {
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      env: { ...env, BOOKING_EXECUTION_ID: id, ...extra },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data;
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Fixture timed out: ${stderr}`));
    }, 15000);
    child.on('message', (message: any) => {
      messages.push(message);
      if (message.type === killAt) setTimeout(() => child.kill('SIGKILL'), 250);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0 && signal !== 'SIGKILL') reject(new Error(stderr));
      else {
        if (stderr && messages.some((x) => x.state === 'invoking')) console.error(stderr);
        resolve(messages);
      }
    });
  });
}
describe('Medusa 2.7 native Redis execution', () => {
  beforeAll(async () => {
    if (!env.BOOKING_TEST_DATABASE_URL || !env.BOOKING_TEST_REDIS_URL)
      throw new Error(
        'Set BOOKING_TEST_DATABASE_URL and BOOKING_TEST_REDIS_URL to disposable loopback fixtures',
      );
    const url = new URL(env.BOOKING_TEST_DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Loopback fixture required');
    admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    url.pathname = `/${databaseName}`;
    env.BOOKING_TEST_DATABASE_URL = url.toString();
    const migrated = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', worker, 'migrate'],
      { env, encoding: 'utf8' },
    );
    if (migrated.status !== 0) throw new Error(migrated.stderr);
  }, 30000);
  afterAll(async () => {
    if (!admin) return;
    const db = new Client({ connectionString: env.BOOKING_TEST_DATABASE_URL });
    await db.connect();
    const { rows } = await db.query('select workflow_id, transaction_id from workflow_execution');
    const Redis = require('ioredis');
    const redis = new Redis(env.BOOKING_TEST_REDIS_URL);
    // Exact task-owned execution keys and a random fixture queue prefix only. Never FLUSHDB.
    for (const row of rows) await redis.unlink(`dtrx:${row.workflow_id}:${row.transaction_id}`);
    let cursor = '0';
    do {
      const page = await redis.scan(cursor, 'MATCH', `bull:${databaseName}-*`, 'COUNT', 100);
      cursor = page[0];
      if (page[1].length) await redis.unlink(...page[1]);
    } while (cursor !== '0');
    await redis.quit();
    await db.end();
    await admin.query(`drop database if exists ${databaseName} with (force)`);
    await admin.end();
  });
  it('reuses a completed execution after process replacement', async () => {
    const id = randomUUID();
    expect((await run(id)).map((x) => x.type)).toEqual(['write', 'dispatch', 'result']);
    expect(await run(id)).toEqual([
      expect.objectContaining({
        type: 'result',
        result: 'original',
        state: 'done',
      }),
    ]);
  });
  it('records native behavior after a synchronous step loses its response', async () => {
    const id = randomUUID();
    expect((await run(id, { BOOKING_CRASH: 'write' }, 'write')).map((x) => x.type)).toEqual(['write']);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const resumed = await run(id);
    console.log('native crash/resume evidence', resumed);
    expect(resumed.at(-1)).toMatchObject({ type: 'result', state: 'done' });
  });
  it('recovers a native product-created/response-lost outcome by creation metadata', async () => {
    const id = randomUUID();
    const killed = await run(
      id,
      { BOOKING_MODE: 'product', BOOKING_CRASH: 'product-created' },
      'product-created',
    );
    expect(killed).toEqual([expect.objectContaining({ type: 'product-created' })]);
    const recovered = await run(id, { BOOKING_MODE: 'product' });
    console.log('product recovery evidence', recovered);
    expect(recovered).toEqual([
      expect.objectContaining({
        type: 'result',
        state: 'done',
        result: [expect.objectContaining({ id: killed[0].id })],
      }),
    ]);
  });
  it('resumes actual acceptance after finalization and before dispatch without releasing protection', async () => {
    const id = randomUUID();
    const seeded = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', worker, 'seed'], {
      env: { ...env, BOOKING_EXECUTION_ID: id, BOOKING_MODE: 'acceptance' },
      encoding: 'utf8',
    });
    if (seeded.status !== 0) throw new Error(seeded.stderr);
    const killed = await run(id, { BOOKING_MODE: 'acceptance', BOOKING_CRASH: 'finalized' }, 'finalized');
    expect(killed).toEqual([expect.objectContaining({ type: 'finalized' })]);
    await expect(run(id, { BOOKING_MODE: 'acceptance', BOOKING_ACTION: 'recover' })).rejects.toThrow(
      'terminally failed acceptance',
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const resumed = await run(id, { BOOKING_MODE: 'acceptance' });
    console.log('acceptance finalization recovery', resumed);
    expect(resumed).toEqual([
      expect.objectContaining({
        type: 'result',
        state: 'done',
        eventStatus: 'confirmed',
        notifications: ['google-calendar.sync-requested'],
        reservations: [expect.objectContaining({ state: 'confirmed' })],
      }),
    ]);
  }, 30000);
  const seed = (id: string, day: number) => {
    const seeded = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', worker, 'seed'], {
      env: {
        ...env,
        BOOKING_EXECUTION_ID: id,
        BOOKING_MODE: 'acceptance',
        BOOKING_DAY: String(day),
      },
      encoding: 'utf8',
    });
    if (seeded.status !== 0) throw new Error(seeded.stderr);
  };
  it('has one winner for concurrent overlapping acceptance workflows', async () => {
    const one = randomUUID(),
      two = randomUUID();
    seed(one, 51);
    seed(two, 51);
    const results = await Promise.all([
      run(one, { BOOKING_MODE: 'acceptance' }),
      run(two, { BOOKING_MODE: 'acceptance' }),
    ]);
    const output = results.map((messages) => messages.find((x) => x.type === 'result'));
    expect(output.filter((x) => x.eventStatus === 'confirmed')).toHaveLength(1);
    expect(output.flatMap((x) => x.products)).toHaveLength(1);
  }, 30000);
  it('duplicates the same acceptance attempt without a second product or lost protection', async () => {
    const id = randomUUID();
    seed(id, 52);
    await Promise.all([run(id, { BOOKING_MODE: 'acceptance' }), run(id, { BOOKING_MODE: 'acceptance' })]);
    const [output] = await run(id, { BOOKING_MODE: 'acceptance' });
    expect(output).toMatchObject({
      eventStatus: 'confirmed',
      products: [expect.objectContaining({ status: 'published' })],
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
    await expect(run(id, { BOOKING_MODE: 'acceptance', BOOKING_ACTION: 'recover' })).rejects.toThrow(
      'terminally failed acceptance',
    );
  }, 30000);
  it('compensates a definite failure after acquisition without leaving occupied time', async () => {
    const id = randomUUID();
    seed(id, 53);
    const [output] = await run(id, {
      BOOKING_MODE: 'acceptance',
      BOOKING_FAIL: 'after-acquire',
    });
    expect(output).toMatchObject({
      state: 'reverted',
      eventStatus: 'pending',
      products: [],
      reservations: [expect.objectContaining({ state: 'released' })],
    });
  }, 30000);
  it('retains finalized time and product through downstream notification failure and compensation', async () => {
    const id = randomUUID();
    seed(id, 54);
    const [output] = await run(id, {
      BOOKING_MODE: 'acceptance',
      BOOKING_FAIL: 'notification',
    });
    expect(output).toMatchObject({
      eventStatus: 'confirmed',
      products: [expect.objectContaining({ status: 'published' })],
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
    const [recovered] = await run(id, {
      BOOKING_MODE: 'acceptance',
      BOOKING_ACTION: 'recover',
    });
    expect(recovered).toMatchObject({
      state: 'done',
      productId: output.productId,
      notifications: ['google-calendar.sync-requested'],
      products: [expect.objectContaining({ id: output.productId, status: 'published' })],
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
    expect(
      (await run(id, { BOOKING_MODE: 'acceptance', BOOKING_ACTION: 'recover' }))[0].notifications,
    ).toEqual([]);
  }, 30000);
  it('retains ambiguous product setup and permits explicit owned draft cleanup', async () => {
    const id = randomUUID();
    seed(id, 55);
    const [failed] = await run(id, {
      BOOKING_MODE: 'acceptance',
      BOOKING_FAIL: 'inventory',
    });
    expect(failed).toMatchObject({
      eventStatus: 'pending',
      products: [expect.objectContaining({ status: 'draft' })],
      reservations: [expect.objectContaining({ state: 'held' })],
    });
    await expect(
      run(id, {
        BOOKING_MODE: 'acceptance',
        BOOKING_ACTION: 'abort',
        BOOKING_FAIL: 'release',
      }),
    ).rejects.toThrow('Fixture release interrupted');
    const [aborted] = await run(id, {
      BOOKING_MODE: 'acceptance',
      BOOKING_ACTION: 'abort',
    });
    expect(aborted).toMatchObject({
      type: 'aborted',
      products: [],
      reservations: [expect.objectContaining({ state: 'released' })],
    });
    expect(await run(id, { BOOKING_MODE: 'acceptance', BOOKING_ACTION: 'abort' })).toEqual([aborted]);
  }, 30000);
  it('records native behavior for changed input under an existing execution', async () => {
    const id = randomUUID();
    await run(id);
    const repeated = await run(id, { BOOKING_VALUE: 'changed' });
    expect(repeated).toEqual([expect.objectContaining({ type: 'result', result: 'original' })]);
  });
});
