/** Medusa 2.7 mounts settings extensions below /settings but leaves that prefix
 * in their route map. Unlock loads this source file in dev and production.
 * Keep the correction at build time, never patch installed package files.
 * Remove when upgrading to a dashboard that passes the prefix itself.
 */
export function settingsRoutePrefixFix() {
  return {
    name: 'medusa-settings-route-prefix',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const path = id.split('?')[0].replace(/\\/g, '/');
      if (!path.endsWith('/@medusajs/dashboard/src/dashboard-app/dashboard-app.tsx')) return null;
      const original = 'createRouteMap(filteredSettingsRoutes)';
      const corrected = 'createRouteMap(filteredSettingsRoutes, "/settings")';
      if (code.includes(corrected)) return null;
      if (!code.includes(original)) {
        throw new Error('Medusa settings route implementation changed; recheck the route-prefix compatibility fix.');
      }
      return { code: code.replace(original, corrected), map: null };
    },
  };
}
