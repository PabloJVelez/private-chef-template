/** Place Availability after Store without forking Medusa's Settings layout.
 * Unlock loads dashboard source in both development and production.
 */
export function availabilitySettingsSidebar() {
  return {
    name: 'medusa-availability-settings-sidebar',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const path = id.split('?')[0].replace(/\\/g, '/');
      if (!path.endsWith('/@medusajs/dashboard/src/components/layout/settings-layout/settings-layout.tsx')) return null;
      const original = 'const extensionRoutes = getMenu("settingsExtensions")';
      if (code.split(original).length !== 2 || code.split('items={routes}').length !== 2) {
        throw new Error('Medusa settings sidebar changed; recheck Availability placement.');
      }
      return {
        code: code.replace(original, `const settingsExtensions = getMenu("settingsExtensions")
  const availability = settingsExtensions.find((item) => item.to === "/settings/availability")
  const generalRoutes = [...routes]
  if (availability) {
    const storeIndex = generalRoutes.findIndex((item) => item.to === "/settings/store")
    generalRoutes.splice(storeIndex + 1, 0, availability)
  }
  const extensionRoutes = settingsExtensions.filter((item) => item.to !== "/settings/availability")`)
          .replace('items={routes}', 'items={generalRoutes}'),
        map: null,
      };
    },
  };
}
