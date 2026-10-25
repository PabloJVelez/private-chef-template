import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMemoryRouter, matchRoutes, type RouteObject } from 'react-router-dom';
import type { ReactElement } from 'react';
import menuConfig from '../../admin/overrides/menu.config';
import { settingsRoutePrefixFix } from '../admin-settings-route-prefix';

// Exercise the installed, pinned Medusa router, not a duplicate of its algorithm.
// Upgrade this adapter with Medusa: it intentionally fails if its internals move.
const dashboard = fs.readFileSync(
  path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')), 'dist/chunk-2QUBSJMV.mjs'),
  'utf8',
);
const helpers = dashboard
  .split('// src/dashboard-app/routes/utils.ts')[1]
  .split('// src/dashboard-app/dashboard-app.tsx')[0];
// This repository's Unlock plugin uses Medusa's shipped TSX source instead of
// the bundles. Verify the unpatched real execution path and both bundles.
const dashboardSource = fs.readFileSync(
  path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')), 'src/dashboard-app/dashboard-app.tsx'),
  'utf8',
);
const transformed = settingsRoutePrefixFix().transform(dashboardSource, '/node_modules/@medusajs/dashboard/src/dashboard-app/dashboard-app.tsx')!.code;
const sourceMethod = transformed.slice(
  transformed.indexOf('  private populateRoutes('),
  transformed.indexOf('  private populateWidgets('),
);
const compiledMethod = require('@swc/core').transformSync(`class Routes { ${sourceMethod} }`, {
  jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022' },
}).code;
const populateRoutes = compiledMethod.slice(compiledMethod.indexOf('{') + 1, compiledMethod.lastIndexOf('}'));
const populate = vm.runInNewContext(
  `const ErrorBoundary = () => null; ${helpers}; ({ ${populateRoutes} }).populateRoutes`,
);

async function generatedModule(id: string) {
  const plugin = require('@medusajs/admin-vite-plugin').default({ sources: [path.resolve('src/admin')] });
  const { code } = await plugin.load(plugin.resolveId(id));
  const bindings: Record<string, unknown> = {};
  const parser = require('@babel/parser');
  const ast = parser.parse(code, { sourceType: 'module' });
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers) {
      bindings[specifier.local.name] =
        specifier.type === 'ImportDefaultSpecifier' ? () => null : { label: 'Availability' };
    }
  }
  return vm.runInNewContext(code.replace(/^import .*$/gm, '').replace('export default', 'result ='), bindings);
}

let routes: any[];
let availabilityComponent: any;
beforeAll(async () => {
  const routeModule = await generatedModule('virtual:medusa/routes');
  availabilityComponent = routeModule.routes.find((route: any) => route.path === '/settings/availability').Component;
  const { coreRoutes, settingsRoutes } = populate([{ routeModule }]);
  // Medusa's core route tree mounts settings extensions inside /settings.
  expect(dashboard).toMatch(/path: "\/settings"/);
  routes = [...coreRoutes, { path: '/settings', children: settingsRoutes }];
});

test('generated Availability page resolves on direct /app/settings/availability navigation', async () => {
  const router = createMemoryRouter(routes, { basename: '/app', initialEntries: ['/app/settings/availability'] });
  if (!router.state.initialized) {
    await new Promise<void>((resolve) => {
      const unsubscribe = router.subscribe((state) => {
        if (state.initialized) {
          unsubscribe();
          resolve();
        }
      });
    });
  }
  expect(router.state.errors).toBeNull();
  expect(((router.state.matches.at(-1)?.route as RouteObject)?.element as ReactElement)?.type).toBe(
    availabilityComponent,
  );
  router.dispose();
});

test('settings sidebar Availability target navigates to the generated page', async () => {
  const menu = await generatedModule('virtual:medusa/menu-items');
  const generated = menu.menuItems.find((entry: any) => entry.path === '/settings/availability');
  expect(generated).toBeDefined();
  expect(generated.label).toBe('Availability');
  expect(menuConfig.add?.some((entry) => entry.to.includes('availability'))).toBe(false);
  expect(menuConfig.order).not.toContain('/availability');
  expect(menu.menuItems.some((entry: any) => entry.path === '/availability')).toBe(false);
  const router = createMemoryRouter(routes, { basename: '/app', initialEntries: ['/app/chef-events'] });
  await router.navigate(generated.path);
  expect(router.state.location.pathname).toBe('/app/settings/availability');
  expect(router.state.errors).toBeNull();
  expect(((router.state.matches.at(-1)?.route as RouteObject)?.element as ReactElement)?.type).toBe(
    availabilityComponent,
  );
  router.dispose();
});

