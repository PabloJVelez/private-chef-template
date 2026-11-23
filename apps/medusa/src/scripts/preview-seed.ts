/** Additive synthetic pilot fixtures. Run serially, only in a preview database. */
import type { ExecArgs, IApiKeyModuleService, IAuthModuleService, IRegionModuleService, ISalesChannelModuleService, IStoreModuleService, IUserModuleService } from '@medusajs/framework/types';
import { Modules } from '@medusajs/framework/utils';
import { createApiKeysWorkflow, createRegionsWorkflow, createSalesChannelsWorkflow, linkSalesChannelsToApiKeyWorkflow, updateStoresWorkflow } from '@medusajs/core-flows';
import { writeFile } from 'node:fs/promises';
import type MenuService from '../modules/menu/service';
import type ExperienceService from '../modules/experience-type/service';
import type AvailabilityService from '../modules/availability/service';
import { menuDefinitions, menuProductData } from './old-scripts/seed/menus';
import { seedExperienceTypes } from './seed/experience-types';
import { saveAvailabilityWorkflow } from '../workflows/save-availability';

export default async function seed({ container }: ExecArgs) {
  if (process.env.PREVIEW_MODE !== 'true' || !process.env.PREVIEW_ADMIN_PASSWORD)
    throw new Error('Preview seed requires explicit preview mode and a private Admin password');
  const stores = container.resolve<IStoreModuleService>(Modules.STORE);
  const channels = container.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL);
  const keys = container.resolve<IApiKeyModuleService>(Modules.API_KEY);
  const regions = container.resolve<IRegionModuleService>(Modules.REGION);
  const users = container.resolve<IUserModuleService>(Modules.USER);
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const [store] = await stores.listStores();
  let channel = store.default_sales_channel_id
    ? (await channels.listSalesChannels({ id: store.default_sales_channel_id }))[0]
    : (await channels.listSalesChannels({ name: 'Preview' }))[0];
  if (!channel) channel = (await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: 'Preview' }] } })).result[0];
  if (!store.default_sales_channel_id) await updateStoresWorkflow(container).run({ input: {
    selector: { id: store.id }, update: { default_sales_channel_id: channel.id, supported_currencies: [{ currency_code: 'usd', is_default: true }] },
  } });
  if (!(await regions.listRegions({ currency_code: 'usd' })).length)
    await createRegionsWorkflow(container).run({ input: { regions: [{ name: 'Preview United States', currency_code: 'usd', countries: ['us'], payment_providers: ['pp_system_default'] }] } });
  // Preserve renamed keys by storing their stable ID on the preview store.
  const keyId = store.metadata?.preview_api_key_id as string | undefined;
  let key = (await keys.listApiKeys(keyId ? { id: keyId } : { title: 'Preview storefront', type: 'publishable' }))[0];
  if (!key) key = (await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: 'Preview storefront', type: 'publishable', created_by: '' }] } })).result[0];
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [channel.id] } });
  if (!keyId) await stores.updateStores(store.id, { metadata: { ...store.metadata, preview_api_key_id: key.id } });

  const experiences = container.resolve<ExperienceService>('experienceTypeModuleService');
  await seedExperienceTypes(experiences);
  const menu = container.resolve<MenuService>('menuModuleService');
  const experienceTypes = await experiences.listExperienceTypes({});
  for (const [index, product] of menuProductData.entries()) {
    const definition = menuDefinitions[index];
    const menuId = index === 0 ? 'menu_preview' : `menu_preview_${product.handle}`;
    const [existing] = await menu.listMenus({ id: menuId });
    const details = { name: definition.name, thumbnail: definition.thumbnail };
    if (!existing) {
      await menu.createMenus({ id: menuId, ...details, status: 'active' });
    } else if (menuId === 'menu_preview' && existing.name === 'Preview Seasonal Dinner') {
      await menu.updateMenus({ id: menuId, ...details });
    }
    for (const [courseIndex, course] of definition.courses.entries()) {
      const courseId = `${menuId}_course_${courseIndex}`;
      if (!(await menu.listCourses({ id: courseId })).length) {
        await menu.createCourses({ id: courseId, menu_id: menuId, name: course.name });
      }
      for (const [dishIndex, dish] of course.dishes.entries()) {
        const dishId = `${courseId}_dish_${dishIndex}`;
        if (!(await menu.listDishes({ id: dishId })).length) {
          await menu.createDishes({ id: dishId, course_id: courseId, name: dish.name, description: dish.description });
        }
      }
    }
    for (const experience of experienceTypes) {
      if (!(await menu.listMenuExperiencePrices({ menu_id: menuId, experience_type_id: experience.id })).length) {
        await menu.createMenuExperiencePrices({ menu_id: menuId, experience_type_id: experience.id, price_per_person: product.price.usd * 100 });
      }
    }
  }
  const availability = container.resolve<AvailabilityService>('availability');
  if (!(await availability.listAvailabilitySettings({ id: 'chef-default' })).length)
    await saveAvailabilityWorkflow(container).run({ input: {
      timezone: 'America/Chicago', google_mode: 'internal_only', overrides: {}, notice_rules: [],
      weekly: { '1': [{ start: '10:00', end: '22:00' }], '2': [{ start: '10:00', end: '22:00' }], '3': [{ start: '10:00', end: '22:00' }], '4': [{ start: '10:00', end: '22:00' }], '5': [{ start: '10:00', end: '22:00' }], '6': [{ start: '10:00', end: '22:00' }], '7': [{ start: '10:00', end: '22:00' }] },
    } });
  const email = 'chef@example.invalid';
  let user = (await users.listUsers({ email }))[0];
  if (!user) user = await users.createUsers({ email, first_name: 'Preview', last_name: 'Chef' });
  // Existing provider identities retain reviewer-changed passwords.
  const [provider] = await auth.listProviderIdentities({ entity_id: email, provider: 'emailpass' });
  let identity = provider?.auth_identity_id ? await auth.retrieveAuthIdentity(provider.auth_identity_id) : undefined;
  if (!identity) {
    const result = await auth.register('emailpass', { body: { email, password: process.env.PREVIEW_ADMIN_PASSWORD } });
    identity = result.authIdentity;
  }
  if (!identity) throw new Error('Preview Admin identity unavailable');
  if (identity.app_metadata?.user_id && identity.app_metadata.user_id !== user.id)
    throw new Error('Preview Admin identity already belongs to another user');
  if (!identity.app_metadata?.user_id)
    await auth.updateAuthIdentities({ id: identity.id, app_metadata: { ...identity.app_metadata, user_id: user.id } });
  await writeFile('./preview-emails/bootstrap.json', JSON.stringify({ publishable_key: key.token, admin_email: email }), { mode: 0o600 });
}
