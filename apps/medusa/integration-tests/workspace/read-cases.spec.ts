import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { asValue } from '@medusajs/framework/awilix';
import { bookingApp } from '../booking/app';
import { ApiLoader } from '@medusajs/framework/http';
import { configManager } from '@medusajs/framework/config';
import type ChefEventModuleService from '../../src/modules/chef-event/service';
import type SchedulingModuleService from '../../src/modules/scheduling/service';
import { readCalendar, readRequests } from '../../src/lib/chef-workspace/read';
import { parseQuery, requestQuery } from '../../src/lib/chef-workspace/query';

const { Client } = require('@medusajs/framework/pg');
const express = require('express');
const jwt = require('jsonwebtoken');
const databaseName = 'booking_test_workspace_' + randomUUID().replace(/-/g, '');
let admin: any, db: any, server: any, baseUrl: string, routesDir: string;
let fixture: Awaited<ReturnType<typeof bookingApp>>;
let chef: ChefEventModuleService, scheduling: SchedulingModuleService;
const jwtSecret = randomUUID();
const range = { start: '2027-03-14T06:00:00Z', end: '2027-03-15T05:00:00Z' };
const input = (id: string, start = range.start, duration = 60) => ({
  id,
  requestedDate: new Date(start),
  requestedTime: '00:00',
  partySize: 4,
  eventType: 'plated_dinner',
  templateProductId: 'fixture-menu',
  locationType: 'customer_location' as const,
  locationAddress: 'private address',
  firstName: 'Test',
  lastName: 'Guest',
  email: 'private@example.invalid',
  phone: 'private phone',
  notes: 'private notes',
  totalPrice: 400,
  depositPaid: false,
  specialRequirements: 'private diet',
  estimatedDuration: duration,
  timeZone: 'America/Chicago',
});
const get = (route: string, query: object = {}, actor: string | null = 'user') =>
  fetch(`${baseUrl}/admin/chef-workspace/${route}?${new URLSearchParams(query as Record<string, string>)}`, {
    headers: actor
      ? {
          authorization: `Bearer ${jwt.sign({ actor_id: 'fixture', actor_type: actor, auth_identity_id: 'fixture' }, jwtSecret)}`,
        }
      : {},
  });

