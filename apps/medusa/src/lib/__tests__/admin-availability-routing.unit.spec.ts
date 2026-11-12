import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMemoryRouter, matchRoutes, type RouteObject } from 'react-router-dom';
import type { ReactElement } from 'react';
import menuConfig from '../../admin/overrides/menu.config';

// Exercise the installed, pinned Medusa router, not a duplicate of its algorithm.
// Upgrade this adapter with Medusa: it intentionally fails if its internals move.
const dashboardRoot = path.dirname(require.resolve('@medusajs/dashboard/package.json'));
const helperSource = fs.readFileSync(path.join(dashboardRoot, 'src/dashboard-app/routes/utils.ts'), 'utf8');
const helpers = require('@swc/core').transformSync(
  helperSource.replace(/^import .*$/gm, '').replace(/export /g, ''),
  { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } },
).code;
const dashboard = fs.readdirSync(path.join(dashboardRoot, 'dist'))
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => fs.readFileSync(path.join(dashboardRoot, 'dist', file), 'utf8')).join('\n');
// This repository's Unlock plugin uses Medusa's shipped TSX source instead of
// the bundles. Verify the unpatched real execution path and both bundles.
const dashboardSource = fs.readFileSync(
  path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')), 'src/dashboard-app/dashboard-app.tsx'),
  'utf8',
);
const transformed = dashboardSource;
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
  // Vite 7's generator loads ESM dependencies. Run the actual generator in Node,
  // outside Jest 29's CJS loader, then exercise its generated routes below.
  const { code } = JSON.parse(execFileSync(process.execPath, ['-e', `
    const plugin = require('@medusajs/admin-vite-plugin').default({ sources: [require('node:path').resolve('src/admin')] });
    Promise.resolve(plugin.load(plugin.resolveId(${JSON.stringify(id)}))).then(result => process.stdout.write(JSON.stringify(result)));
  `], { encoding: 'utf8' }));
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
  const mountSource = fs.readFileSync(path.join(dashboardRoot, 'src/dashboard-app/routes/get-route.map.tsx'), 'utf8');
  // 2.22.6 removes the settings prefix at the mount, not in populateRoutes.
  // Execute the installed expression: the old prefix shim double-stripped it.
  const expression = mountSource.match(/children: (settingsRoutes\.flatMap\([^\n]+\)),/)?.[1];
  expect(expression).toBeDefined();
  const mounted = vm.runInNewContext(expression!, { settingsRoutes });
  routes = [...coreRoutes, { path: '/settings', children: mounted }];
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
    LayoutComposer: 'section', CORE_LAYOUT_IDS: { SETTINGS_SIDEBAR: 'settings' },
    CUSTOMIZE_IDS: { SETTINGS_SIDEBAR: 'settings' }, toNavEntries: (items: any[]) => items,
    usePermittedNavItems: (items: any[]) => items.filter((item) => item.permitted !== false), useTranslation: () => ({ t: (key: string) => key }),
    useExtension: () => ({ getMenu: () => extensions }), useSettingRoutes: () => general,
    useDeveloperRoutes: () => [], useMyAccountRoutes: () => [],
  });
  const sections = (node: any): any[] => !node || typeof node !== 'object' ? [] : [
    ...(node.type === 'section' ? [node.props] : []),
    ...require('react').Children.toArray(node.props?.children).flatMap(sections),
  ];
  const rendered = sections(render([availability, other]))[0].sections;
  expect(rendered.general.map((i: any) => i.to))
    .toEqual(['/settings/store', '/settings/availability', '/settings/users']);
  expect(rendered.extensions).toEqual([other]);
  expect(sections(render([availability]))[0].sections.extensions).toEqual([]);
  expect(sections(render([{ ...availability, permitted: false }, other]))[0].sections.general)
    .toEqual(general);
  expect(general).toEqual([{ to: '/settings/store' }, { to: '/settings/users' }]);
});

// Exercise both HTTP handlers and resolve their return destination against the
// generated admin routes; no Google requests or real credentials are used.
jest.mock('../google-calendar/oauth-state', () => ({
  buildState: jest.fn(() => 'signed-test-state'),
  parseAndVerifyState: jest.fn(() => ({ nonce: 'test', ts: 1 })),
}));
jest.mock('../google-calendar/crypto', () => ({ encryptSecret: jest.fn(() => 'encrypted-test-token') }));
jest.mock('../google-calendar/ensure-watch', () => ({
  ensureGoogleCalendarWatchAndBootstrapSync: jest.fn().mockResolvedValue(undefined),
}));

test('Google connect and successful callback return to the generated Availability settings page', async () => {
  const { POST } = require('../../api/admin/google-calendar/connect/route');
  const { GET } = require('../../api/admin/google-calendar/callback/route');
  const { buildState } = require('../google-calendar/oauth-state');
  const service = {
    getConfig: jest.fn().mockResolvedValue({
      clientId: 'test-client', clientSecret: 'test-secret',
      redirectUri: 'https://example.test/admin/google-calendar/callback',
    }),
    upsertPrimaryConnection: jest.fn().mockResolvedValue(undefined),
  };
  const scope = { resolve: jest.fn(() => service) };
  const res: any = { status: jest.fn(), json: jest.fn(), redirect: jest.fn() };
  res.status.mockReturnValue(res);
  await POST({ scope } as any, res);
  expect(buildState).toHaveBeenCalledWith(expect.objectContaining({ returnTo: '/app/settings/availability' }));
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
  } as Response);
  try {
    await GET({ scope, query: { code: 'test-code', state: 'signed-test-state' } } as any, res);
    expect(service.upsertPrimaryConnection).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith('/app/settings/availability');
    const router = createMemoryRouter(routes, { basename: '/app', initialEntries: ['/app/chef-events'] });
    try {
      await router.navigate(res.redirect.mock.calls[0][0].slice('/app'.length));
      expect(router.state.errors).toBeNull();
      expect(((router.state.matches.at(-1)?.route as RouteObject)?.element as ReactElement)?.type).toBe(availabilityComponent);
    } finally {
      router.dispose();
    }
  } finally {
    fetchMock.mockRestore();
  }
});
