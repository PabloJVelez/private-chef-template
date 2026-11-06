import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('../../medusa/node_modules/pg');
const url = process.env.DISCOVERY_BROWSER_DATABASE_URL;
if (!url || new URL(url).pathname !== '/discovery_browser' || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Explicit local discovery_browser fixture required.');
const pool = new Pool({ connectionString: url });
let authorization: string;
const base = 'http://localhost:9001';
const setup = () => ({
  methods: Object.fromEntries(['in_home', 'delivery', 'pickup'].map((method) => [method, { enabled: true, weekly: {}, dates: {} }])),
  selection_styles: { individual_dishes: true, package: true, chosen_menu: true, tailored_plan: true },
  delivery_area: { radius: null, zip_codes: [] }, work_plans: [],
});
async function save(request: any, meal_prep: any) {
  const response = await request.get(`${base}/admin/availability`, { headers: { authorization } });
  expect(response.ok()).toBeTruthy();
  const { settings } = await response.json();
  const { timezone, version, weekly, overrides, google_mode, notice_rules } = settings;
  const saved = await request.post(`${base}/admin/availability`, { headers: { authorization }, data: { timezone, version, weekly, overrides, google_mode, notice_rules, meal_prep } });
  expect(saved.ok()).toBeTruthy();
  return (await saved.json()).settings;
}
test.beforeAll(async ({ request }) => {
  const response = await request.post(`${base}/auth/user/emailpass`, { data: { email: 'discovery@example.invalid', password: 'discovery-local-test-only' } });
  expect(response.ok()).toBeTruthy();
  authorization = `Bearer ${(await response.json()).token}`;
});
test.afterAll(async () => { await pool.end(); });
test.beforeEach(async ({ request }) => { await save(request, setup()); });

test('SD-01/07/11/12/14: real SSR, navigation and focus use fresh informational projection', async ({ page, request }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/meal-prep');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toBe('no-store');
  const html = await response!.text();
  expect(html).toContain('In-home cooking'); expect(html).toContain('Prepared meals with pickup');
  await expect(page.getByRole('heading', { name: 'Delivery', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meal Prep', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Menu preferences' })).toBeVisible();
  expect(await page.locator('input, select, form').count()).toBe(0);
  await page.screenshot({ path: info.outputPath('storefront-desktop.png'), fullPage: true });
  const pickup = setup(); pickup.methods.in_home.enabled = false; pickup.methods.delivery.enabled = false;
  pickup.selection_styles.package = false;
  await save(request, pickup);
  const reads: string[] = []; page.on('request', (r) => { if (r.resourceType() === 'fetch') reads.push(r.url()); });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'In-home cooking' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pickup', exact: true })).toBeVisible();
  expect(reads.filter((url) => url.includes('/api/meal-prep'))).toHaveLength(1);
  expect(reads.some((url) => /cart|customer|products|_root/.test(url))).toBe(false);
  await page.getByRole('link', { name: 'Our Menus', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Menus', exact: true })).toBeVisible();
  await save(request, setup());
  await page.getByRole('link', { name: 'Meal Prep', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('storefront-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'open navigation menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Sidebar' }).getByRole('link', { name: 'Meal Prep' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SD-04/05/06/08/17: off, malformed, missing and mixed methods render independently', async ({ page, request }, info) => {
  const off = setup(); Object.values(off.methods).forEach((method) => { method.enabled = false; });
  await save(request, off);
  await page.goto('/meal-prep');
  await expect(page.getByText('Meal Prep is not currently offered.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meal Prep', exact: true })).toHaveCount(0);
  await pool.query("update availability_setting set meal_prep = '{}' where id = 'chef-default'");
  await page.reload();
  await expect(page.getByText('Meal Prep information is currently unavailable.')).toBeVisible();
  const mixed: any = setup(); mixed.methods.delivery = { enabled: true }; mixed.methods.pickup.enabled = false;
  mixed.provider_secret = 'PRIVATE_PROVIDER'; mixed.household = { access: 'PRIVATE_ACCESS' };
  await pool.query('update availability_setting set meal_prep = $1 where id = $2', [JSON.stringify(mixed), 'chef-default']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In-home cooking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery', exact: true })).toHaveCount(0);
  expect(await page.content()).not.toMatch(/PRIVATE_PROVIDER|PRIVATE_ACCESS/);
  await page.screenshot({ path: info.outputPath('storefront-mixed.png'), fullPage: true });
  await save(request, null);
  await page.reload();
  await expect(page.getByText('Meal Prep is not currently offered.')).toBeVisible();
});

test('SD-09/10: database read failure stays 503, retry recovers, menus/root remain functional', async ({ page, request }, info) => {
  await page.goto('/meal-prep');
  await expect(page.getByRole('heading', { name: 'Pickup', exact: true })).toBeVisible();
  await pool.query('alter table availability_setting rename to discovery_outage_fixture');
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Meal Prep', exact: true })).toBeVisible();
    const status = await request.get('/api/meal-prep'); expect(status.status()).toBe(503);
    const direct = await request.get('/meal-prep'); expect(direct.status()).toBe(503);
    expect(await direct.text()).not.toContain('Meal Prep is not currently offered.');
    await page.screenshot({ path: info.outputPath('storefront-outage.png'), fullPage: true });
    expect((await request.get('/')).status()).toBe(200);
    expect((await request.get('/menus')).status()).toBe(200);
  } finally { await pool.query('alter table discovery_outage_fixture rename to availability_setting'); }
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Pickup', exact: true })).toBeVisible();
});

test('SD-02/13: actual Medusa Admin shows committed guidance, keeps unsaved changes and recovers lost response', async ({ page, request }, info) => {
  await page.goto(`${base}/app/login`);
  await page.getByPlaceholder('Email').fill('discovery@example.invalid');
  await page.getByPlaceholder('Password').fill('discovery-local-test-only');
  await page.getByRole('button', { name: 'Continue with Email', exact: true }).click();
  await expect(page.getByPlaceholder('Email')).toHaveCount(0);
  await page.goto(`${base}/app/settings/availability`);
  await page.getByRole('tab', { name: 'Meal Prep', exact: true }).click();
  const guidance = page.getByLabel('Committed Meal Prep discovery');
  await expect(guidance).toContainText('Delivery: Information visible');
  await expect(page.getByText('Draft', { exact: true })).toHaveCount(0);
  await expect(page.getByText('These preferences are not live yet.')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Enable Delivery' }).click();
  await expect(guidance).toContainText('Delivery: Information visible');
  await expect(guidance).toContainText('unsaved changes');
  // Let the real backend commit, then drop the response at the browser boundary.
  await page.route('**/admin/availability', async (route) => {
    if (route.request().method() === 'POST') { await route.fetch(); await route.abort('connectionfailed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(guidance).toContainText('Delivery: Not enabled');
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toHaveCount(0);
  await page.unroute('**/admin/availability');
  await page.screenshot({ path: info.outputPath('admin-committed.png'), fullPage: true });
  // Another editor commits while this editor retains its earlier optimistic version.
  await save(request, setup());
  await page.getByRole('switch', { name: 'Enable Pickup' }).click();
  await page.getByRole('button', { name: 'Save availability', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload saved settings (discard draft)' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Enable Pickup' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Reload saved settings (discard draft)' }).click();
  await expect(page.getByRole('switch', { name: 'Enable Pickup' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save availability', exact: true })).toHaveCount(0);
});