describe('Workspace reads through Medusa modules, PostgreSQL and authenticated HTTP', () => {
  beforeAll(async () => {
    const raw = process.env.BOOKING_TEST_DATABASE_URL;
    if (!raw || !['127.0.0.1', 'localhost'].includes(new URL(raw).hostname))
      throw new Error('Task-owned loopback BOOKING_TEST_DATABASE_URL required');
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
    const config = configManager.loadConfig({
      baseDir: process.cwd(),
      projectConfig: {
        projectConfig: {
          http: {
            jwtSecret,
            cookieSecret: jwtSecret,
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
    // Load the actual route exports through Medusa's real route/auth loader, without
    // unrelated providers or jobs. Wrappers preserve the production /admin paths.
    routesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-routes-'));
    for (const route of ['requests', 'calendar']) {
      const dir = path.join(routesDir, 'admin/chef-workspace', route);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'route.js'),
        `module.exports = require(${JSON.stringify(path.resolve(__dirname, '../../src/api/admin/chef-workspace', route, 'route.ts'))})`,
      );
    }
    await new ApiLoader({ app, sourceDir: routesDir, container: fixture.container }).load();
    server = await new Promise<any>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 30000);
  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (routesDir) fs.rmSync(routesDir, { recursive: true, force: true });
    await fixture?.close();
    await db?.end();
    if (admin) {
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.query('truncate scheduling_reservation, chef_event_acceptance_attempt, chef_event');
  });

  it('rejects anonymous and customer reads and validates bounds before access', async () => {
    for (const route of ['requests', 'calendar']) {
      expect((await get(route, range, null)).status).toBe(401);
      expect((await get(route, range, 'customer')).status).toBe(401);
    }
    for (const query of [
      { limit: -1 },
      { limit: 101 },
      { limit: 1.5 },
      { offset: -2 },
      { limit: '20junk' },
      { statuses: 'unknown' },
    ])
      expect((await get('requests', query)).status).toBe(400);
    for (const query of [
      {},
      { start: range.end, end: range.start },
      { start: range.start, end: '2028-01-01T00:00:00Z' },
    ])
      expect((await get('calendar', query)).status).toBe(400);
    expect((await get('calendar', range)).status).toBe(200);
  });

  it('includes crossing intervals, excludes touching ends, preserves display/appointment/protection distinctions', async () => {
    await chef.createChefEvents([
      input('crossing', '2027-03-14T04:00:00Z', 180),
      input('touch-before', '2027-03-14T05:00:00Z', 60),
      input('inside', '2027-03-14T07:30:00Z'),
      input('touch-after', range.end),
      input('confirmed', '2027-03-14T10:00:00Z'),
      { ...input('cancelled'), status: 'cancelled' },
      input('completed'),
    ]);
    // Exercise the existing guarded transition to construct accepted fixtures.
    for (const id of ['confirmed', 'completed']) {
      const attempt = await chef.bindAcceptance({ eventId: id, actorId: 'fixture', body: {} });
      const event = await chef.retrieveChefEvent(id);
      await chef.claimAcceptance({
        id,
        token: attempt.id,
        updatedAt: event.updated_at,
        start: range.start,
        end: range.end,
        snapshot: { duration_minutes: 60, timezone: 'America/Chicago' },
      });
      await chef.finalizeAcceptance({ id, token: attempt.id, productId: 'fixture-product-' + id });
      if (id === 'completed') await chef.updateChefEvents({ id, status: 'completed' });
    }
    await scheduling.acquire({
      id: 'held',
      ownerId: 'inside',
      attemptId: 'a',
      start: '2027-03-14T07:00:00Z',
      end: '2027-03-14T09:00:00Z',
    });
    const before = await db.query('select to_jsonb(e) as row from chef_event e order by id');
    const beforeAttempts = await db.query('select to_jsonb(a) as row from chef_event_acceptance_attempt a order by id');
    const beforeReservations = await db.query('select to_jsonb(r) as row from scheduling_reservation r');
    const response = await get('calendar', range);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.complete).toBe(true);
    expect(body.entries.map((e: any) => e.source.id)).toEqual([
      'crossing',
      'cancelled',
      'completed',
      'inside',
      'confirmed',
    ]);
    const pending = body.entries.find((e: any) => e.source.id === 'inside');
    expect(pending).toMatchObject({
      id: 'private-event:inside',
      detailPath: '/chef-events/inside',
      appointmentTime: null,
      displayTime: { start: '2027-03-14T07:30:00.000Z' },
      protectedTime: [{ state: 'held', start: '2027-03-14T07:00:00.000Z', end: '2027-03-14T09:00:00.000Z' }],
    });
    expect(body.entries.find((e: any) => e.source.id === 'confirmed')).toMatchObject({
      appointmentTime: { start: '2027-03-14T10:00:00.000Z' },
      protectedTime: [],
    });
    const json = JSON.stringify(body);
    for (const field of [
      'email',
      'phone',
      'notes',
      'locationAddress',
      'specialRequirements',
      'totalPrice',
      'acceptanceToken',
      'private address',
      'private diet',
    ])
      expect(json).not.toContain(field);
    expect((await db.query('select to_jsonb(e) as row from chef_event e order by id')).rows).toEqual(before.rows);
    expect((await db.query('select to_jsonb(r) as row from scheduling_reservation r')).rows).toEqual(
      beforeReservations.rows,
    );
    expect((await db.query('select to_jsonb(a) as row from chef_event_acceptance_attempt a order by id')).rows).toEqual(
      beforeAttempts.rows,
    );
    expect(
      (await (await get('calendar', { ...range, statuses: 'confirmed,completed', status: 'pending' })).json()).entries,
    ).toHaveLength(2);
    await scheduling.release({ id: 'held', ownerId: 'inside', attemptId: 'a' });
    expect(
      (await readCalendar(fixture.container, range)).entries.find((e) => e.source.id === 'inside')!.protectedTime,
    ).toEqual([]);
  });

  async function many(count: number) {
    for (let offset = 0; offset < count; offset += 250) {
      await chef.createChefEvents(
        Array.from({ length: Math.min(250, count - offset) }, (_, index) =>
          input(`event-${String(offset + index).padStart(5, '0')}`),
        ),
      );
    }
  }
  it('paginates tied timestamps beyond 1000 without gaps and returns the whole bounded calendar', async () => {
    await many(1005);
    const ids: string[] = [];
    for (let offset = 0; offset < 1005; offset += 100) {
      const response = await get('requests', { limit: 100, offset });
      expect(response.status).toBe(200);
      const page = await response.json();
      expect(page.count).toBe(1005);
      ids.push(...page.items.map((item: any) => item.id));
    }
    expect(new Set(ids).size).toBe(1005);
    expect(ids).toEqual([...ids].sort());
    const calendar = await readCalendar(fixture.container, range);
    expect(calendar.complete).toBe(true);
    expect(calendar.entries).toHaveLength(1005);
    expect(
      (await readRequests(fixture.container, parseQuery(requestQuery, { limit: 100, offset: 1100 }))).items,
    ).toEqual([]);
    const search = await readRequests(
      fixture.container,
      parseQuery(requestQuery, { q: 'Test', locationType: 'customer_location' }),
    );
    expect(search.count).toBe(1005);
    expect((await readRequests(fixture.container, parseQuery(requestQuery, { q: '%' }))).count).toBe(0);
    expect((await readCalendar(fixture.container, { ...range, q: '%' })).entries).toEqual([]);
  }, 30000);

  it('reports oversized ranges as incomplete, never a silently truncated first page', async () => {
    await many(5001);
    expect(await readCalendar(fixture.container, range)).toMatchObject({ complete: false, entries: [] });
  }, 30000);
  it('returns an empty complete range and propagates real database timeout failures', async () => {
    expect(await readCalendar(fixture.container, range)).toMatchObject({ complete: true, entries: [] });
    await db.query('begin');
    await db.query('lock table chef_event in access exclusive mode');
    try {
      const response = await get('calendar', range);
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty('entries');
    } finally {
      await db.query('rollback');
    }
  }, 10000);
});
