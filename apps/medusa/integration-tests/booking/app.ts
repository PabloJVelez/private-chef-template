import { MedusaApp, MedusaAppMigrateUp } from '@medusajs/framework/modules-sdk';
import { createMedusaContainer } from '@medusajs/framework/utils';
import { asValue } from '@medusajs/framework/awilix';
import path from 'node:path';

export async function bookingApp(url: string, migrate = true) {
  if (
    !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.startsWith('/booking_test_')
  )
    throw new Error('Booking fixtures require a task-owned loopback database named booking_test_*');
  const container = createMedusaContainer();
  container.register('logger', asValue({ ...console, debug() {}, info() {} }));
  const custom = (name: string) => ({ resolve: path.resolve(__dirname, '../../src/modules', name) });
  const options = {
    sharedContainer: container,
    sharedResourcesConfig: { database: { clientUrl: url } },
    modulesConfig: {
      chefEventModuleService: custom('chef-event'),
      availability: custom('availability'),
      experienceTypeModuleService: custom('experience-type'),
      scheduling: custom('scheduling'),
    },
  };
  if (migrate) await MedusaAppMigrateUp(options);
  const app = await MedusaApp(options);
  for (const [key, service] of Object.entries(app.modules)) container.register(key, asValue(service));
  return {
    app,
    container,
    close: async () => {
      await app.onApplicationPrepareShutdown();
      await app.onApplicationShutdown();
    },
  };
}
