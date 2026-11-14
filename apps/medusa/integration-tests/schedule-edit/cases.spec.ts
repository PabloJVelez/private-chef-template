import { Client as MedusaClient } from '@medusajs/js-sdk';
import { ScheduleEditState } from '../../src/admin/components/chef-chat/schedule-edit-state';
import { createScheduleTransport } from '../../src/admin/components/chef-chat/schedule-edit-transport';
import type { ScheduleAnswer } from '../../src/lib/chef-ai/contracts';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ApiLoader } from '@medusajs/framework/http';
import { configManager } from '@medusajs/framework/config';
import { randomUUID } from 'node:crypto';
import { Settings } from 'luxon';
import { asValue } from '@medusajs/framework/awilix';
import { bookingApp } from '../booking/app';
import type ChefEventModuleService from '../../src/modules/chef-event/service';
import type SchedulingModuleService from '../../src/modules/scheduling/service';
import {
  previewScheduleEdit,
  confirmScheduleEdit,
  recoverScheduleEdit,
} from '../../src/lib/private-event-schedule/command';
import { verifyReference } from '../../src/lib/private-event-schedule/contract';
import { scheduleEditHandler } from '../../src/lib/private-event-schedule/http';
const modelCall = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: class {
  chat = { completions: { create: (...args: unknown[]) => modelCall(...args) } };
} }));
const modelTool = (name: string, args: unknown) => ({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const { Client } = require('@medusajs/framework/pg');
const express = require('express');
const jwt = require('jsonwebtoken');
let server: any, routesDir: string, baseUrl: string;
const secret = 'isolated-test-signing-secret-32-characters';
const databaseName = 'booking_test_schedule_' + randomUUID().replace(/-/g, '');
let admin: any, db: any, fixture: Awaited<ReturnType<typeof bookingApp>>;
let chef: ChefEventModuleService, scheduling: SchedulingModuleService;
const listStores = jest.fn();
const emit = jest.fn(),
  user = jest.fn();
const eventInput = (id: string) => ({
  id,
  requestedDate: new Date('2030-03-09T15:00:00Z'),
  requestedTime: '10:00',
  partySize: 4,
  eventType: 'Dinner',
  experience_type_id: 'experience',
  templateProductId: 'menu',
  locationType: 'customer_location' as const,
  locationAddress: 'Private address',
  firstName: 'Private',
  lastName: 'Guest',
  email: 'private@example.invalid',
  phone: '',
  notes: 'Private notes',
  totalPrice: 400,
  depositPaid: false,
  specialRequirements: '',
  estimatedDuration: 60,
  timeZone: 'America/New_York',
});
const preview = (body: Record<string, unknown> = { time: '11:00' }) =>
  previewScheduleEdit(fixture.container, 'admin', { eventId: 'event', ...body }, secret);
const input = async (body?: Record<string, unknown>) =>
  verifyReference((await preview(body)).reference, 'admin', secret);
const row = async () => (await db.query(`select * from chef_event where id='event'`)).rows[0];
const request = async (
  action: 'preview' | 'confirm' | 'recover',
  body: unknown,
  auth = { actor_id: 'admin', actor_type: 'user' },
) => {
  const res: any = {
    code: 200,
    setHeader: jest.fn(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
  await scheduleEditHandler(action)({ scope: fixture.container, auth_context: auth, body } as any, res);
  return res;
};

beforeAll(async () => {
  const raw = process.env.BOOKING_TEST_DATABASE_URL;
  if (
    !raw ||
    !['127.0.0.1', 'localhost'].includes(new URL(raw).hostname) ||
    !new URL(raw).pathname.startsWith('/booking_test_')
  )
    throw new Error('Task-owned loopback booking_test_* database required');
  admin = new Client({ connectionString: raw });
  await admin.connect();
  await admin.query(`create database ${databaseName}`);
  const url = new URL(raw);
  url.pathname = '/' + databaseName;
  fixture = await bookingApp(url.toString());
  db = new Client({ connectionString: url.toString() });
  await db.connect();
  chef = fixture.container.resolve('chefEventModuleService');
  scheduling = fixture.container.resolve('scheduling');
  fixture.container.register('store', asValue({ listStores }));
  fixture.container.register('user', asValue({ retrieveUser: user }));
  fixture.container.register('event_bus', asValue({ emit }));
  fixture.container.register('configModule', asValue({ projectConfig: { http: { jwtSecret: secret } } }));
  const config = configManager.loadConfig({
    baseDir: process.cwd(),
    projectConfig: {
      projectConfig: {
        http: {
          jwtSecret: secret,
          cookieSecret: secret,
          adminCors: '',
          storeCors: '',
          authCors: '',
        },
      },
    },
  });
  fixture.container.register('configModule', asValue(config));
  const app = express();
  app.use((req: any, _res: any, next: any) => {
    req.scope = fixture.container.createScope();
    next();
  });
  routesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bts21-schedule-routes-'));
  for (const action of ['preview', 'confirm', 'recover']) {
    const dir = path.join(routesDir, 'admin/chef-events/schedule-edit', action);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'route.js'),
      `module.exports = require(${JSON.stringify(path.resolve(__dirname, '../../src/api/admin/chef-events/schedule-edit', action, 'route.ts'))})`,
    );
  }
  const chatDir = path.join(routesDir, 'admin/chef-ai/chat');
  fs.mkdirSync(chatDir, { recursive: true });
  fs.writeFileSync(path.join(chatDir, 'route.js'), `module.exports = require(${JSON.stringify(path.resolve(__dirname, '../../src/api/admin/chef-ai/chat/route.ts'))})`);
  fs.writeFileSync(
    path.join(routesDir, 'middlewares.js'),
    `module.exports = require(${JSON.stringify(path.resolve(__dirname, '../../src/api/middlewares.ts'))})`,
  );
  process.env.SENTRY_DSN = ''; // This isolated fixture must never send monitoring data.
  await new ApiLoader({
    app,
    sourceDir: routesDir,
    container: fixture.container,
  }).load();
  server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/admin/chef-events/schedule-edit`;
}, 30000);
afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (routesDir) fs.rmSync(routesDir, { recursive: true, force: true });
  Settings.now = () => Date.now();
  await fixture?.close();
  await db?.end();
  if (admin) {
    await admin.query(`drop database ${databaseName} with (force)`);
    await admin.end();
  }
});
beforeEach(async () => {
  jest.restoreAllMocks();
  modelCall.mockReset().mockResolvedValue(modelTool('get_schedule', { period: 'today', startDate: null, endDate: null, timeZone: 'America/New_York' }));
  listStores.mockReset().mockResolvedValue([{ id: 'store' }]);
  emit.mockReset().mockResolvedValue(undefined);
  user.mockReset().mockImplementation(async (id: string) => {
    if (!['admin', 'other'].includes(id) && !id.startsWith('chat-fixture-')) throw new Error('Unknown fixture account');
    return { id };
  });
  process.env.CHEF_AI_SCOPE = 'single_site';
  process.env.CHEF_AI_ADMIN_USER_IDS = 'admin'; // Obsolete setting must not restrict Admin B.
  process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED = 'true';
  Settings.now = () => Date.parse('2030-02-01T00:00:00Z');
  await db.query(
    'truncate chef_event_schedule_edit, scheduling_reservation, chef_event_acceptance_attempt, chef_event, availability_setting, experience_type',
  );
  await fixture.container.resolve<any>('availability').createAvailabilitySettings({
    id: 'chef-default',
    timezone: 'America/New_York',
    weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [day, [{ start: '00:00', end: '23:59' }]])),
    overrides: {},
    google_mode: 'internal_only',
  });
  await fixture.container.resolve<any>('experienceTypeModuleService').createExperienceTypes({
    id: 'experience',
    name: 'Dinner',
    slug: 'dinner',
    highlights: [],
    available_time_slots: [],
    description: 'Fixture',
    is_active: true,
    duration_minutes: 60,
    preparation_minutes: 0,
    travel_minutes: 0,
    cleanup_minutes: 0,
    time_slot_interval_minutes: 30,
  });
  await chef.createChefEvents(eventInput('event'));
  await chef.createChefEvents(eventInput('unselected'));
});

it('preview is read-only, verified target name but no contact data; save changes only two time fields and updated_at on the exact ID', async () => {
  const before = await row(),
    other = await chef.retrieveChefEvent('unselected');
  const p = await preview({ date: '2030-03-11', time: '11:00' });
  expect(await row()).toEqual(before);
  expect((await db.query('select * from chef_event_schedule_edit')).rows).toEqual([]);
  expect(p.target).toMatchObject({ id: "event", title: "Private Guest", revision: p.expectedRevision });
  expect(JSON.stringify({ ...p, reference: undefined })).not.toMatch(/private@example|Private address|Private notes/);
  expect(p.current).toEqual({
    date: '2030-03-09',
    time: '10:00',
    timezone: 'America/New_York',
    instant: '2030-03-09T15:00:00.000Z',
  });
  expect(p.proposed.instant).toBe('2030-03-11T15:00:00.000Z');
  const result = await confirmScheduleEdit(fixture.container, verifyReference(p.reference, 'admin', secret));
  expect(result).toMatchObject({
    outcome: { outcome: 'saved' },
    googleSync: 'requested',
    reserved: false,
  });
  const after = await row();
  expect(
    Object.keys(after)
      .filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]))
      .sort(),
  ).toEqual(['requestedDate', 'requestedTime', 'updated_at']);
  expect(await chef.retrieveChefEvent('unselected')).toEqual(other);
  expect(emit.mock.calls).toEqual([
    [
      {
        name: 'google-calendar.sync-requested',
        data: { chefEventId: 'event', operation: 'upsert' },
      },
    ],
  ]);
  expect(await scheduling.listReservations({})).toEqual([]);
});
it.each([{ date: '2030-03-11' }, { time: '12:00' }])('supports date/time-only %j', async (body) => {
  const cmd = await input(body);
  await confirmScheduleEdit(fixture.container, cmd);
  expect(new Date((await row()).requestedDate).toISOString()).toBe(cmd.instant);
  expect((await row()).requestedTime).toBe(cmd.time);
});
it('no-op has a durable no-change outcome, no event mutation and no dispatch', async () => {
  const before = await row(),
    cmd = await input({ time: '10:00' });
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'no_change' },
    googleSync: 'not_requested',
  });
  expect(await row()).toEqual(before);
  expect(emit).not.toHaveBeenCalled();
});
it.each([
  { date: '2030-03-10', time: '02:30' },
  { date: '2030-02-30' },
  { date: '2020-01-01' },
  { time: '25:00' },
  { time: '11:01' },
  { time: '11:00', status: 'confirmed' },
  {},
])('refuses invalid/past/gap/off-slot/extra fields %j', async (body) => {
  const before = await row();
  await expect(preview(body)).rejects.toThrow();
  expect(await row()).toEqual(before);
});
it('refuses a DST fold', async () => {
  Settings.now = () => Date.parse('2030-10-01T00:00Z');
  await expect(preview({ date: '2030-11-03', time: '01:30' })).rejects.toThrow('unambiguous');
});
it.each(['missing', 'inactive', 'timezone', 'unconfigured', 'lead-time'])(
  'revalidates %s policy after preview without event revision changing',
  async (kind) => {
    const cmd = await input(),
      before = await row();
    if (kind === 'missing') await db.query('update experience_type set deleted_at=now()');
    if (kind === 'inactive') await db.query('update experience_type set is_active=false');
    if (kind === 'timezone') await db.query("update availability_setting set timezone='America/Chicago'");
    if (kind === 'unconfigured') await db.query('delete from availability_setting');
    if (kind === 'lead-time')
      await db.query(
        `update availability_setting set notice_rules='[{"enabled":true,"days":90,"scope":"all","experience_ids":[]}]'`,
      );
    await expect(preview()).rejects.toThrow();
    expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
      outcome: { outcome: 'rejected' },
    });
    expect(await row()).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  },
);
it('refuses missing experience and invalid event timezone with no defaults', async () => {
  await chef.updateChefEvents({ id: 'event', experience_type_id: null });
  await expect(preview()).rejects.toThrow('active catalog');
  await chef.updateChefEvents({ id: 'event', timeZone: 'Invalid/Zone' });
  await expect(preview()).rejects.toThrow('valid event timezone');
});
it('refuses unavailable slots and unexpected owned reservations without releasing either', async () => {
  const cmd = await input();
  await scheduling.acquire({
    id: 'busy',
    ownerId: 'another',
    attemptId: 'another',
    start: cmd.instant,
    end: '2030-03-09T17:00Z',
  });
  await expect(preview()).rejects.toThrow();
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'rejected' },
  });
  await scheduling.release({
    id: 'busy',
    ownerId: 'another',
    attemptId: 'another',
  });
  await scheduling.acquire({
    id: 'owned',
    ownerId: 'event',
    attemptId: 'orphan',
    start: '2030-03-12T10:00Z',
    end: '2030-03-12T11:00Z',
  });
  await expect(preview()).rejects.toThrow();
  expect((await scheduling.retrieveReservation('owned')).state).toBe('held');
});
it('bindAcceptance before token/updated_at changes invalidates a preview; cleaned abort enables a fresh preview', async () => {
  const cmd = await input(),
    before = await row();
  const attempt = await chef.bindAcceptance({
    eventId: 'event',
    actorId: 'admin',
    body: {},
  });
  expect((await row()).updated_at).toEqual(before.updated_at);
  expect((await row()).acceptanceToken).toBeNull();
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'rejected' },
  });
  await expect(preview()).rejects.toThrow();
  await chef.abortUnclaimedAcceptance('event', attempt.id);
  await expect(preview()).rejects.toThrow();
  await chef.completeAcceptanceCleanup('event', attempt.id);
  const fresh = await input();
  expect(await confirmScheduleEdit(fixture.container, fresh)).toMatchObject({
    outcome: { outcome: 'saved' },
  });
});
it('serializes against an acceptance bind holding the event row lock', async () => {
  const cmd = await input();
  await db.query('begin');
  await db.query("select id from chef_event where id='event' for update");
  const saving = chef.editPendingSchedule(cmd);
  await db.query(
    `insert into chef_event_acceptance_attempt(id,event_id,actor_id,request_key,input) values('race','event','admin','race','{}')`,
  );
  await db.query(`update chef_event set "acceptanceExecution"='race' where id='event'`);
  await db.query('commit');
  expect(await saving).toMatchObject({ outcome: { outcome: 'rejected' } });
  expect((await row()).requestedTime).toBe('10:00');
});
it.each(['cancel', 'edit', 'claim', 'finalize'])('refuses %s after preview', async (kind) => {
  const cmd = await input();
  if (kind === 'cancel') await chef.cancelEvent({ id: 'event' });
  if (kind === 'edit') await chef.updateChefEvents({ id: 'event', notes: 'Changed separately' });
  if (kind === 'claim' || kind === 'finalize') {
    const a = await chef.bindAcceptance({
      eventId: 'event',
      actorId: 'admin',
      body: {},
    });
    const e = await chef.retrieveChefEvent('event');
    await chef.claimAcceptance({
      id: 'event',
      token: a.id,
      updatedAt: e.updated_at,
      start: '2030-03-09T15:00Z',
      end: '2030-03-09T16:00Z',
      snapshot: { duration_minutes: 60, timezone: e.timeZone },
    });
    if (kind === 'finalize')
      await chef.finalizeAcceptance({
        id: 'event',
        token: a.id,
        productId: 'ticket',
      });
  }
  const before = await row();
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'rejected' },
  });
  expect(await row()).toEqual(before);
});
it('double clicks share original result, changed input/actor is denied, and later edits never get overwritten', async () => {
  const cmd = await input();
  const results = await Promise.all([
    confirmScheduleEdit(fixture.container, cmd),
    confirmScheduleEdit(fixture.container, cmd),
  ]);
  expect(results.map((r) => typeof r.outcome === 'object' && r.outcome.outcome)).toEqual(['saved', 'saved']);
  expect(emit).toHaveBeenCalledTimes(1);
  await expect(confirmScheduleEdit(fixture.container, { ...cmd, time: '12:00' })).rejects.toThrow(
    'different input',
  );
  await expect(confirmScheduleEdit(fixture.container, { ...cmd, actorId: 'other' })).rejects.toThrow(
    'different input',
  );
  await chef.updateChefEvents({
    id: 'event',
    requestedTime: '12:00',
    requestedDate: new Date('2030-03-09T17:00Z'),
  });
  const before = await row();
  expect(await recoverScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { time: '11:00', outcome: 'saved' },
    historical: true,
  });
  await confirmScheduleEdit(fixture.container, cmd);
  expect(await row()).toEqual(before);
  expect(emit).toHaveBeenCalledTimes(1);
});
it('Google emit failure never rolls back a save and is never dispatched twice', async () => {
  emit.mockRejectedValue(new Error('provider failed'));
  const cmd = await input();
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'saved' },
    googleSync: 'failed',
  });
  expect((await row()).requestedTime).toBe('11:00');
  await confirmScheduleEdit(fixture.container, cmd);
  expect(emit).toHaveBeenCalledTimes(1);
});
it('expired unused reference and missing history return unknown, recovery never writes', async () => {
  const cmd = await input();
  cmd.expiresAt = 1;
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: 'unknown',
  });
  expect(await recoverScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: 'unknown',
  });
  expect((await row()).requestedTime).toBe('10:00');
  expect(emit).not.toHaveBeenCalled();
});
it.each(['scope', 'opt-in', 'multiple-stores', 'missing-store', 'deleted-user', 'customer'])(
  'denies %s at preview, confirm and recover before event access',
  async (kind) => {
    const p = await preview();
    if (kind === 'scope') process.env.CHEF_AI_SCOPE = 'multi_site';
    if (kind === 'opt-in') delete process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED;
    if (kind === 'multiple-stores') listStores.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    if (kind === 'missing-store') listStores.mockResolvedValue([]);
    if (kind === 'deleted-user') user.mockRejectedValue(new Error('deleted'));
    const read = jest.spyOn(chef, 'readScheduleEditEvent');
    for (const action of ['preview', 'confirm', 'recover'] as const) {
      const res = await request(
        action,
        action === 'preview' ? { eventId: 'event', time: '11:00' } : { reference: p.reference },
        {
          actor_id: 'admin',
          actor_type: kind === 'customer' ? 'customer' : 'user',
        },
      );
      expect(res.code).toBe(403);
    }
    expect(read).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  },
);
it('HTTP rejects changed actor, tampered reference, and extra fields', async () => {
  const p = await preview();
  expect(
    (await request('confirm', { reference: p.reference }, { actor_id: 'other', actor_type: 'user' })).code,
  ).toBe(403);
  expect((await request('confirm', { reference: p.reference + 'x' })).code).toBe(403);
  expect((await request('confirm', { reference: p.reference, time: '12:00' })).code).toBe(400);
});

it.each(['claim', 'finalize', 'cancel'])(
  'rechecks %s between availability validation and the atomic command',
  async (kind) => {
    const cmd = await input();
    const original = chef.editPendingSchedule.bind(chef);
    jest.spyOn(chef, 'editPendingSchedule').mockImplementationOnce(async (...args) => {
      if (kind === 'cancel') await chef.cancelEvent({ id: 'event' });
      else {
        const a = await chef.bindAcceptance({
          eventId: 'event',
          actorId: 'admin',
          body: {},
        });
        const e = await chef.retrieveChefEvent('event');
        await chef.claimAcceptance({
          id: 'event',
          token: a.id,
          updatedAt: e.updated_at,
          start: '2030-03-09T15:00Z',
          end: '2030-03-09T16:00Z',
          snapshot: { duration_minutes: 60, timezone: e.timeZone },
        });
        if (kind === 'finalize')
          await chef.finalizeAcceptance({
            id: 'event',
            token: a.id,
            productId: 'ticket',
          });
      }
      return original(...args);
    });
    expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
      outcome: { outcome: 'rejected', committedRevision: null },
    });
    expect((await row()).requestedTime).toBe('10:00');
    expect(emit).not.toHaveBeenCalled();
  },
);
it('Google busy read failure falls back to internal availability and never claims Google is free', async () => {
  await db.query("update availability_setting set google_mode='required'");
  fixture.container.register(
    'googleCalendarConnectionModuleService',
    asValue({
      getPrimaryConnection: async () => {
        throw new Error('offline');
      },
    }),
  );
  const p = await preview();
  expect(p.googleAvailability).toBe('advisory');
  expect(p.reserved).toBe(false);
  expect(
    await confirmScheduleEdit(fixture.container, verifyReference(p.reference, 'admin', secret)),
  ).toMatchObject({ outcome: { outcome: 'saved' }, googleSync: 'requested' });
});
it('a mutation that keeps updated_at unchanged still invalidates the full revision', async () => {
  const cmd = await input(),
    before = await row();
  await db.query(`update chef_event set notes='Another writer' where id='event'`);
  expect((await row()).updated_at).toEqual(before.updated_at);
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'rejected' },
  });
});
it('elapsed lead time is checked again at confirm', async () => {
  const cmd = await input();
  Settings.now = () => Date.parse('2030-03-09T17:00Z');
  expect(await confirmScheduleEdit(fixture.container, cmd)).toMatchObject({
    outcome: { outcome: 'rejected' },
  });
});

it('loads the real HTTP routes and middleware: auth, body limit, read-only preview and recovery contract', async () => {
  const post = (action: string, body: unknown, actor: string | null = 'user') =>
    fetch(`${baseUrl}/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(actor
          ? {
              authorization: `Bearer ${jwt.sign({ actor_id: 'admin', actor_type: actor, auth_identity_id: 'fixture' }, secret)}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
  for (const action of ['preview', 'confirm', 'recover']) {
    expect((await post(action, {}, null)).status).toBe(401);
    expect((await post(action, {}, 'customer')).status).toBe(401);
  }
  expect(
    (
      await post('preview', {
        eventId: 'event',
        time: '11:00',
        extra: 'x'.repeat(7000),
      })
    ).status,
  ).toBe(413);
  const response = await post('preview', { eventId: 'event', time: '11:00' });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const p: any = await response.json();
  expect((await row()).requestedTime).toBe('10:00');
  expect((await post('recover', { reference: p.reference })).status).toBe(202);
  await confirmScheduleEdit(fixture.container, verifyReference(p.reference, 'admin', secret));
  const confirmed = await post('confirm', { reference: p.reference });
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toMatchObject({
    outcome: { outcome: 'saved' },
    googleSync: 'requested',
  });
  expect(emit).toHaveBeenCalledTimes(1);
  user.mockRejectedValue(new Error('user deleted'));
  expect((await post('recover', { reference: p.reference })).status).toBe(403);
});

it('Admin B outside the obsolete allowlist can read and prepare its own preview but cannot use A’s reference over real HTTP', async () => {
  process.env.CHEF_AI_OPENAI_API_KEY = 'fixture-never-network';
  const post = (route: string, body: unknown, actorId = 'other', actorType = 'user') => fetch(baseUrl.replace('/chef-events/schedule-edit', '') + route, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt.sign({ actor_id: actorId, actor_type: actorType, auth_identity_id: 'fixture' }, secret)}` }, body: JSON.stringify(body),
  });
  for (const actor of ['admin', 'other']) {
    const read = await post('/chef-ai/chat', { message: 'today' }, actor);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ complete: true, entries: [] });
  }
  expect((await post('/chef-ai/chat', { message: 'today' }, 'customer', 'customer')).status).toBe(401);
  expect((await fetch(baseUrl.replace('/chef-events/schedule-edit', '/chef-ai/chat'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'today' }) })).status).toBe(401);
  expect((await post('/chef-ai/chat', { message: 'today' }, 'deleted')).status).toBe(403);
  const p = await preview();
  const own = await post('/chef-events/schedule-edit/preview', { eventId: 'event', time: '12:00' });
  expect(own.status).toBe(200);
  expect(verifyReference((await own.json() as any).reference, 'other', secret).actorId).toBe('other');
  for (const action of ['confirm', 'recover'])
    expect((await post('/chef-events/schedule-edit/' + action, { reference: p.reference })).status).toBe(403);
  expect((await row()).requestedTime).toBe('10:00');
  delete process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED;
  expect((await post('/chef-events/schedule-edit/preview', { eventId: 'event', time: '12:00' })).status).toBe(403);
  listStores.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  expect((await post('/chef-ai/chat', { message: 'today' })).status).toBe(403);
});


