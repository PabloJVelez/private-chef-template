import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { medusa } from '@unlockable/vite-plugin-unlock/medusa';
import { privateChefAdminPreset } from '../admin-main-sidebar';
import menuConfig from '../../admin/overrides/menu.config';

const filename = path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')),
  'src/components/layout/main-layout/main-layout.tsx');
const source = fs.readFileSync(filename, 'utf8');
const configPath = '/fixture/menu.config.ts';
const patch = privateChefAdminPreset().patches!.find((entry) => entry.configFile === 'menu.config')!;
const transformed = patch.apply(source, configPath);

// Execute the real dashboard component and Unlock helpers. Only layout/context
// boundaries are stand-ins; the core promotion and extension selection are real.
function render(code: string, extensions: any[]) {
  const sidebar = code.slice(code.indexOf('const SidebarRoutes ='), code.indexOf('const UtilitySection ='));
  const helpers = code.slice(code.indexOf('\nfunction __toNavItems'));
  const compiled = require('@swc/core').transformSync(sidebar + helpers, {
    jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022',
      transform: { react: { runtime: 'classic' } } },
  }).code;
  const core = [{ to: '/orders', label: 'Orders' }, { to: '/products', label: 'Products' }];
  const element = vm.runInNewContext(`${compiled}; SidebarRoutes()`, {
    React, __React: React, __i18n: { t: (key: string) => key }, __menuConfig: menuConfig,
    useCoreRoutes: () => core, useExtension: () => ({ getMenu: () => extensions }),
    usePermittedNavItems: (items: any[]) => items.filter((item) => item.permitted !== false),
    LayoutComposer: Object.assign(() => null, { Entry: 'layout-entry' }),
    CORE_LAYOUT_IDS: { SINGLE_COLUMN: 'single' }, CUSTOMIZE_IDS: { MAIN_SIDEBAR: 'main' },
    Searchbar: 'searchbar', NavItem: 'nav-item', SquaresPlus: 'icon',
  });
  const entries = (node: any): any[] => !node || typeof node !== 'object' ? [] : [
    ...(node.type === 'nav-item' ? [node.props] : []),
    ...React.Children.toArray(node.props?.children).flatMap(entries),
    ...React.Children.toArray(node.props?.sections?.main).flatMap(entries),
  ];
  return entries(element);
}

const promoted = menuConfig.add!.map(({ to, label }) => ({ to, label }));

test('installed Unlock alone reproduces the upgrade duplication; adapter renders each promoted path once', () => {
  const original = medusa().patches!.find((entry) => entry.configFile === 'menu.config')!.apply(source, configPath);
  const before = render(original, promoted);
  const after = render(transformed, promoted);
  for (const { to } of promoted) {
    expect(before.filter((entry) => entry.to === to)).toHaveLength(2);
    expect(after.filter((entry) => entry.to === to)).toHaveLength(1);
  }
  expect(after.map((entry) => entry.to)).toEqual([
    '/chef-events', '/orders', '/menus', '/experience-types', '/social-gallery',
  ]);
});

test('preserves permitted unrelated and nested extensions, without mutating the extension list', () => {
  const extensions = [...promoted,
    { to: '/reports', label: 'Reports' },
    { to: '/restricted', label: 'Restricted', permitted: false },
    { to: '/orders/export', label: 'Export', nested: '/orders' },
    { to: '/orders/secret', label: 'Secret', nested: '/orders', permitted: false },
  ];
  const before = JSON.stringify(extensions);
  const entries = render(transformed, extensions);
  expect(entries.filter((entry) => entry.to === '/reports')).toHaveLength(1);
  expect(entries.some((entry) => entry.to === '/restricted')).toBe(false);
  expect(entries.find((entry) => entry.to === '/orders').items).toEqual([extensions[6]]);
  expect(entries.some((entry) => entry.to === '/orders/export')).toBe(false);
  expect(JSON.stringify(extensions)).toBe(before);
});

test('keeps the preset target and fails visibly when dashboard markers drift', () => {
  expect(patch.target.test(filename)).toBe(true);
  expect(patch.target.test('/unrelated/settings-layout.tsx')).toBe(false);
  for (const marker of [
    'const coreRoutes = useCoreRoutes()',
    'const extensionItems = menuItems.filter((item) => !item.nested)',
    'const menuItems = usePermittedNavItems(getMenu("coreExtensions"))',
  ]) expect(() => patch.apply(source.replace(marker, 'changed'), configPath)).toThrow('main sidebar changed');
  expect(fs.readFileSync(filename, 'utf8')).toBe(source);
});
