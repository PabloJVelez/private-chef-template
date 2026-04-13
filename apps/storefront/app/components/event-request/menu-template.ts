import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';

/** Seeded template name for “no fixed menu” requests (see menu seed `Custom`). */
export function isCustomMenuTemplate(menu: Pick<StoreMenuDTO, 'name'>): boolean {
  return menu.name.trim().toLowerCase() === 'custom';
}