const moveTo29 = {
  target: 'context',
  date: { kind: 'day_of_month', day: 29 },
  time: null,
  clarification: 'none',
};
async function conversationalFixture(kind: string, secondStatus?: 'pending' | 'confirmed') {
  process.env.CHEF_AI_OPENAI_API_KEY = 'fixture-never-network';
  Settings.now = () => Date.parse('2026-11-13T12:00:00Z');
  await chef.updateChefEvents({
    id: 'event',
    requestedDate: new Date('2026-11-30T16:00:00Z'),
    requestedTime: '11:00',
  });
  if (secondStatus)
    await chef.updateChefEvents({
      id: 'unselected',
      requestedDate: new Date('2026-11-30T16:00:00Z'),
      requestedTime: '11:00',
    });
  if (secondStatus === 'confirmed') {
    const bound = await chef.bindAcceptance({ eventId: 'unselected', actorId: 'admin', body: {} });
    const event = await chef.retrieveChefEvent('unselected');
    await chef.claimAcceptance({
      id: event.id,
      token: bound.id,
      updatedAt: event.updated_at,
      start: '2026-11-30T16:00:00Z',
      end: '2026-11-30T17:00:00Z',
      snapshot: { duration_minutes: 60, timezone: event.timeZone },
    });
    await chef.finalizeAcceptance({ id: event.id, token: bound.id, productId: 'fixture-ticket' });
  }
  const actor = 'chat-fixture-' + kind;
  const token = jwt.sign({ actor_id: actor, actor_type: 'user', auth_identity_id: 'fixture' }, secret);
  const backendUrl = baseUrl.replace('/admin/chef-events/schedule-edit', '');
  const sdk = new MedusaClient({
    baseUrl: backendUrl,
    auth: { type: 'jwt', jwtTokenStorageMethod: 'memory' },
  });
  await sdk.setToken(token);
  modelCall.mockResolvedValueOnce(
    modelTool('get_schedule', {
      period: 'dates',
      startDate: '2026-11-30',
      endDate: '2026-12-01',
      timeZone: 'America/New_York',
    }),
  );
  const answer = await sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
    method: 'POST',
    body: { message: 'What is on November 30 2026?' },
  });
  expect(answer.editContext?.candidates).toHaveLength(secondStatus ? 2 : 1);
  return { sdk, answer, actor, backendUrl, token };
}
it.each([true, false])(
  'actual provider/HTTP + installed SDK + shared UI state proposes Nov 29 without confirming; Sunday open=%s',
  async (open) => {
    const f = await conversationalFixture(open ? 'open' : 'closed');
    if (!open)
      await fixture.container
        .resolve<any>('availability')
        .updateAvailabilitySettings({
          id: 'chef-default',
          weekly: Object.fromEntries(
            [1, 2, 3, 4, 5, 6, 7].map((day) => [day, day === 7 ? [] : [{ start: '00:00', end: '23:59' }]]),
          ),
        });
    modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', moveTo29));
    const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message: 'Can you move it to the 29th?', context: f.answer.editContext },
    });
    expect(answer.editProposal).toEqual({
      eventId: 'event',
      date: '2026-11-29',
      expectedRevision: expect.any(String),
    });
    const payload = modelCall.mock.calls.at(-1)[0];
    expect(payload.messages.slice(1)).toEqual([{ role: 'user', content: 'Can you move it to the 29th?' }]);
    expect(JSON.stringify(payload)).not.toContain('Private Guest');
    expect(JSON.stringify(payload)).not.toContain(f.answer.editContext!.candidates[0].revision);
    const transport = createScheduleTransport({
      backendUrl: f.backendUrl,
      authType: 'jwt',
      getToken: () => f.sdk.getToken(),
    });
    const attempts = jest.spyOn(transport, 'attempt');
    const state = new ScheduleEditState(() => ({}) as Storage);
    state.bind(f.actor, transport);
    const ticket = state.beginProposal();
    await state.propose(answer.editProposal!, ticket.current);
    expect(state.snapshot().selection?.date).toBe('2026-11-29');
    expect(state.snapshot().selection?.time).toBe('');
    if (open)
      expect(state.snapshot().selection?.preview?.proposed).toMatchObject({
        date: '2026-11-29',
        time: '11:00',
        timezone: 'America/New_York',
      });
    else {
      expect(state.snapshot().selection?.preview).toBeUndefined();
      expect(state.snapshot().selection?.message).toBe(
        'That arrival time is no longer available. Please choose another time.',
      );
    }
    expect((await row()).requestedDate.toISOString()).toBe('2026-11-30T16:00:00.000Z');
    expect((await db.query('select * from chef_event_schedule_edit')).rows).toHaveLength(0);
    expect(attempts).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(modelCall).toHaveBeenCalledTimes(2);
  },
);
it.each(['pending', 'confirmed'] as const)(
  'two identical-looking events including %s require exact selection without a second model executor',
  async (status) => {
    const f = await conversationalFixture('two-' + status, status);
    modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', moveTo29));
    const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message: 'Move it to the 29th', context: f.answer.editContext },
    });
    expect(answer.editProposal).toBeUndefined();
    expect(answer.editClarification?.context.candidates).toHaveLength(2);
    const selected = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: {
        selection: {
          intent: answer.editClarification!.intent,
          context: { ...answer.editClarification!.context, selectedId: 'event' },
        },
      },
    });
    expect(selected.editProposal?.eventId).toBe('event');
    expect(selected.editProposal?.date).toBe('2026-11-29');
    expect(modelCall).toHaveBeenCalledTimes(2);
  },
);
it('HTTP rejects forged/oversized candidate context, detects stale event dates, and exposes no confirm tool', async () => {
  const f = await conversationalFixture('forged');
  for (const context of [
    { ...f.answer.editContext, selectedId: 'forged' },
    { ...f.answer.editContext, candidates: Array(21).fill(f.answer.editContext!.candidates[0]) },
  ])
    await expect(
      f.sdk.fetch('/admin/chef-ai/chat', { method: 'POST', body: { message: 'move it', context } }),
    ).rejects.toMatchObject({ status: 400 });
  await chef.updateChefEvents({ id: 'event', requestedDate: new Date('2026-12-30T16:00:00Z') });
  modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', moveTo29));
  const stale = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
    method: 'POST',
    body: { message: 'move it to the 29th', context: f.answer.editContext },
  });
  expect(stale.editProposal).toBeUndefined();
  expect(stale.message).toContain('changed');
  for (const message of ['yes', 'confirm']) {
    modelCall.mockResolvedValueOnce({
      choices: [{ finish_reason: 'stop', message: { content: 'untrusted prose' } }],
    });
    const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message },
    });
    expect(answer.editProposal).toBeUndefined();
    expect(answer.message).toContain('chat text cannot confirm');
  }
  expect((await db.query('select * from chef_event_schedule_edit')).rows).toHaveLength(0);
});
it('conversational DST-gap proposal reaches the dedicated preview and is refused without writing', async () => {
  const f = await conversationalFixture('dst');
  modelCall.mockResolvedValueOnce(
    modelTool('propose_pending_event_date_time_edit', {
      ...moveTo29,
      date: { kind: 'iso', value: '2027-03-14' },
      time: '02:30',
    }),
  );
  const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
    method: 'POST',
    body: { message: 'Move it to March 14 2027 at 02:30', context: f.answer.editContext },
  });
  expect(answer.editProposal).toMatchObject({ date: '2027-03-14', time: '02:30' });
  const transport = createScheduleTransport({
    backendUrl: f.backendUrl,
    authType: 'jwt',
    getToken: () => f.sdk.getToken(),
  });
  const state = new ScheduleEditState(() => ({}) as Storage);
  state.bind(f.actor, transport);
  const ticket = state.beginProposal();
  await state.propose(answer.editProposal!, ticket.current);
  expect(state.snapshot().selection?.message).toContain('DST gaps/folds');
  expect(state.snapshot().selection?.preview).toBeUndefined();
  expect((await db.query('select * from chef_event_schedule_edit')).rows).toHaveLength(0);
});

