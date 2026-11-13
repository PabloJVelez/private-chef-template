import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const { Client } = require('@medusajs/framework/pg');
const worker = path.resolve(__dirname, '../schedule-edit/worker.ts');
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
const databaseName = 'booking_test_schedule_native_' + randomUUID().replace(/-/g, '');
let admin: any;
const run = (action: string, extra: Record<string, string> = {}, killAt?: string): Promise<any[]> =>
  new Promise((resolve, reject) => {
    const child = fork(worker, [action], {
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      env: { ...env, ...extra },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    const messages: any[] = [];
    child.stderr?.on('data', (value) => {
      stderr += value;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Fixture timeout: ' + stderr));
    }, 20000);
    child.on('message', (message: any) => {
      messages.push(message);
      if (message.type === killAt) child.kill('SIGKILL');
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && signal !== 'SIGKILL') reject(new Error(stderr));
      else resolve(messages);
    });
  });

it('runs schedule contract/race cases using actual Medusa modules and PostgreSQL', () => {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--forceExit',
      '--testMatch=**/schedule-edit/cases.spec.ts',
    ],
    { env: process.env, encoding: 'utf8', timeout: 45000 },
  );
  if (result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
  console.info(result.stderr);
}, 50000);

describe('schedule edit durable recovery across process replacement', () => {
  beforeAll(async () => {
    if (!env.BOOKING_TEST_DATABASE_URL || !env.BOOKING_TEST_REDIS_URL)
      throw new Error('Disposable PostgreSQL and Redis fixtures required');
    const url = new URL(env.BOOKING_TEST_DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/booking_test_'))
      throw new Error('Task-owned loopback fixture required');
    admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    url.pathname = '/' + databaseName;
    env.BOOKING_TEST_DATABASE_URL = url.toString();
    await run('migrate');
  }, 30000);
  afterAll(async () => {
    if (!admin) return;
    // Database and queue are uniquely task-owned; fixture container cleanup removes Redis keys.
    await admin.query(`drop database ${databaseName} with (force)`);
    await admin.end();
  });
  it('blocks generic workflow writes over authenticated HTTP without affecting signed confirmation', async () => {
    const [seed] = await run('seed');
    const results = await run('execution-boundary', { SCHEDULE_REFERENCE: seed.preview.reference });
    const denials = results.filter(x => x.type === 'boundary');
    expect(denials.map(x => x.name)).toEqual([
      'unsigned-modified', 'impersonated-actor', 'original-unsigned',
      'signed-reference-different-caller', 'writes-disabled', 'encoded-id',
      'trailing-slash', 'step-success', 'step-failure',
    ]);
    for (const denied of denials) {
      expect(denied).toMatchObject({ code: 403, time: '10:00' });
      expect(denied.receipt).toBeNull();
      expect(denied.originalReceipt).toBeNull();
    }
    expect(results.find(x => x.type === 'control')).toMatchObject({
      code: 200, body: { acknowledgement: { workflowId: 'schedule-boundary-control', hasFinished: true, hasFailed: false } },
    });
    // Dispatch must occur only after every denied attempt and the control workflow.
    expect(results.map(x => x.type)).toEqual([
      ...Array(9).fill('boundary'), 'control', 'dispatch', 'dedicated', 'recovered',
    ]);
    for (const type of ['dedicated', 'recovered']) {
      expect(results.find(x => x.type === type)).toMatchObject({
        code: 200, body: { outcome: { outcome: 'saved', time: '11:00' }, googleSync: 'requested' },
      });
    }
  }, 60000);
  it('replays a completed workflow across restart without a second Google dispatch', async () => {
    const [seed] = await run('seed');
    const extra = { SCHEDULE_REFERENCE: seed.preview.reference };
    const first = await run('confirm', extra);
    expect(first.map((x) => x.type)).toEqual(['dispatch', 'result']);
    expect(first[1]).toMatchObject({
      code: 200,
      body: { outcome: { outcome: 'saved' }, googleSync: 'requested' },
    });
    expect(await run('confirm', extra)).toEqual([first[1]]);
  }, 60000);
  it('concurrent HTTP confirmations cannot duplicate the database edit or Google dispatch', async () => {
    const [seed] = await run('seed');
    const extra = { SCHEDULE_REFERENCE: seed.preview.reference };
    const results = await Promise.all([run('confirm', extra), run('confirm', extra)]);
    expect(results.flat().filter((x) => x.type === 'dispatch')).toHaveLength(1);
    const recovered = await run('recover', extra);
    expect(recovered[0]).toMatchObject({
      code: 200,
      body: { outcome: { outcome: 'saved' }, googleSync: 'requested' },
    });
  }, 60000);
  it('lost Google dispatch acknowledgement recovers saved/unknown without duplicate work', async () => {
    const [seed] = await run('seed');
    const extra = { SCHEDULE_REFERENCE: seed.preview.reference };
    const first = await run('confirm', { ...extra, SCHEDULE_CRASH: 'dispatched' }, 'dispatched');
    expect(first.map((x) => x.type)).toEqual(['dispatch', 'dispatched']);
    const recovered = await run('recover', extra);
    expect(recovered).toEqual([
      expect.objectContaining({
        type: 'result',
        code: 200,
        body: expect.objectContaining({
          outcome: expect.objectContaining({ outcome: 'saved' }),
          googleSync: 'unknown',
        }),
      }),
    ]);
    expect(await run('confirm', extra)).toEqual(recovered);
  }, 60000);
  it('DB commit then lost response/checkpoint survives expiration, restart, and a separate later edit', async () => {
    const [seed] = await run('seed');
    const reference = seed.preview.reference;
    const crashed = await run(
      'confirm',
      { SCHEDULE_REFERENCE: reference, SCHEDULE_CRASH: 'committed' },
      'committed',
    );
    expect(crashed).toHaveLength(1);
    expect(crashed[0]).toMatchObject({
      type: 'committed',
      receipt: { outcome: { outcome: 'saved', time: '11:00' } },
    });
    const recovered = await run('recover', {
      SCHEDULE_REFERENCE: reference,
      SCHEDULE_EXPIRED: 'true',
    });
    expect(recovered).toEqual([
      expect.objectContaining({ type: 'dispatch' }),
      expect.objectContaining({
        type: 'result',
        code: 200,
        time: '11:00',
        body: {
          ...crashed[0].receipt,
          googleSync: 'requested',
          historical: true,
          reserved: false,
        },
      }),
    ]);
    const later = await run('later-edit', {
      SCHEDULE_REFERENCE: reference,
      SCHEDULE_EXPIRED: 'true',
    });
    expect(later[0]).toMatchObject({
      time: '12:00',
      body: { outcome: { time: '11:00', outcome: 'saved' } },
    });
    const retried = await run('confirm', {
      SCHEDULE_REFERENCE: reference,
      SCHEDULE_EXPIRED: 'true',
    });
    expect(retried[0]).toMatchObject({
      time: '12:00',
      body: { outcome: { time: '11:00', outcome: 'saved' } },
    });
    // Native workflow did begin, but its write-step response is absent. Domain proof is sufficient.
    const db = new Client({ connectionString: env.BOOKING_TEST_DATABASE_URL });
    await db.connect();
    const history = await db.query('select * from workflow_execution where transaction_id=$1', [
      seed.preview.operationId,
    ]);
    expect(history.rows).toHaveLength(1);
    const proof = await db.query('select * from chef_event_schedule_edit where id=$1', [
      seed.preview.operationId,
    ]);
    expect(proof.rows[0].outcome.outcome).toBe('saved');
    await db.end();
    console.info('durable commit/checkpoint-loss evidence', {
      operationId: seed.preview.operationId,
      recovered: recovered[1].body,
      laterTime: retried[0].time,
    });
  }, 60000);
});
