import { randomUUID } from 'node:crypto';
import { bookingApp } from '../booking/app';
import type SchedulingModuleService from '../../src/modules/scheduling/service';
import type ChefEventModuleService from '../../src/modules/chef-event/service';
import { releaseEventReservations } from '../../src/lib/release-event-reservations';
const { Client } = require('pg');

const fixtureId = randomUUID().replace(/-/g, '');
const databaseName = `booking_test_${fixtureId}`;
let admin: any, db: any, fixture: Awaited<ReturnType<typeof bookingApp>>;
let scheduling: SchedulingModuleService, chef: ChefEventModuleService;
const eventInput = (id: string) => ({
  id,
  requestedDate: new Date('2027-01-02T10:00Z'),
  requestedTime: '10:00',
  partySize: 4,
  eventType: 'plated_dinner',
  templateProductId: 'fixture-menu',
  locationType: 'customer_location' as const,
  locationAddress: 'Fixture',
  firstName: 'Test',
  lastName: 'Guest',
  email: 'fixture@example.invalid',
  phone: '',
  notes: '',
  totalPrice: 400,
  depositPaid: false,
  specialRequirements: '',
  estimatedDuration: 60,
  timeZone: 'UTC',
});
const reservation = (id: string, start = '2027-01-02T10:00Z', end = '2027-01-02T11:00Z') => ({
  id,
  ownerId: `event-${id}`,
  attemptId: `attempt-${id}`,
  start,
  end,
});