const timeAt2 = {
  target: 'context',
  targetDate: null,
  date: null,
  time: '14:00',
  clarification: 'none',
  continuation: false,
};
const eventOn30 = { ...timeAt2, target: 'date', targetDate: { kind: 'day_of_month', day: 30 } };
it('three exact owner prompts work through real chat/provider/SDK/preview with a retained typed 2 PM task, zero writes', async () => {
  const f = await conversationalFixture('owner-third');
  await fixture.container
    .resolve<any>('availability')
    .updateAvailabilitySettings({ id: 'chef-default', timezone: 'America/Chicago' });
  await chef.updateChefEvents({
    id: 'event',
    requestedDate: new Date('2026-11-30T17:00:00Z'),
    requestedTime: '11:00',
    timeZone: 'America/Chicago',
  });
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-13T18:00:00Z'));
  try {
    const transport = createScheduleTransport({
      backendUrl: f.backendUrl,
      authType: 'jwt',
      getToken: () => f.sdk.getToken(),
    });
    const attempt = jest.spyOn(transport, 'attempt');
    const state = new ScheduleEditState(() => ({}) as Storage);
    state.bind(f.actor, transport);
    modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', timeAt2));
    const first = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message: 'can you update the time to 2pm?' },
    });
    expect(first.message).toBe('Which event should I move to 2 PM?');
    let ticket = state.beginProposal();
    state.retainTask(first.editTask, ticket.current);
    expect(state.snapshot().task?.intent.time).toBe('14:00');
    ticket = state.beginProposal();
    modelCall.mockResolvedValueOnce(
      modelTool('propose_pending_event_date_time_edit', { ...eventOn30, time: null, continuation: true }),
    );
    const second = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message: 'this is for the event on the 30th', task: ticket.task },
    });
    expect(second.editProposal).toEqual({
      eventId: 'event',
      expectedRevision: expect.any(String),
      time: '14:00',
    });
    await state.propose(second.editProposal!, ticket.current);
    expect(state.snapshot().selection?.preview?.proposed).toMatchObject({
      date: '2026-11-30',
      time: '14:00',
      timezone: 'America/Chicago',
      instant: '2026-11-30T20:00:00.000Z',
    });
    state.close();
    ticket = state.beginProposal();
    modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', eventOn30));
    const third = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
      method: 'POST',
      body: { message: 'Can you update the event I have on the 30th to 2pm?' },
    });
    await state.propose(third.editProposal!, ticket.current);
    expect(state.snapshot().selection?.preview?.proposed.time).toBe('14:00');
    expect(attempt).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect((await row()).requestedTime).toBe('11:00');
    expect((await db.query('select * from chef_event_schedule_edit')).rows).toHaveLength(0);
    for (const [index, message] of [
      'can you update the time to 2pm?',
      'this is for the event on the 30th',
      'Can you update the event I have on the 30th to 2pm?',
    ].entries()) {
      expect(modelCall.mock.calls[index + 1][0].messages.slice(1)).toEqual([
        { role: 'user', content: message },
      ]);
      expect(JSON.stringify(modelCall.mock.calls[index + 1][0])).not.toContain('Private Guest');
    }
  } finally {
    clock.mockRestore();
  }
});
it.each(['pending', 'confirmed'] as const)(
  'date lookup counts both same-day records including %s; explicit choice re-fetches current revision',
  async (status) => {
    const f = await conversationalFixture('lookup-' + status, status);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-13T18:00:00Z'));
    try {
      modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', eventOn30));
      const result = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
        method: 'POST',
        body: { message: 'Update the event on the 30th to 2pm' },
      });
      expect(result.editProposal).toBeUndefined();
      expect(result.editClarification?.cards).toHaveLength(2);
      expect(result.editTask?.intent.time).toBe('14:00');
      await chef.updateChefEvents({
        id: 'event',
        requestedTime: '12:00',
        requestedDate: new Date('2026-11-30T17:00:00Z'),
      });
      const stale = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
        method: 'POST',
        body: {
          selection: {
            intent: result.editClarification!.intent,
            context: { ...result.editClarification!.context, selectedId: 'event' },
          },
        },
      });
      expect(stale.editProposal).toBeUndefined();
      expect(stale.message).toContain('changed');
    } finally {
      clock.mockRestore();
    }
  },
);
it('date lookup has no-match and preview policy refusal without replacing the proposed time', async () => {
  const f = await conversationalFixture('lookup-policy');
  modelCall.mockResolvedValueOnce(
    modelTool('propose_pending_event_date_time_edit', {
      ...eventOn30,
      targetDate: { kind: 'iso', value: '2026-11-28' },
    }),
  );
  const none = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
    method: 'POST',
    body: { message: 'Update event on November 28 2026 to 2pm' },
  });
  expect(none.editProposal).toBeUndefined();
  expect(none.editTask?.intent.time).toBe('14:00');
  expect(none.message).toContain('No event');
  await fixture.container
    .resolve<any>('availability')
    .updateAvailabilitySettings({
      id: 'chef-default',
      weekly: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((day) => [day, [{ start: '08:00', end: '12:00' }]]),
      ),
    });
  modelCall.mockResolvedValueOnce(
    modelTool('propose_pending_event_date_time_edit', {
      ...eventOn30,
      targetDate: { kind: 'iso', value: '2026-11-30' },
    }),
  );
  const result = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', {
    method: 'POST',
    body: { message: 'Update event on November 30 2026 to 2pm' },
  });
  const state = new ScheduleEditState(() => ({}) as Storage);
  state.bind(
    f.actor,
    createScheduleTransport({ backendUrl: f.backendUrl, authType: 'jwt', getToken: () => f.sdk.getToken() }),
  );
  const ticket = state.beginProposal();
  await state.propose(result.editProposal!, ticket.current);
  expect(state.snapshot().selection?.time).toBe('14:00');
  expect(state.snapshot().selection?.preview).toBeUndefined();
  expect(state.snapshot().selection?.message).toContain('no longer available');
  expect((await db.query('select * from chef_event_schedule_edit')).rows).toHaveLength(0);
});