test('Availability mounts once under settings and other pages still resolve', () => {
  expect(matchRoutes(routes, '/settings/availability')).not.toBeNull();
  expect(matchRoutes(routes, '/availability')).toBeNull();
  expect(matchRoutes(routes, '/settings/settings/availability')).toBeNull();
  expect(matchRoutes(routes, '/chef-events')).not.toBeNull();
});

test('Medusa source and bundles are unpatched', () => {
  const cjs = fs.readFileSync(require.resolve('@medusajs/dashboard'), 'utf8');
  for (const code of [dashboardSource, dashboard, cjs]) {
    expect(code).toContain('createRouteMap(filteredSettingsRoutes)');
    expect(code).not.toContain('createRouteMap(filteredSettingsRoutes, "/settings")');
  }
});

test('prefix fix is scoped and tolerates an upstream correction', () => {
  const plugin = settingsRoutePrefixFix();
  expect(plugin.transform(dashboardSource, '/unrelated/dashboard-app.tsx')).toBeNull();
  expect(plugin.transform(transformed, '/node_modules/@medusajs/dashboard/src/dashboard-app/dashboard-app.tsx')).toBeNull();
});

// Render the actual transformed sidebar with lightweight layout/hook stand-ins.
// This checks which section receives each entry, not just generated routes.
test('Settings sidebar places Availability immediately after Store, without duplicating it', () => {
  const { availabilitySettingsSidebar } = require('../admin-settings-sidebar');
  const filename = '/node_modules/@medusajs/dashboard/src/components/layout/settings-layout/settings-layout.tsx';
  const source = fs.readFileSync(path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')),
    'src/components/layout/settings-layout/settings-layout.tsx'), 'utf8');
  const plugin = availabilitySettingsSidebar();
  expect(plugin.transform(source, '/unrelated/settings-layout.tsx')).toBeNull();
  expect(() => plugin.transform('changed', filename)).toThrow('sidebar changed');
  const transformed = plugin.transform(source, filename).code;
  const sidebar = transformed.slice(transformed.indexOf('const SettingsSidebar ='), transformed.indexOf('const Header ='));
  const compiled = require('@swc/core').transformSync(sidebar, {
    jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
  }).code;
  const general = [{ to: '/settings/store' }, { to: '/settings/users' }];
  const availability = { to: '/settings/availability', label: 'Availability' };
  const other = { to: '/settings/other', label: 'Other' };
  const render = (extensions: any[]) => vm.runInNewContext(`${compiled}; SettingsSidebar()`, {
    React: require('react'), Fragment: 'fragment', Header: 'header', Divider: 'divider', UserSection: 'user',
    RadixCollapsibleSection: 'section', useTranslation: () => ({ t: (key: string) => key }),
    useExtension: () => ({ getMenu: () => extensions }), useSettingRoutes: () => general,
    useDeveloperRoutes: () => [], useMyAccountRoutes: () => [],
  });
  const sections = (node: any): any[] => !node || typeof node !== 'object' ? [] : [
    ...(node.type === 'section' ? [node.props] : []),
    ...require('react').Children.toArray(node.props?.children).flatMap(sections),
  ];
  const rendered = sections(render([availability, other]));
  expect(rendered.find((s) => s.label === 'app.nav.settings.general').items.map((i: any) => i.to))
    .toEqual(['/settings/store', '/settings/availability', '/settings/users']);
  expect(rendered.find((s) => s.label === 'app.nav.common.extensions').items).toEqual([other]);
  expect(sections(render([availability])).some((s) => s.label === 'app.nav.common.extensions')).toBe(false);
  expect(general).toEqual([{ to: '/settings/store' }, { to: '/settings/users' }]);
});
