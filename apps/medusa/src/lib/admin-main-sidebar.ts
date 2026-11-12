import { medusa, type MedusaPresetOptions } from '@unlockable/vite-plugin-unlock/medusa';

/** Keep Unlock's core-menu promotion, adapting its 2.7-only deduplication to 2.22.
 * Compose inside the preset patch so this always runs AFTER menu.config is applied.
 * Leave permission filtering and nested extension attachment to the dashboard.
 */
export function privateChefAdminPreset(options?: MedusaPresetOptions) {
  const preset = medusa(options);
  const menuPatch = preset.patches?.find((patch) => patch.configFile === 'menu.config');
  if (!menuPatch) throw new Error('Unlock menu patch changed; recheck main sidebar integration.');
  const apply = menuPatch.apply;
  menuPatch.apply = (code, configPath) => {
    const patched = apply(code, configPath);
    const extensions = 'const extensionItems = menuItems.filter((item) => !item.nested)';
    const core = 'const coreRoutes = __applyMenuConfig(useCoreRoutes(), __menuConfig)';
    const permitted = 'const menuItems = usePermittedNavItems(getMenu("coreExtensions"))';
    if ([extensions, core, permitted].some((marker) => patched.split(marker).length !== 2)) {
      throw new Error('Medusa main sidebar changed; recheck promoted menu deduplication.');
    }
    return patched.replace(
      extensions,
      extensions + '.filter((item) => !coreRoutes.some((route) => route.to === item.to))',
    );
  };
  return preset;
}
