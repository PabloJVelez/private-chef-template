/** Child-process fixture: real Medusa 2.7 Redis engine, no application providers. */
import path from 'node:path';
import { DateTime } from 'luxon';
import { MedusaApp, MedusaAppMigrateUp } from '@medusajs/framework/modules-sdk';
import { createMedusaContainer, Modules, MedusaError } from '@medusajs/framework/utils';
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk';
import {
  eventProductExecution,
  recoverEventProduct,
  withEventProductLock,
  eventProductWorkflow,
  bookingStepConfig,
} from '../../src/lib/booking-execution';
import { asValue } from 'awilix';

async function main() {
  const database = process.env.BOOKING_TEST_DATABASE_URL!;
  const redis = process.env.BOOKING_TEST_REDIS_URL!;
  for (const value of [database, redis]) {
    if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname))
      throw new Error('Fixtures require loopback targets');
  }
  const container = createMedusaContainer();
  container.register('logger', asValue({ ...console, debug() {}, info() {} }));
  const options = {
    sharedContainer: container,
    sharedResourcesConfig: { database: { clientUrl: database } },
    modulesConfig: {
      chefEventModuleService: {
        resolve: path.resolve(__dirname, '../../src/modules/chef-event'),
      },
      availability: {
        resolve: path.resolve(__dirname, '../../src/modules/availability'),
      },
      experienceTypeModuleService: {
        resolve: path.resolve(__dirname, '../../src/modules/experience-type'),
      },
      scheduling: {
        resolve: path.resolve(__dirname, '../../src/modules/scheduling'),
      },
      [Modules.FULFILLMENT]: { resolve: '@medusajs/medusa/fulfillment' },
      [Modules.STORE]: { resolve: '@medusajs/medusa/store' },
      [Modules.REGION]: { resolve: '@medusajs/medusa/region' },
      [Modules.PRODUCT]: { resolve: '@medusajs/medusa/product' },
      [Modules.INVENTORY]: { resolve: '@medusajs/medusa/inventory' },
      [Modules.PRICING]: { resolve: '@medusajs/medusa/pricing' },
      [Modules.STOCK_LOCATION]: { resolve: '@medusajs/medusa/stock-location' },
      [Modules.SALES_CHANNEL]: { resolve: '@medusajs/medusa/sales-channel' },
      [Modules.LOCKING]: {
        resolve: '@medusajs/medusa/locking',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/locking-postgres',
              id: 'proof-locks',
              is_default: true,
            },
          ],
        },
      },
      [Modules.WORKFLOW_ENGINE]: {
        resolve: '@medusajs/medusa/workflow-engine-redis',
        options: {
          redis: { url: redis },
          queueName:
            new URL(database).pathname.slice(1) + '-' + (process.env.BOOKING_EXECUTION_ID || 'setup'),
          jobQueueName:
            new URL(database).pathname.slice(1) +
            '-' +
            (process.env.BOOKING_EXECUTION_ID || 'setup') +
            '-jobs',
        },
      },
    },
  };
  if (process.argv[2] === 'migrate') {
    await MedusaAppMigrateUp(options);
    process.exit(0);
  }
  const app = await MedusaApp(options);
  for (const [key, service] of Object.entries(app.modules)) container.register(key, asValue(service));
  container.register('remoteQuery', asValue(app.query));
  container.register('query', asValue(app.query));
  const planner = app.linkMigrationExecutionPlanner();
  const plan = await planner.createPlan();
  if (plan.some((action) => action.action === 'delete'))
    throw new Error('Fixture must not delete preexisting links');
  await planner.executePlan(plan);
  container.register('link', asValue(app.link));
  container.register(
    Modules.EVENT_BUS,
    asValue({
      emit: async () => {},
      releaseGroupedEvents: async () => {},
      clearGroupedEvents: async () => {},
    }),
  );
  if (process.env.BOOKING_MODE === 'acceptance') {
    if (process.env.BOOKING_NORMAL_RETRIES !== 'true') {
      bookingStepConfig.retryIntervalAwaiting = 1;
      bookingStepConfig.retryInterval = 1;
      if (process.env.BOOKING_FAIL) bookingStepConfig.maxRetries = 0;
    }
    const { runEventAcceptance } = require('../../src/lib/run-event-acceptance');
    const chef = container.resolve<any>('chefEventModuleService');
    const scheduling = container.resolve<any>('scheduling');
    const eventId = process.env.BOOKING_EXECUTION_ID!;
    if (process.argv[2] === 'seed') {
      const availability = container.resolve<any>('availability');
      if (!(await availability.listAvailabilitySettings({ id: 'chef-default' })).length)
        await availability.createAvailabilitySettings({
          id: 'chef-default',
          timezone: 'UTC',
          weekly: Object.fromEntries(
            [1, 2, 3, 4, 5, 6, 7].map((day) => [day, [{ start: '00:00', end: '23:59' }]]),
          ),
          overrides: {},
          notice_rules: [],
          google_mode: 'internal_only',
        });
      const experiences = container.resolve<any>('experienceTypeModuleService');
      const experienceId =
        process.env.BOOKING_POLICY === 'inactive' ? `inactive-${eventId}` : 'proof-experience';
      if (!(await experiences.listExperienceTypes({ id: experienceId })).length)
        await experiences.createExperienceTypes({
          id: experienceId,
          is_active: process.env.BOOKING_POLICY !== 'inactive',
          name: 'Dinner',
          slug: experienceId,
          description: 'Fixture',
          highlights: [],
          available_time_slots: [],
          duration_minutes: 60,
          requires_advance_notice: false,
        });
      const sales = container.resolve<any>(Modules.SALES_CHANNEL);
      if (!(await sales.listSalesChannels({ name: 'Default Sales Channel' })).length)
        await sales.createSalesChannels({ name: 'Default Sales Channel' });
      const fulfillment = container.resolve<any>(Modules.FULFILLMENT);
      if (!(await fulfillment.listShippingProfiles({ name: 'Digital Products' })).length)
        await fulfillment.createShippingProfiles({
          name: 'Digital Products',
          type: 'digital',
        });
      const locations = container.resolve<any>(Modules.STOCK_LOCATION);
      if (!(await locations.listStockLocations({ name: 'Digital Location' })).length)
        await locations.createStockLocations({ name: 'Digital Location' });
      const seeded = await chef.createChefEvents({
        ...(process.env.BOOKING_GENERATED_ID === 'true' ? {} : { id: eventId }),
        requestedDate: DateTime.utc()
          .plus({ days: Number(process.env.BOOKING_DAY || 50) })
          .startOf('day')
          .set({ hour: 10 })
          .toJSDate(),
        requestedTime: process.env.BOOKING_POLICY === 'timezone' ? '11:00' : '10:00',
        partySize: 4,
        eventType: process.env.BOOKING_PUNCTUATION ? 'Dinner / & -- Party!' : 'Dinner',
        experience_type_id: process.env.BOOKING_POLICY === 'missing' ? null : experienceId,
        templateProductId: 'fixture-menu',
        locationType: 'customer_location',
        locationAddress: 'Fixture',
        firstName: process.env.BOOKING_PUNCTUATION ? 'Éva --' : 'Fixture',
        lastName: 'Guest',
        email: 'fixture@example.invalid',
        phone: '',
        notes: '',
        totalPrice: 400,
        specialRequirements: '',
        estimatedDuration: 60,
        timeZone: 'UTC',
      });
      if (process.env.BOOKING_POLICY === 'conflict')
        await scheduling.acquire({
          id: `conflict-${seeded.id}`,
          ownerId: `other-${seeded.id}`,
          attemptId: `other-${seeded.id}`,
          start: new Date(seeded.requestedDate).toISOString(),
          end: new Date(new Date(seeded.requestedDate).getTime() + 3600000).toISOString(),
        });
      console.log(JSON.stringify({ seededEventId: seeded.id }));
      process.exit(0);
    }
    let startedAt = 0;
    let finalizedMs: number | undefined;
    const finalize = chef.finalizeAcceptance.bind(chef);
    chef.finalizeAcceptance = async (...args: unknown[]) => {
      const event = await finalize(...args);
      finalizedMs = performance.now() - startedAt;
      if (process.env.BOOKING_CRASH === 'finalized') {
        process.send?.({ type: 'finalized', id: event.id });
        await new Promise(() => {});
      }
      return event;
    };
    if (process.env.BOOKING_FAIL === 'inventory')
      container.resolve<any>(Modules.INVENTORY).updateInventoryItems = async () => {
        throw new Error('Fixture inventory failure');
      };
    if (process.env.BOOKING_FAIL === 'after-acquire') {
      const fulfillment = container.resolve<any>(Modules.FULFILLMENT);
      const list = fulfillment.listShippingProfiles.bind(fulfillment);
      fulfillment.listShippingProfiles = async () => {
        if (process.env.BOOKING_RETRY_IN_PROCESS === 'true') fulfillment.listShippingProfiles = list;
        throw new Error('Fixture failure after acquisition');
      };
    }
    const notifications: string[] = [];
    container.register(
      Modules.EVENT_BUS,
      asValue({
        emit: async (messages: Array<{ name: string }>) => {
          for (const message of messages)
            if (message.name === 'chef-event.accepted' || message.name === 'google-calendar.sync-requested') {
              if (process.env.BOOKING_FAIL === 'notification')
                throw new Error('Fixture notification failure');
              notifications.push(message.name);
            }
        },
        releaseGroupedEvents: async () => {},
        clearGroupedEvents: async () => {},
      }),
    );
    await app.onApplicationStart();
    if (process.env.BOOKING_FAIL === 'release')
      scheduling.release = async () => {
        throw new Error('Fixture release interrupted');
      };
    let productCreateCalls = 0;
    const productService = container.resolve<any>(Modules.PRODUCT);
    const createProduct = productService.createProducts.bind(productService);
    productService.createProducts = async (...args: any[]) => {
      productCreateCalls++;
      // Inject invalid native input, not a mocked Product result/error.
      if (process.env.BOOKING_FAIL === 'product-validation') args[0][0].handle = 'INVALID handle';
      return createProduct(...args);
    };
    if (process.env.BOOKING_ACTION === 'seed-legacy-attempt') {
      // Reproduce pre-fix persisted input using only native commands/run, never checkpoint edits.
      const attempt = await chef.bindAcceptance({
        eventId,
        actorId: 'fixture-admin',
        requestKey: process.env.BOOKING_REQUEST_ID,
        body: { acceptedBy: 'chef', sendAcceptanceEmail: false },
      });
      const event = await chef.retrieveChefEvent(eventId);
      const start = new Date(event.requestedDate).toISOString();
      const end = new Date(new Date(start).getTime() + 3600000).toISOString();
      await chef.claimAcceptance({
        id: eventId,
        token: attempt.id,
        updatedAt: event.updated_at,
        start,
        end,
        snapshot: { duration_minutes: 60, timezone: 'UTC' },
      });
      await scheduling.acquire({ id: attempt.id, ownerId: eventId, attemptId: attempt.id, start, end });
      const flow = eventProductWorkflow(container);
      const old = await flow.run({
        context: { transactionId: eventProductExecution(attempt.id) },
        throwOnError: false,
        input: {
          eventId,
          attemptId: attempt.id,
          products: [
            {
              title: 'Legacy fixture ticket',
              handle: `event-dinner-fixture-guest-${start.slice(0, 10)}-${eventId}`,
              status: 'draft',
              options: [{ title: 'Ticket Type', values: ['Event Ticket'] }],
              external_id: eventProductExecution(attempt.id),
              metadata: { acceptance_attempt: attempt.id, chef_event_id: eventId },
            },
          ],
        },
      });
      process.send?.({
        type: 'legacy',
        state: old.transaction.getState(),
        errors: old.errors,
        productCreateCalls,
      });
      await app.onApplicationPrepareShutdown();
      await app.onApplicationShutdown();
      process.exit(0);
    }
    if (process.env.BOOKING_ACTION === 'reschedule') {
      const { updateChefEventWorkflow } = require('../../src/workflows/update-chef-event');
      await updateChefEventWorkflow(container).run({
        input: {
          id: eventId,
          requestedDate: DateTime.utc().plus({ days: 62 }).toISODate(),
          requestedTime: '10:00',
        },
      });
      process.send?.({ type: 'rescheduled' });
      await app.onApplicationPrepareShutdown();
      await app.onApplicationShutdown();
      process.exit(0);
    }
    if (process.env.BOOKING_ACTION?.startsWith('route')) {
      let blocker: any;
      if (process.env.BOOKING_FAIL === 'availability-db') {
        const { Client } = require('pg');
        blocker = new Client({ connectionString: database });
        await blocker.connect();
        await blocker.query('begin');
        await blocker.query('lock table scheduling_reservation in access exclusive mode');
        // Real PostgreSQL timeout before acquisition, kept shorter than the native retry interval.
        // Scheduling's own five-second timeout is separately covered by the Scheduling suite.
        scheduling.overlapping = async () => {
          const reader = new Client({ connectionString: database });
          await reader.connect();
          try {
            await reader.query("set statement_timeout = '100ms'");
            return (await reader.query('select id from scheduling_reservation')).rows;
          } finally {
            await reader.end();
          }
        };
      }
      if (process.env.BOOKING_FAIL === 'unrelated-not-allowed')
        scheduling.overlapping = async () => {
          throw new MedusaError(MedusaError.Types.NOT_ALLOWED, 'Fixture database authorization error');
        };
      if (process.env.BOOKING_POLICY === 'unconfigured')
        container.resolve<any>('availability').listAvailabilitySettings = async () => [];

      const recovery = process.env.BOOKING_ACTION !== 'route';
      const { POST } = recovery
        ? require('../../src/api/admin/chef-events/[id]/acceptance/recover/route')
        : require('../../src/api/admin/chef-events/[id]/accept/route');
      let status = 200;
      let body: unknown;
      startedAt = performance.now();
      const invokeRoute = () =>
        POST(
          {
            scope: container,
            params: { id: eventId },
            auth_context: { actor_id: 'fixture-admin' },
            body: recovery
              ? { action: process.env.BOOKING_ACTION === 'route-abort' ? 'abort' : 'resume' }
              : { attemptId: process.env.BOOKING_REQUEST_ID, sendAcceptanceEmail: false },
          },
          {
            status(code: number) {
              status = code;
              return this;
            },
            json(value: unknown) {
              body = value;
            },
          },
        );
      await invokeRoute();
      const elapsedMs = performance.now() - startedAt;
      if (process.env.BOOKING_RETRY_IN_PROCESS === 'true') {
        process.send?.({
          type: 'pending',
          status,
          body,
          reservations: await scheduling.listReservations({ owner_id: eventId }),
        });
        // Observe the actual scheduled native retry without killing its worker during execution.
        const { acceptChefEventWorkflow } = require('../../src/workflows/accept-chef-event');
        const event = await chef.retrieveChefEvent(eventId);
        let finished = false;
        for (let check = 0; check < 100; check++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const transaction = await acceptChefEventWorkflow(container).getRunningTransaction(
            event.acceptanceExecution,
          );
          if (transaction?.hasFinished()) {
            finished = true;
            break;
          }
        }
        if (!finished) throw new Error('Native retry did not finish within the fixture observation bound');
        await invokeRoute();
      }
      if (blocker) {
        await blocker.query('rollback');
        await blocker.end();
      }
      const event = await chef.retrieveChefEvent(eventId);
      const attempt = await chef.retrieveAcceptanceAttempt(event.acceptanceExecution);
      const child = await eventProductWorkflow(container)
        .getRunningTransaction(eventProductExecution(attempt.id))
        .catch((error: { type?: string }) => {
          if (error.type === 'not_found') return null;
          throw error;
        });
      process.send?.({
        type: 'route',
        status,
        body,
        elapsedMs,
        finalizedMs,
        productCreateCalls,
        eventStatus: event.status,
        attempt,
        products: await container
          .resolve<any>(Modules.PRODUCT)
          .listProducts({ external_id: eventProductExecution(attempt.id) }),
        reservations: await scheduling.listReservations({ owner_id: eventId }),
        conflicts: await scheduling.listReservations({ owner_id: `other-${eventId}` }),
        childState: child?.getState(),
        childInput: child?.getContext().payload,
      });
      await app.onApplicationPrepareShutdown();
      await app.onApplicationShutdown();
      process.exit(0);
    }
    const attempt = await chef.bindAcceptance({
      eventId,
      actorId: 'fixture-admin',
      requestKey: eventId,
      body: { sendAcceptanceEmail: false },
    });
    if (process.env.BOOKING_ACTION === 'abort') {
      if (process.env.BOOKING_FAIL === 'release')
        scheduling.release = async () => {
          throw new Error('Fixture release interrupted');
        };
      const { abortEventAcceptance } = require('../../src/lib/abort-event-acceptance');
      await abortEventAcceptance(container, eventId, attempt.id);
      process.send?.({
        type: 'aborted',
        reservations: await scheduling.listReservations({ owner_id: eventId }),
        products: await container
          .resolve<any>(Modules.PRODUCT)
          .listProducts({ external_id: eventProductExecution(attempt.id) }),
      });
      await app.onApplicationPrepareShutdown();
      await app.onApplicationShutdown();
      process.exit(0);
    }
    const result = await runEventAcceptance(
      container,
      {
        chefEventId: eventId,
        attemptId: attempt.id,
        sendAcceptanceEmail: false,
      },
      process.env.BOOKING_ACTION === 'recover' ? `recover-${attempt.id}-fixture` : attempt.id,
    );
    const event = await chef.retrieveChefEvent(eventId);
    process.send?.({
      type: 'result',
      state: result.transaction.getState(),
      result: result.result,
      errors: result.errors,
      eventStatus: event.status,
      productId: event.productId,
      products: await container
        .resolve<any>(Modules.PRODUCT)
        .listProducts({ external_id: eventProductExecution(attempt.id) }),
      notifications,
      reservations: await scheduling.listReservations({ owner_id: eventId }),
    });
    await app.onApplicationPrepareShutdown();
    await app.onApplicationShutdown();
    process.exit(0);
  }
  if (process.env.BOOKING_MODE === 'product') {
    const attemptId = process.env.BOOKING_EXECUTION_ID!;
    const productService = container.resolve<any>(Modules.PRODUCT);
    const create = productService.createProducts.bind(productService);
    productService.createProducts = async (...args: unknown[]) => {
      const products = await create(...args);
      process.send?.({ type: 'product-created', id: products[0].id });
      if (process.env.BOOKING_CRASH === 'product-created') await new Promise(() => {});
      return products;
    };
    await app.onApplicationStart();
    const result = await withEventProductLock(container, attemptId, async () => {
      await recoverEventProduct(container, attemptId, 'proof-event');
      const flow = eventProductWorkflow(container);
      return flow.run({
        input: {
          eventId: 'proof-event',
          attemptId,
          products: [
            {
              title: 'Fixture ticket',
              options: [{ title: 'Ticket', values: ['Admission'] }],
              handle: `proof-${attemptId}`,
              external_id: eventProductExecution(attemptId),
              metadata: {
                acceptance_attempt: attemptId,
                chef_event_id: 'proof-event',
              },
              status: 'draft',
            },
          ],
        },
        context: { transactionId: eventProductExecution(attemptId) },
        throwOnError: false,
      });
    });
    process.send?.({
      type: 'result',
      state: result.transaction.getState(),
      result: result.result,
      errors: result.errors,
    });
    await app.onApplicationPrepareShutdown();
    await app.onApplicationShutdown();
    process.exit(0);
  }
  const step = createStep(
    { name: 'booking-proof-write', retryIntervalAwaiting: 1 },
    async (input: { value: string }) => {
      process.send?.({ type: 'write', value: input.value });
      if (process.env.BOOKING_CRASH === 'write') await new Promise(() => {});
      return new StepResponse(input.value);
    },
  );
  const dispatch = createStep('booking-proof-dispatch', async (value: string) => {
    process.send?.({ type: 'dispatch', value });
    return new StepResponse(value);
  });
  const workflow = createWorkflow(
    {
      name: 'booking-native-proof',
      store: true,
      idempotent: true,
      retentionTime: 604800,
    },
    (input: { value: string }) => {
      const value = step(input);
      return new WorkflowResponse(dispatch(value));
    },
  );
  await app.onApplicationStart();
  const engine = app.modules[Modules.WORKFLOW_ENGINE] as any;
  const output = await engine.run(workflow.getName(), {
    transactionId: process.env.BOOKING_EXECUTION_ID,
    input: { value: process.env.BOOKING_VALUE || 'original' },
    throwOnError: false,
  });
  process.send?.({
    type: 'result',
    result: output.result,
    state: output.transaction.getState(),
    errors: output.errors,
  });
  await app.onApplicationPrepareShutdown();
  await app.onApplicationShutdown();
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
