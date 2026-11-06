/** Disposable browser fixture only; never seeds an existing chef installation. */
import type { ExecArgs } from '@medusajs/framework/types';
import { Modules } from '@medusajs/framework/utils';
import { createRegionsWorkflow } from '@medusajs/medusa/core-flows';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyMealPrepSetup } from '../lib/availability/slots';
import type AvailabilityModuleService from '../modules/availability/service';
export default async function seed({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || 'http://invalid');
  if (
    process.env.NODE_ENV !== 'test' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/discovery_browser'
  ) {
    throw new Error('Requires NODE_ENV=test and a local disposable discovery_browser database.');
  }
  const region = container.resolve(Modules.REGION);
  if (!(await region.listRegions()).length) {
    await createRegionsWorkflow(container).run({
      input: { regions: [{ name: 'Browser test', currency_code: 'usd', countries: ['us'] }] },
    });
  }
  const keys = container.resolve(Modules.API_KEY);
  const key = await keys.createApiKeys({ title: 'Discovery browser fixture', type: 'publishable', created_by: 'test' });
  const directory = resolve(process.cwd(), '../../artifacts/meal-prep-verification');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'browser-publishable-key.txt'), key.token);
  const service = container.resolve<AvailabilityModuleService>('availability');
  const [existing] = await service.listAvailabilitySettings({ id: 'chef-default' });
  const setup = emptyMealPrepSetup();
  for (const method of Object.values(setup.methods)) method.enabled = true;
  for (const style of Object.keys(setup.selection_styles) as (keyof typeof setup.selection_styles)[])
    setup.selection_styles[style] = true;
  await service.saveSchedule({
    version: existing?.version ?? 0,
    timezone: 'UTC',
    weekly: {},
    overrides: {},
    google_mode: 'internal_only',
    notice_rules: [],
    meal_prep: setup,
  });
}
