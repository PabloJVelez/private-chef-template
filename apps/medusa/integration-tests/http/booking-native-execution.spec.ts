import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

jest.setTimeout(30000);
const worker = path.resolve(__dirname, '../booking/native-worker.ts');
const env = { ...process.env };
const { Client } = require('@medusajs/framework/pg');
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
    const timeout = setTimeout(
      () => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `Fixture timed out after messages ${JSON.stringify(messages.map((m) => ({ type: m.type, status: m.status, body: m.body })))}: ${stderr}`,
          ),
        );
      },
      extra.BOOKING_NORMAL_RETRIES === 'true' ? 30000 : 15000,
    );
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
describe('Medusa native Redis execution', () => {
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
    const resumed = await run(id, { BOOKING_MODE: 'acceptance', BOOKING_WAIT_FOR_COMPLETION: 'true' });
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
  const seed = (id: string, day: number, extra: Record<string, string> = {}) => {
    const seeded = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', worker, 'seed'], {
      env: {
        ...env,
        BOOKING_EXECUTION_ID: id,
        BOOKING_MODE: 'acceptance',
        BOOKING_DAY: String(day),
        ...extra,
      },
      encoding: 'utf8',
    });
    if (seeded.status !== 0) throw new Error(seeded.stderr);
    return JSON.parse(seeded.stdout.trim().split('\n').at(-1)!).seededEventId as string;
  };
  it.each(['generated', '01M70EQY8KJDNQN7WD745FQDY1'])(
    'accepts realistic ID %s through the route without awaiting a retry',
    async (shape) => {
      const id = seed(
        shape === 'generated' ? randomUUID() : shape,
        shape === 'generated' ? 56 : 57,
        shape === 'generated' ? { BOOKING_GENERATED_ID: 'true', BOOKING_PUNCTUATION: 'true' } : {},
      );
      expect(id).toMatch(/[A-Z]/);
      const requestId = randomUUID();
      const [output] = await run(id, {
        BOOKING_MODE: 'acceptance',
        BOOKING_ACTION: 'route',
        BOOKING_NORMAL_RETRIES: 'true',
        BOOKING_REQUEST_ID: requestId,
      });
      console.log('normal-config route evidence', {
        eventId: id,
        status: output.status,
        elapsedMs: output.elapsedMs,
        finalizedMs: output.finalizedMs,
        productCreateCalls: output.productCreateCalls,
        handle: output.products[0]?.handle,
      });
      expect(output).toMatchObject({
        status: 200,
        eventStatus: 'confirmed',
        body: { success: true, pending: false },
        products: [
          expect.objectContaining({
            status: 'published',
            metadata: expect.objectContaining({ chef_event_id: id }),
          }),
        ],
        reservations: [expect.objectContaining({ state: 'confirmed' })],
      });
      expect(output.finalizedMs).toBeGreaterThan(0);
      expect(output.products[0].handle).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(output.products[0].handle.endsWith(id.toLowerCase())).toBe(true);
      expect(output.childInput.products[0].variants[0].sku).toContain(id);
      expect(output.reservations[0].owner_id).toBe(id);
      const [replayed] = await run(id, {
        BOOKING_MODE: 'acceptance',
        BOOKING_ACTION: 'route',
        BOOKING_NORMAL_RETRIES: 'true',
        BOOKING_REQUEST_ID: requestId,
      });
      expect(replayed.products.map((p: any) => p.id)).toEqual(output.products.map((p: any) => p.id));
      expect(replayed.status).toBe(200);
    },
    30000,
  );
  const route = (id: string, requestId: string, extra: Record<string, string> = {}) =>
    run(
      id,
      {
        BOOKING_MODE: 'acceptance',
        BOOKING_ACTION: 'route',
        BOOKING_NORMAL_RETRIES: 'true',
        BOOKING_REQUEST_ID: requestId,
        ...extra,
      },
      'route',
    ); // Replace the fixture process after the response; shutdown can await scheduled compensation.
  it('rejects an elapsed arrival promptly and resolves its unclaimed attempt', async () => {
    const id = seed(randomUUID(), -1, { BOOKING_GENERATED_ID: 'true' });
    const requestId = randomUUID();
    const [rejected] = await route(id, requestId);
    console.log('elapsed arrival evidence', {
      status: rejected.status,
      elapsedMs: rejected.elapsedMs,
      body: rejected.body,
    });
    expect(rejected).toMatchObject({
      status: 409,
      productCreateCalls: 0,
      eventStatus: 'pending',
      body: { success: false, pending: false, resolved: true },
      products: [],
      reservations: [],
      attempt: { state: 'aborted', cleanup_completed_at: expect.any(String) },
    });
    expect(rejected.body.message).toContain('That arrival time is no longer available');
    expect((await route(id, requestId))[0]).toMatchObject({
      status: 409,
      productCreateCalls: 0,
      body: { resolved: true },
    });
    await route(id, requestId, { BOOKING_ACTION: 'reschedule' });
    const [accepted] = await route(id, randomUUID());
    expect(accepted).toMatchObject({
      status: 200,
      eventStatus: 'confirmed',
      productCreateCalls: 1,
      products: [expect.objectContaining({ status: 'published' })],
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
    const [stale] = await route(id, requestId);
    expect(stale).toMatchObject({
      status: 409,
      productCreateCalls: 0,
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
    expect(stale.products[0].id).toBe(accepted.products[0].id);
  }, 30000);
  it('rejects a real conflicting reservation without releasing another owner’s time', async () => {
    const id = seed(randomUUID(), 61, { BOOKING_GENERATED_ID: 'true', BOOKING_POLICY: 'conflict' });
    const [rejected] = await route(id, randomUUID());
    console.log('conflicting arrival evidence', {
      status: rejected.status,
      elapsedMs: rejected.elapsedMs,
      body: rejected.body,
    });
    expect(rejected).toMatchObject({
      status: 409,
      productCreateCalls: 0,
      products: [],
      reservations: [],
      body: { pending: false, resolved: true },
      conflicts: [expect.objectContaining({ state: 'held', owner_id: `other-${id}` })],
    });
  });
  it.each(['missing', 'timezone', 'inactive', 'unconfigured'])(
    'resolves the explicit %s pre-acceptance policy',
    async (policy) => {
      const id = seed(randomUUID(), 63, { BOOKING_GENERATED_ID: 'true', BOOKING_POLICY: policy });
      const [rejected] = await route(id, randomUUID(), { BOOKING_POLICY: policy });
      expect(rejected).toMatchObject({
        status: 409,
        productCreateCalls: 0,
        products: [],
        reservations: [],
        body: { pending: false, resolved: true },
        attempt: { state: 'aborted', cleanup_completed_at: expect.any(String) },
      });
    },
  );
  it.each(['availability-db', 'unrelated-not-allowed'])(
    'keeps %s retryable before acquisition',
    async (failure) => {
      const id = seed(randomUUID(), failure === 'availability-db' ? 65 : 66, {
        BOOKING_GENERATED_ID: 'true',
      });
      const requestId = randomUUID();
      const [pending] = await route(id, requestId, { BOOKING_FAIL: failure });
      expect(pending).toMatchObject({
        status: 202,
        productCreateCalls: 0,
        products: [],
        reservations: [],
        body: { pending: true, resolved: false },
        attempt: { state: 'active', cleanup_completed_at: null },
      });
      expect(pending.body.message).toBeUndefined();
    },
    30000,
  );
  it('reports deterministic native Product validation without retrying it or leaking the raw input', async () => {
    const id = seed(randomUUID(), 58, { BOOKING_GENERATED_ID: 'true' });
    const [output] = await route(id, randomUUID(), { BOOKING_FAIL: 'product-validation' });
    console.log('deterministic validation evidence', {
      status: output.status,
      elapsedMs: output.elapsedMs,
      productCreateCalls: output.productCreateCalls,
      body: output.body,
    });
    expect(output).toMatchObject({
      status: 409,
      productCreateCalls: 1,
      eventStatus: 'pending',
      body: { success: false, pending: false, resolved: true },
      products: [],
      attempt: { state: 'aborted', cleanup_completed_at: expect.any(String) },
      reservations: [expect.objectContaining({ state: 'released' })],
    });
    expect(output.body.message).toContain('Ticket details are invalid');
    expect(output.body.message).not.toContain('INVALID handle');
  }, 30000);
  it('keeps transient native failures pending and resumes after the normal retry interval', async () => {
    const id = seed(randomUUID(), 59, { BOOKING_GENERATED_ID: 'true' });
    const requestId = randomUUID();
    const [pending, resumed] = await route(id, requestId, {
      BOOKING_FAIL: 'after-acquire',
      BOOKING_RETRY_IN_PROCESS: 'true',
    });
    expect(pending).toMatchObject({
      status: 202,
      body: { pending: true, resolved: false },
      reservations: [expect.objectContaining({ state: 'held' })],
    });
    expect(resumed).toMatchObject({
      status: 200,
      body: { pending: false },
      eventStatus: 'confirmed',
      products: [expect.objectContaining({ status: 'published' })],
      reservations: [expect.objectContaining({ state: 'confirmed' })],
    });
  }, 30000);
  it('retains persisted invalid child input, safely aborts interrupted cleanup, then accepts a new attempt', async () => {
    const id = seed(randomUUID(), 60, { BOOKING_GENERATED_ID: 'true' });
    const oldRequest = randomUUID();
    const [legacy] = await route(id, oldRequest, { BOOKING_ACTION: 'seed-legacy-attempt' });
    console.log('legacy child evidence', legacy);
    expect(legacy).toMatchObject({ state: 'reverted', productCreateCalls: 1 });
    expect(legacy.errors[0].error.message).toContain('Invalid product handle');
    // Patched code cannot replace the old native child's persisted input on replay.
    const [replayed] = await route(id, oldRequest, {
      BOOKING_ACTION: 'route-resume',
      BOOKING_FAIL: 'release',
    });
    expect(replayed).toMatchObject({
      status: 409,
      body: { success: false, resolved: false },
      products: [],
      attempt: { state: 'aborted', cleanup_completed_at: null },
      reservations: [expect.objectContaining({ state: 'held' })],
    });
    expect(replayed.childInput.products[0].handle).toContain(id);
    const newRequest = randomUUID();
    await expect(route(id, newRequest, { BOOKING_FAIL: 'release' })).rejects.toThrow('finish cleanup');
    await expect(
      route(id, oldRequest, { BOOKING_ACTION: 'route-abort', BOOKING_FAIL: 'release' }),
    ).rejects.toThrow('Fixture release interrupted');
    const [cleaned] = await route(id, oldRequest, { BOOKING_ACTION: 'route-abort' });
    expect(cleaned).toMatchObject({
      status: 200,
      body: { success: true, resolved: true },
      products: [],
      attempt: { cleanup_completed_at: expect.any(String) },
      reservations: [expect.objectContaining({ state: 'released' })],
    });
    expect((await route(id, oldRequest, { BOOKING_ACTION: 'route-abort' }))[0].body.resolved).toBe(true);
    const [resolvedReplay] = await route(id, oldRequest, { BOOKING_ACTION: 'route-resume' });
    expect(resolvedReplay).toMatchObject({ status: 409, body: { success: false, resolved: true } });
    const [accepted] = await route(id, newRequest);
    expect(accepted).toMatchObject({
      status: 200,
      eventStatus: 'confirmed',
      products: [expect.objectContaining({ status: 'published' })],
    });
    expect(accepted.reservations.map((r: any) => r.state).sort()).toEqual(['confirmed', 'released']);
    const [stale] = await route(id, oldRequest);
    expect(stale.status).toBe(409);
    expect(stale.products.map((p: any) => p.id)).toEqual(accepted.products.map((p: any) => p.id));
    expect(stale.reservations.map((r: any) => r.state).sort()).toEqual(['confirmed', 'released']);
  }, 60000);
  it('refuses replay after completed history expires without changing product or protected time', async () => {
    const id = randomUUID();
    seed(id, 81);
    const [completed] = await run(id, { BOOKING_MODE: 'acceptance' });
    expect(completed.state).toBe('done');
    await expect(run(id, { BOOKING_MODE: 'acceptance', BOOKING_EXPIRE_HISTORY: 'true' }))
      .rejects.toThrow('Acceptance execution history is unavailable');
    const db = new Client({ connectionString: env.BOOKING_TEST_DATABASE_URL });
    await db.connect();
    try {
      const events = await db.query('select status, "productId" from chef_event where id = $1', [id]);
      expect(events.rows).toEqual([{ status: 'confirmed', productId: completed.productId }]);
      const protectedRows = await db.query('select id, state from scheduling_reservation where owner_id = $1', [id]);
      expect(protectedRows.rows).toEqual(completed.reservations.map((r: any) => ({ id: r.id, state: r.state })));
      const products = await db.query("select id from product where metadata->>'chef_event_id' = $1 and deleted_at is null", [id]);
      expect(products.rows).toEqual([{ id: completed.productId }]);
    } finally { await db.end(); }
  }, 30000);
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
