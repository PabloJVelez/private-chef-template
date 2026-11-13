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
const { Client } = require('@medusajs/framework/pg');
const express = require('express');
const jwt = require('jsonwebtoken');
let server: any, routesDir: string, baseUrl: string;
const secret = 'isolated-test-signing-secret-32-characters';
const databaseName = 'booking_test_schedule_' + randomUUID().replace(/-/g, '');
let admin: any, db: any, fixture: Awaited<ReturnType<typeof bookingApp>>;
let chef: ChefEventModuleService, scheduling: SchedulingModuleService;
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
  emit.mockReset().mockResolvedValue(undefined);
  user.mockReset().mockResolvedValue({ id: 'admin' });
  process.env.CHEF_AI_SCOPE = 'single_site';
  process.env.CHEF_AI_ADMIN_USER_IDS = 'admin,other';
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

it('preview is read-only, no customer data; save changes only two time fields and updated_at on the exact ID', async () => {
  const before = await row(),
    other = await chef.retrieveChefEvent('unselected');
  const p = await preview({ date: '2030-03-11', time: '11:00' });
  expect(await row()).toEqual(before);
  expect((await db.query('select * from chef_event_schedule_edit')).rows).toEqual([]);
  expect(JSON.stringify(p)).not.toMatch(/Private|private@example/);
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
it.each(['scope', 'opt-in', 'allowlist', 'deleted-user', 'customer'])(
  'denies %s at preview, confirm and recover before event access',
  async (kind) => {
    const p = await preview();
    if (kind === 'scope') process.env.CHEF_AI_SCOPE = 'multi_site';
    if (kind === 'opt-in') delete process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED;
    if (kind === 'allowlist') process.env.CHEF_AI_ADMIN_USER_IDS = '';
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
