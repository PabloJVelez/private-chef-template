import type { ExecArgs } from '@medusajs/framework/types';
import { createApiKeysWorkflow, createProductsWorkflow, linkSalesChannelsToApiKeyWorkflow } from '@medusajs/medusa/core-flows';
import { seedExperienceTypes } from '../../src/scripts/seed/experience-types';
export default async function seed({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/upgrade_main') throw new Error('Disposable fixture required');
  await seedExperienceTypes(container.resolve('experienceTypeModuleService'));
  const [store] = await container.resolve<any>('store').listStores();
  const { result: [key] } = await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: 'Upgrade browser fixture', type: 'publishable', created_by: 'fixture-admin' }] } });
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [store.default_sales_channel_id] } });
  const profiles = await container.resolve<any>('fulfillment').listShippingProfiles();
  const { result: [product] } = await createProductsWorkflow(container).run({ input: { products: [{
    title: 'Upgrade fixture dinner', handle: 'upgrade-fixture-dinner', status: 'published', description: 'Synthetic browser regression fixture.',
    shipping_profile_id: profiles[0].id, sales_channels: [{ id: store.default_sales_channel_id }],
    options: [{ title: 'Guests', values: ['Four'] }], variants: [{ title: 'Four guests', manage_inventory: false,
      options: { Guests: 'Four' }, prices: [{ currency_code: 'usd', amount: 425.25 }] }],
  }] } });
  console.log(JSON.stringify({ publishableKey: key.token, productId: product.id, handle: product.handle }));
}
