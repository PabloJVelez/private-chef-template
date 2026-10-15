import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMemoryRouter, matchRoutes, type RouteObject } from 'react-router-dom';
import type { ReactElement } from 'react';

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
// the bundles. Verify that real execution path as well as both bundles.
const dashboardSource = fs.readFileSync(
  path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')), 'src/dashboard-app/dashboard-app.tsx'),
  'utf8',
);
const sourceMethod = dashboardSource.slice(
  dashboardSource.indexOf('  private populateRoutes('),
  dashboardSource.indexOf('  private populateWidgets('),
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

test('generated Settings menu target navigates to the Availability page', async () => {
  const menu = await generatedModule('virtual:medusa/menu-items');
  const item = menu.menuItems.find((entry: any) => entry.path === '/settings/availability');
  expect(item).toBeDefined();
  const router = createMemoryRouter(routes, { basename: '/app', initialEntries: ['/app/chef-events'] });
  await router.navigate(item.path);
  expect(router.state.location.pathname).toBe('/app/settings/availability');
  expect(router.state.errors).toBeNull();
  expect(((router.state.matches.at(-1)?.route as RouteObject)?.element as ReactElement)?.type).toBe(
    availabilityComponent,
  );
  router.dispose();
});

test('settings prefix is not doubled and other routes still resolve', () => {
  expect(matchRoutes(routes, '/settings/settings/availability')).toBeNull();
  expect(matchRoutes(routes, '/chef-events')).not.toBeNull();
});

test('both shipped bundles retain the same settings prefix fix', () => {
  const cjs = fs.readFileSync(require.resolve('@medusajs/dashboard'), 'utf8');
  for (const code of [dashboard, cjs]) {
    expect(code).toContain('createRouteMap(filteredSettingsRoutes, "/settings")');
  }
});

test('unpatched Medusa source reproduces the reported 404', async () => {
  const broken = vm.runInNewContext(
    `const ErrorBoundary = () => null; ${helpers}; ({ ${populateRoutes.replace(', "/settings"', '')} }).populateRoutes`,
  );
  const { settingsRoutes } = broken([{ routeModule: await generatedModule('virtual:medusa/routes') }]);
  const brokenTree = [{ path: '/settings', children: settingsRoutes }];
  expect(matchRoutes(brokenTree, '/settings/availability')).toBeNull();
  expect(matchRoutes(brokenTree, '/settings/settings/availability')).not.toBeNull();
});
