import { Calendar, ListBullet } from '@medusajs/icons';
import type { MenuConfig } from '@unlockable/vite-plugin-unlock/medusa';

/**
 * Patch core sidebar (main-layout useCoreRoutes).
 * - Drop Inventory and Price Lists.
 * - Add Menus + Chef Events as top-level items directly after Products (not under Products’ flyout).
 * Paths in `add` match extension routes so those entries are hidden from the Extensions section.
 */
const config: MenuConfig = {
  remove: ['/inventory', '/price-lists'],
  add: [
    {
      icon: ListBullet,
      label: 'Menus',
      to: '/menus',
    },
    {
      icon: Calendar,
      label: 'Chef Events',
      to: '/chef-events',
    },
  ],
  order: [
    '/chef-events',
    '/orders',
    '/products',
    '/menus',
    '/customers',
    '/promotions',
  ],
};

export default config;