describe('Scheduling with native Medusa modules and PostgreSQL', () => {
  beforeAll(async () => {
    const raw = process.env.BOOKING_TEST_DATABASE_URL;
    if (!raw || !['127.0.0.1', 'localhost'].includes(new URL(raw).hostname))
      throw new Error('Disposable loopback BOOKING_TEST_DATABASE_URL required');
    admin = new Client({ connectionString: raw });
    await admin.connect();
    await admin.query(`create database ${databaseName}`);
    const url = new URL(raw);
    url.pathname = `/${databaseName}`;
    fixture = await bookingApp(url.toString());
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    scheduling = fixture.container.resolve('scheduling');
    chef = fixture.container.resolve('chefEventModuleService');
  }, 30000);
  afterAll(async () => {
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

  it('propagates a real PostgreSQL read timeout instead of reporting free time', async () => {
    await db.query('begin');
    await db.query('lock table scheduling_reservation in access exclusive mode');
    try {
      await expect(scheduling.overlapping('2027-01-02T10:00Z', '2027-01-02T11:00Z')).rejects.toThrow(
        /statement timeout/,
      );
    } finally {
      await db.query('rollback');
    }
  }, 10000);
  it('stale cancellation cleanup cannot release a newer attempt on a reopened request', async () => {
    await chef.createChefEvents(eventInput('stale-cleanup'));
    const old = await chef.bindAcceptance({
      eventId: 'stale-cleanup',
      actorId: 'admin',
      body: {},
    });
    await scheduling.acquire({
      id: old.id,
      ownerId: 'stale-cleanup',
      attemptId: old.id,
      start: '2027-01-02T10:00Z',
      end: '2027-01-02T11:00Z',
    });
    await chef.cancelEvent({ id: 'stale-cleanup' });
    await scheduling.release({
      id: old.id,
      ownerId: 'stale-cleanup',
      attemptId: old.id,
    });
    await chef.completeAcceptanceCleanup('stale-cleanup', old.id);
    const list = scheduling.listAndCountReservations.bind(scheduling);
    let newer: string;
    jest.spyOn(scheduling, 'listAndCountReservations').mockImplementationOnce(async (...args) => {
      await chef.updateChefEvents({ id: 'stale-cleanup', status: 'pending' });
      const next = await chef.bindAcceptance({
        eventId: 'stale-cleanup',
        actorId: 'admin',
        requestKey: randomUUID(),
        body: {},
      });
      newer = next.id;
      await scheduling.acquire({
        id: next.id,
        ownerId: 'stale-cleanup',
        attemptId: next.id,
        start: '2027-01-02T11:00Z',
        end: '2027-01-02T12:00Z',
      });
      return list(...args);
    });
    await releaseEventReservations(fixture.container, 'stale-cleanup');
    expect((await scheduling.retrieveReservation(old.id)).state).toBe('released');
    expect((await scheduling.retrieveReservation(newer!)).state).toBe('held');
  });
  it('resolves cancellation of an unclaimed attempt before allowing a new attempt on a reopened request', async () => {
    await chef.createChefEvents(eventInput('reopened'));
    const attempt = await chef.bindAcceptance({
      eventId: 'reopened',
      actorId: 'admin',
      body: {},
    });
    await chef.cancelEvent({ id: 'reopened' });
    expect((await chef.retrieveAcceptanceAttempt(attempt.id)).state).toBe('aborted');
    // No side effects were started in this fixture; acknowledge completed cleanup explicitly.
    await chef.completeAcceptanceCleanup('reopened', attempt.id);
    await chef.updateChefEvents({ id: 'reopened', status: 'pending' });
    const next = await chef.bindAcceptance({
      eventId: 'reopened',
      actorId: 'admin',
      requestKey: randomUUID(),
      body: {},
    });
    expect(next.id).not.toBe(attempt.id);
    const event = await chef.retrieveChefEvent('reopened');
    await expect(
      chef.claimAcceptance({
        id: event.id,
        token: attempt.id,
        updatedAt: event.updated_at,
        start: '2027-01-02T10:00Z',
        end: '2027-01-02T11:00Z',
        snapshot: { duration_minutes: 60, timezone: 'UTC' },
      }),
    ).rejects.toThrow('Event changed');
  });
  it('binds an attempt to actor, event and input and rejects stale finalization', async () => {
    await chef.createChefEvents(eventInput('event'));
    const input = {
      eventId: 'event',
      actorId: 'admin',
      requestKey: randomUUID(),
      body: { sendAcceptanceEmail: false },
    };
    const attempt = await chef.bindAcceptance(input);
    expect((await chef.bindAcceptance(input)).id).toBe(attempt.id);
    await expect(chef.bindAcceptance({ ...input, body: { sendAcceptanceEmail: true } })).rejects.toThrow(
      'different input',
    );
    await expect(
      chef.bindAcceptance({
        ...input,
        requestKey: undefined,
        actorId: 'other',
      }),
    ).rejects.toThrow('another actor');
    const event = await chef.retrieveChefEvent('event');
    await chef.claimAcceptance({
      id: event.id,
      token: attempt.id,
      updatedAt: event.updated_at,
      start: '2027-01-02T10:00Z',
      end: '2027-01-02T11:00Z',
      snapshot: { duration_minutes: 60, timezone: 'UTC' },
    });
    await scheduling.acquire({
      id: attempt.id,
      ownerId: event.id,
      attemptId: attempt.id,
      start: '2027-01-02T10:00Z',
      end: '2027-01-02T11:00Z',
    });
    await expect(
      chef.finalizeAcceptance({
        id: event.id,
        token: 'stale',
        productId: 'product',
      }),
    ).rejects.toThrow('claim was lost');
    await chef.finalizeAcceptance({
      id: event.id,
      token: attempt.id,
      productId: 'product',
    });
    expect(await chef.releaseAcceptance(event.id, attempt.id)).toBe(false);
    await expect(scheduling.acquire(reservation('conflict'))).rejects.toThrow();
    // Simulate process loss after cancellation commits, before release. Authenticated recovery retries cleanup.
    await chef.cancelEvent({ id: event.id });
    expect(await scheduling.overlapping('2027-01-02T10:00Z', '2027-01-02T11:00Z')).toHaveLength(1);
    await releaseEventReservations(fixture.container, event.id);
    await releaseEventReservations(fixture.container, event.id);
    expect(await scheduling.overlapping('2027-01-02T10:00Z', '2027-01-02T11:00Z')).toHaveLength(0);
  });
  it('keeps an interrupted cleanup addressable and blocks a new attempt until release is verified', async () => {
    await chef.createChefEvents(eventInput('cleanup-retry'));
    const first = await chef.bindAcceptance({
      eventId: 'cleanup-retry',
      actorId: 'admin',
      body: {},
    });
    const event = await chef.retrieveChefEvent('cleanup-retry');
    await chef.claimAcceptance({
      id: event.id,
      token: first.id,
      updatedAt: event.updated_at,
      start: '2027-01-02T10:00Z',
      end: '2027-01-02T11:00Z',
      snapshot: { duration_minutes: 60, timezone: 'UTC' },
    });
    await scheduling.acquire({
      id: first.id,
      ownerId: event.id,
      attemptId: first.id,
      start: '2027-01-02T10:00Z',
      end: '2027-01-02T11:00Z',
    });
    await chef.releaseAcceptance(event.id, first.id);
    const next = {
      eventId: event.id,
      actorId: 'admin',
      requestKey: randomUUID(),
      body: {},
    };
    await expect(chef.bindAcceptance(next)).rejects.toThrow('finish cleanup');
    expect((await chef.retrieveChefEvent(event.id)).acceptanceExecution).toBe(first.id);
    // Simulate successful owned commerce cleanup followed by retried reservation release.
    await scheduling.release({
      id: first.id,
      ownerId: event.id,
      attemptId: first.id,
    });
    await chef.completeAcceptanceCleanup(event.id, first.id);
    const second = await chef.bindAcceptance(next);
    expect(second.id).not.toBe(first.id);
    expect(await scheduling.overlapping('2027-01-02T10:00Z', '2027-01-02T11:00Z')).toHaveLength(0);
  });
});