it.each(['event', 'unselected'])('page B + fresh chat A requires verified choice; chosen %s preview/signature agree', async (chosen) => {
  const f = await conversationalFixture('page-conflict-' + chosen);
  await chef.updateChefEvents({ id: 'event', firstName: 'QA', lastName: 'ScheduleEdit' });
  await chef.updateChefEvents({ id: 'unselected', firstName: 'QA', lastName: 'RejectionK', requestedDate: new Date('2026-11-27T15:00:00Z'), requestedTime: '10:00' });
  const currentA = await chef.readScheduleEditEvent('event');
  const context = { candidates: [{ id: 'event', revision: currentA.revision }], observedAt: Date.now() };
  const page = { version: 1, surface: 'chef-events', view: 'detail', resource: { kind: 'private-event', id: 'unselected' } };
  const snapshot = jest.spyOn(chef, 'readScheduleEditEvent');
  modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', { ...moveTo29, date: { kind: 'day_of_month', day: 26 } }));
  const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', { method: 'POST', body: { message: 'Can you move THIS event to the 26th?', context, page } });
  expect(answer.editProposal).toBeUndefined();
  expect(answer.message).toBe('The event open on this page, or the event we just discussed?');
  expect(answer.editClarification?.targets?.map(t => [t.id, t.title])).toEqual([['unselected', 'QA RejectionK'], ['event', 'QA ScheduleEdit']]);
  expect(snapshot).toHaveBeenCalledWith('event');expect(snapshot).toHaveBeenCalledWith('unselected');
  const transport = createScheduleTransport({ backendUrl: f.backendUrl, authType: 'jwt', getToken: () => f.sdk.getToken() });
  const previewCalls = jest.spyOn(transport, 'preview'), confirmCalls = jest.spyOn(transport, 'attempt');
  const state = new ScheduleEditState(() => ({}) as Storage); state.bind(f.actor, transport);
  expect(previewCalls).not.toHaveBeenCalled();expect(confirmCalls).not.toHaveBeenCalled();
  const choice = answer.editClarification!;
  const selected = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', { method: 'POST', body: { page, selection: { intent: choice.intent, context: { ...choice.context, selectedId: chosen } } } });
  expect(selected.editProposal?.eventId).toBe(chosen);
  await state.propose(selected.editProposal!, state.beginProposal().current);
  const prepared = state.snapshot().selection!.preview!;
  expect(prepared.target.id).toBe(chosen);
  expect(prepared.target.revision).toBe(prepared.expectedRevision);
  expect(verifyReference(prepared.reference, f.actor, secret)).toMatchObject({ eventId: chosen, expectedRevision: prepared.target.revision });
  expect(confirmCalls).not.toHaveBeenCalled();
  expect((await row()).requestedTime).toBe('11:00');
  const modelPayload = modelCall.mock.calls.at(-1)[0];
  expect(modelPayload.messages.slice(1)).toEqual([{ role: 'user', content: 'Can you move THIS event to the 26th?' }]);
  expect(JSON.stringify(modelPayload)).not.toContain('QA ScheduleEdit');expect(JSON.stringify(modelPayload)).not.toContain('unselected');
  snapshot.mockRestore();
});
it.each(['confirmed', 'cancelled', 'deleted', 'missing'])('page-only %s never substitutes chat A over real HTTP', async (status) => {
  const f = await conversationalFixture('page-policy-' + status, status === 'confirmed' ? 'confirmed' : undefined);
  if (status !== 'missing' && status !== 'confirmed') await db.query('update chef_event set status=$1, deleted_at=$2 where id=$3', [status === 'deleted' ? 'pending' : status, status === 'deleted' ? new Date() : null, 'unselected']);
  modelCall.mockResolvedValueOnce(modelTool('propose_pending_event_date_time_edit', moveTo29));
  const answer = await f.sdk.fetch<ScheduleAnswer>('/admin/chef-ai/chat', { method: 'POST', body: { message: 'Move this event to the 29th', page: { version: 1, surface: 'chef-events', view: 'detail', resource: { kind: 'private-event', id: status === 'missing' ? 'missing' : 'unselected' } } } });
  expect(answer.editProposal).toBeUndefined();expect(answer.editClarification).toBeUndefined();
});
it('real chat validates incompatible page hints before provider calls and composes pending arrival prose', async () => {
  const f = await conversationalFixture('page-schema');
  expect(f.answer.presentation).toBe('answer');
  expect(f.answer.message).toContain('November 30, 2026 at 11:00 AM');
  const calls = modelCall.mock.calls.length;
  await expect(f.sdk.fetch('/admin/chef-ai/chat', { method: 'POST', body: { message: 'Move it', page: { version: 1, surface: 'menus', view: 'detail', resource: { kind: 'private-event', id: 'event' } } } })).rejects.toMatchObject({ status: 400 });
  expect(modelCall).toHaveBeenCalledTimes(calls);
});
