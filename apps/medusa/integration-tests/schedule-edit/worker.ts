/** Production-style Redis workflow engine; only task-owned loopback fixtures, no providers. */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyReference } from '../../src/lib/private-event-schedule/contract';
import { Settings } from 'luxon';
import { asValue } from '@medusajs/framework/awilix';
import { MedusaApp, MedusaAppMigrateUp } from '@medusajs/framework/modules-sdk';
import { createMedusaContainer, Modules } from '@medusajs/framework/utils';
import { previewScheduleEdit } from '../../src/lib/private-event-schedule/command';
import { scheduleEditHandler } from '../../src/lib/private-event-schedule/http';
import type ChefEventModuleService from '../../src/modules/chef-event/service';

async function main() {
  const database = process.env.BOOKING_TEST_DATABASE_URL!,
    redis = process.env.BOOKING_TEST_REDIS_URL!;
  if (process.env.NODE_ENV === 'test') throw new Error('Durability fixture must not use the test engine');
  for (const url of [database, redis])
    if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
      throw new Error('Loopback fixtures required');
  if (!new URL(database).pathname.startsWith('/booking_test_'))
    throw new Error('Task-owned database required');
  process.env.CHEF_AI_SCOPE = 'single_site';
  process.env.CHEF_AI_ADMIN_USER_IDS = 'admin';
  process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED = 'true';
  Settings.now = () => Date.parse('2030-02-01T00:00:00Z');
  const container = createMedusaContainer();
  container.register('logger', asValue({ ...console, debug() {}, info() {} }));
  const custom = (name: string) => ({
    resolve: path.resolve(__dirname, '../../src/modules', name),
  });
  const options = {
    sharedContainer: container,
    sharedResourcesConfig: { database: { clientUrl: database } },
    modulesConfig: {
      chefEventModuleService: custom('chef-event'),
      availability: custom('availability'),
      experienceTypeModuleService: custom('experience-type'),
      scheduling: custom('scheduling'),
      [Modules.WORKFLOW_ENGINE]: {
        resolve: '@medusajs/medusa/workflow-engine-redis',
        options: {
          redis: {
            redisUrl: redis,
            queueName: new URL(database).pathname.slice(1),
            jobQueueName: new URL(database).pathname.slice(1) + '-jobs',
          },
        },
      },
    },
  };
  if (process.argv[2] === 'migrate') {
    await MedusaAppMigrateUp(options);
    return;
  }
  const app = await MedusaApp(options);
  for (const [key, value] of Object.entries(app.modules)) container.register(key, asValue(value));
  const secret = 'isolated-test-signing-secret-32-characters';
  container.register('configModule', asValue({ projectConfig: { http: { jwtSecret: secret } } }));
  container.register(Modules.USER, asValue({ retrieveUser: async () => ({ id: 'admin' }) }));
  container.register(
    Modules.EVENT_BUS,
    asValue({
      emit: async (value: unknown) => {
        process.send?.({ type: 'dispatch', value });
      },
      releaseGroupedEvents: async () => {},
      clearGroupedEvents: async () => {},
    }),
  );
  const chef = container.resolve<ChefEventModuleService>('chefEventModuleService');
  const eventId =
    process.argv[2] === 'seed'
      ? randomUUID()
      : verifyReference(process.env.SCHEDULE_REFERENCE!, 'admin', secret).eventId;
  if (process.argv[2] === 'seed') {
    if (
      !(await container.resolve<any>('availability').listAvailabilitySettings({ id: 'chef-default' })).length
    )
      await container.resolve<any>('availability').createAvailabilitySettings({
        id: 'chef-default',
        timezone: 'UTC',
        weekly: Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7].map((day) => [day, [{ start: '00:00', end: '23:59' }]]),
        ),
        overrides: {},
        google_mode: 'internal_only',
      });
    if (
      !(await container.resolve<any>('experienceTypeModuleService').listExperienceTypes({ id: 'experience' }))
        .length
    )
      await container.resolve<any>('experienceTypeModuleService').createExperienceTypes({
        id: 'experience',
        name: 'Dinner',
        slug: 'dinner',
        highlights: [],
        available_time_slots: [],
        description: '',
        is_active: true,
        duration_minutes: 60,
      });
    await chef.createChefEvents({
      id: eventId,
      requestedDate: new Date('2030-03-09T10:00Z'),
      requestedTime: '10:00',
      partySize: 4,
      eventType: 'Dinner',
      experience_type_id: 'experience',
      templateProductId: 'menu',
      locationType: 'customer_location',
      locationAddress: '',
      firstName: 'Fixture',
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
    const preview = await previewScheduleEdit(container, 'admin', { eventId, time: '11:00' }, secret);
    process.send?.({ type: 'preview', preview });
  } else if (process.argv[2] === 'execution-boundary') {
    const { verifyExecutionBoundary } = require('./execution-boundary');
    await verifyExecutionBoundary(container, process.env.SCHEDULE_REFERENCE!, secret);
  } else {
    if (process.argv[2] === 'later-edit')
      await chef.updateChefEvents({
        id: eventId,
        requestedTime: '12:00',
        requestedDate: new Date('2030-03-09T12:00Z'),
      });
    if (process.env.SCHEDULE_CRASH === 'committed') {
      const original = chef.editPendingSchedule.bind(chef);
      chef.editPendingSchedule = async (...args) => {
        const receipt = await original(...args); // real transaction has committed, workflow has no step response
        process.send?.({ type: 'committed', receipt });
        await new Promise(() => {});
        return receipt;
      };
    }
    if (process.env.SCHEDULE_CRASH === 'dispatched') {
      chef.finishScheduleEditDispatch = async () => {
        process.send?.({ type: 'dispatched' });
        await new Promise(() => {});
      };
    }
    if (process.env.SCHEDULE_EXPIRED === 'true') {
      const now = Date.now();
      Date.now = () => now + 10 * 60_000;
    }
    const action = process.argv[2] === 'confirm' ? 'confirm' : 'recover';
    const res: any = {
      code: 200,
      setHeader() {},
      status(code: number) {
        this.code = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    await scheduleEditHandler(action)(
      {
        scope: container,
        body: { reference: process.env.SCHEDULE_REFERENCE },
        auth_context: { actor_id: 'admin', actor_type: 'user' },
      } as any,
      res,
    );
    const event = await chef.retrieveChefEvent(eventId);
    process.send?.({
      type: 'result',
      code: res.code,
      body: res.body,
      time: event.requestedTime,
    });
  }
  await app.onApplicationPrepareShutdown();
  await app.onApplicationShutdown();
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
