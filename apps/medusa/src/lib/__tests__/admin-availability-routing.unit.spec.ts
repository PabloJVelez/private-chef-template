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
