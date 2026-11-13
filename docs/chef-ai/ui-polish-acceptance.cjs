// Production Admin assets with browser-intercepted synthetic APIs. No Medusa server,
// database, auth service or model calls. Run from the repository root after medusa build.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.BTS11_UI_EVIDENCE_DIR || '/tmp/bts11-ui-evidence';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:9012';
const zone = 'America/Chicago';
const range = { start: '2026-11-09T06:00:00.000Z', end: '2026-11-16T06:00:00.000Z' };
const entries = ['pending', 'pending', 'confirmed', 'cancelled', 'completed'].map((status, i) => {
  const start = `2026-11-${String(9 + i).padStart(2, '0')}T22:00:00.000Z`;
  const end = `2026-11-${String(10 + i).padStart(2, '0')}T00:30:00.000Z`;
  const requestedTime = { start, end };
  return { id: `synthetic-${i}`, source: { type: 'private-event', id: `synthetic-${i}` }, detailPath: `/chef-events/synthetic-${i}`,
    title: ['Family supper', 'Family supper', 'Autumn dinner', 'Garden lunch', 'Birthday celebration'][i],
    category: 'plated_dinner', status, timeZone: zone, displayTime: requestedTime, requestedTime,
    appointmentTime: ['confirmed', 'completed'].includes(status) ? requestedTime : null,
    protectedTime: i === 0 || i === 2 ? [{ start: start.replace('22:00', '21:30'), end: end.replace('00:30', '01:00'), state: i === 0 ? 'held' : 'confirmed' }] : [],
  };
});
const answer = { message: '5 recorded events overlap this window. All statuses are included. These records do not determine availability.', period: 'this_week', range, timeZone: zone, complete: true, entries };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, base);
  const file = url.pathname.startsWith('/app/assets/') ? path.join(root, 'assets', path.basename(url.pathname)) : path.join(root, 'index.html');
  if (!url.pathname.startsWith('/app') || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(file);
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' })[ext] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(9012, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1532, height: 1024 } });
  const errors = [], unknown = [], requests = [];
  let mode = 'events', release;
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('medusa_admin_theme', 'dark'));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/app')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/admin/chef-ai/chat') {
      const body = req.postDataJSON(); requests.push(body);
      assert.deepEqual(Object.keys(body), ['message']);
      if (mode === 'hold') await new Promise(resolve => { release = resolve; });
      if (mode === 'error') return json({ message: 'Synthetic unavailable response' }, 503);
      return json(mode === 'empty' ? { ...answer, entries: [], message: 'No matching recorded events in this window. This does not mean you are free or available.' } : answer);
    }
    if (/^\/admin\/layouts\/(sidebar|topbar)\/configuration$/.test(url.pathname)) return json({ message: 'No saved fixture layout' }, 404);
    const responses = {
      '/admin/layouts/configurations': { configurations: [], count: 0, limit: 10, offset: 0 },
      '/admin/users/me': { user: { id: 'synthetic-admin', email: 'chef@example.invalid', first_name: 'Chef', last_name: 'Demo' } },
      '/admin/modules': { modules: [] }, '/admin/feature-flags': { feature_flags: {} },
      '/admin/stores': { stores: [{ id: 'store-fixture', name: 'Chef workspace', supported_currencies: [{ currency_code: 'usd', is_default: true }] }], count: 1, limit: 10, offset: 0 },
      '/admin/notifications': { notifications: [], count: 0, limit: 10, offset: 0 },
      '/admin/chef-workspace/calendar': { entries, range, complete: true },
      '/admin/google-calendar': { status: 'not_connected', pendingIncidents: [] },
      '/admin/menus': { menus: [], count: 0, limit: 10, offset: 0 },
      '/admin/experience-types': { experience_types: [], count: 0, limit: 10, offset: 0 },
      '/admin/chef-events/synthetic-0': { chef_event: { id: 'synthetic-0', firstName: 'Family', lastName: 'Supper', status: 'pending', requestedDate: entries[0].displayTime.start, estimatedDuration: 150, timeZone: zone, partySize: 4, eventType: 'plated_dinner', locationType: 'customer_location', notes: '', specialRequirements: '' } },
    };
    if (url.pathname in responses) return json(responses[url.pathname]);
    unknown.push(`${req.method()} ${url.pathname}`);
    return json({ message: 'Unmocked validation route' }, 404);
  });
  const open = () => page.getByRole('button', { name: 'Ask Sous Chef', exact: true }).click();
  const close = () => page.getByRole('button', { name: 'Close Sous Chef', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const quick = page.getByRole('button', { name: "What's on my schedule this week?", exact: true });
  async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); }
  async function bounds() {
    const box = await dialog.boundingBox(), viewport = page.viewportSize();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    assert(box.height <= Math.min(740, viewport.height * .75) + 1);
    const form = await dialog.locator('form').boundingBox();
    assert(form.y >= box.y && form.y + form.height <= box.y + box.height + 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  async function settleAnswer() { await page.getByText('Reading your recorded schedule…', { exact: true }).waitFor({ state: 'hidden' }); }
  try {
    await page.goto(base + '/app/chef-events?date=2026-11-13');
    await open();
    assert.equal(requests.length, 0);
    assert.equal(await dialog.getByRole('button', { name: /What's on my schedule|What do I have/ }).count(), 4);
    await page.waitForFunction(() => document.activeElement?.id === 'chef-schedule-question');
    await bounds();
    const emptyHeight = (await dialog.boundingBox()).height;
    assert(emptyHeight < 600); // Content-led welcome, not a forced full-height panel.
    await shot('welcome-dark-desktop');
    mode = 'hold';
    await quick.evaluate(button => { button.click(); button.click(); });
    await page.getByText('Reading your recorded schedule…', { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { message: "What's on my schedule this week?" });
    assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
    while (!release) await new Promise(resolve => setTimeout(resolve, 10));
    release(); await settleAnswer(); mode = 'events';
    assert.equal(await dialog.locator('article').count(), 5);
    assert.equal(await dialog.getByRole('link', { name: 'Family supper', exact: true }).count(), 2);
    for (const label of ['Pending request', 'Confirmed appointment', 'Cancelled event', 'Completed appointment']) assert(await dialog.getByText(label, { exact: true }).first().isVisible());
    assert.equal(await dialog.locator('details[open]').count(), 0);
    const windowSummary = dialog.locator('summary[aria-label^="Exact schedule window:"]');
    await windowSummary.click();
    assert((await windowSummary.locator('..').innerText()).includes('Nov 9, 2026, 12:00 AM CST'));
    assert((await windowSummary.locator('..').innerText()).includes('Nov 16, 2026, 12:00 AM CST'));
    await windowSummary.click();
    assert(!await dialog.getByText('No appointment recorded', { exact: true }).first().isVisible());
    await bounds();
    assert(await page.getByRole('log').evaluate(el => el.scrollHeight > el.clientHeight));
    await shot('schedule-dark-desktop');
    const details = dialog.locator('article summary').first();
    await details.focus(); await page.keyboard.press('Enter');
    assert(await dialog.locator('article details').first().getAttribute('open') !== null);
    assert(await dialog.getByText('No appointment recorded', { exact: true }).first().isVisible());
    assert((await dialog.locator('article details').first().innerText()).includes('Held:'));
    assert((await dialog.locator('article details').first().innerText()).includes('3:30 PM'));
    await shot('details-dark-desktop');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Ask Sous Chef');
    await page.locator('a[href="/app/menus"]').first().click();
    await page.waitForURL('**/app/menus'); await open();
    assert.equal(requests.length, 1); assert.equal(await dialog.locator('article').count(), 5);
    // Actual dashboard theme control, not a chat-specific palette.
    await close(); await page.getByRole('button', { name: /Chef Demo/ }).click();
    await page.getByRole('menuitem', { name: /theme/i }).hover();
    await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await open(); await shot('schedule-light-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await bounds(); await shot('schedule-light-mobile');
    await page.reload(); await open();
    assert.equal(await dialog.locator('article').count(), 0); assert.equal(requests.length, 1);
    await bounds(); await shot('welcome-dark-mobile');
    await page.setViewportSize({ width: 320, height: 568 }); await bounds(); await shot('welcome-narrow-mobile');
    // Composer keyboard behavior, empty caution and error readability.
    const input = page.getByLabel('Schedule question', { exact: true });
    await input.fill("What's on my schedule tomorrow?"); await input.press('Shift+Enter');
    assert((await input.inputValue()).endsWith('\n')); assert.equal(requests.length, 1);
    mode = 'empty'; await input.press('Enter'); await settleAnswer();
    assert.equal(requests.length, 2); assert(await dialog.getByText(/does not mean you are free or available/).isVisible());
    mode = 'error'; await input.fill("What's on my schedule today?"); await input.press('Enter'); await settleAnswer();
    assert(await dialog.getByRole('alert').isVisible()); await bounds();
    // Return to the earlier event link in the same transcript after a fresh fixture response.
    mode = 'events'; await input.fill("What's on my schedule this week?"); await input.press('Enter'); await settleAnswer();
    await dialog.getByRole('link', { name: 'Family supper', exact: true }).first().click();
    await page.waitForURL('**/app/chef-events/synthetic-0');
    assert.equal(await dialog.count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unknown, []);
    console.log('PASS built Admin: no open call; four quick prompts; one request on double tap; latest message only; all statuses/duplicate requests; keyboard Details; exact intervals; focus/Escape; navigation/history; light/dark; 1532x1024, 390x844, 320x568 bounds; composer/scroll; refresh; empty/error; direct link.');
    console.log('API/auth/calendar/model responses are synthetic browser mocks. No live backend, database or model was used.');
  } catch (error) {
    console.error(error.message, '\nUnmocked routes:', unknown, '\nPage errors:', errors);
    await shot('failure'); throw error;
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
