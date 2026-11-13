// Production Admin assets with browser-intercepted synthetic APIs. No Medusa server,
// database, auth service or model calls. Run from the repository root after medusa build.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.BTS21_UI_EVIDENCE_DIR || '/tmp/bts21-ui-browser-evidence';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:9013';
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
  await new Promise(resolve => server.listen(9013, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1532, height: 1024 } });
  const errors = [], unknown = [], requests = [];
  let mode = 'events', release;
  let chatReply, conversational = false;
  let writeMode = 'saved', liveTime = '10:00';
  const writes = [];
  const op = '00000000-0000-4000-8000-000000000001';
  const local = time => ({ date: '2026-11-09', time, timezone: zone, instant: `2026-11-09T${time === '10:00' ? '16' : time === '11:00' ? '17' : '18'}:00:00.000Z` });
  const preview = id => ({ reference: 'fixture-signed-reference', operationId: op, eventId: id, expectedRevision: 'a'.repeat(32), expiresAt: new Date(Date.now() + 300000).toISOString(), current: local('10:00'), proposed: local('11:00'), reserved: false, googleAvailability: 'advisory' });
  const receipt = outcome => ({ outcome: { ...local('11:00'), operationId: op, eventId: 'synthetic-0', outcome, committedRevision: outcome === 'rejected' ? null : 'b'.repeat(32) }, historical: true, reserved: false, googleSync: outcome === 'saved' ? 'requested' : 'not_requested' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('medusa_admin_theme')) localStorage.setItem('medusa_admin_theme', 'dark'); });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/app')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/admin/chef-events/schedule-edit/')) {
      const action = url.pathname.split('/').at(-1), body = req.postDataJSON(); writes.push({ action, body });
      if (action === 'preview' && conversational) return writeMode === 'policy' ? json({ message: 'That arrival time is no longer available. Please choose another time.' }, 422) : json({ ...preview(body.eventId), current: { ...local('11:00'), date: '2026-11-30', instant: '2026-11-30T17:00:00.000Z' }, proposed: { ...local('11:00'), date: body.date || '2026-11-30', time: body.time || '11:00', instant: `${body.date || '2026-11-30'}T${body.time === '14:00' ? '20' : '17'}:00:00.000Z` } });
      if (action === 'preview') return writeMode === 'off' ? json({ message: 'unavailable' }, 403) : writeMode === 'policy' ? json({ message: 'ineligible' }, 422) : json(preview(body.eventId));
      assert.deepEqual(body, { reference: 'fixture-signed-reference' });
      if (writeMode === 'lost' && action === 'confirm') { liveTime = '11:00'; return route.abort('failed'); }
      if (writeMode === 'unknown') return json({ outcome: 'unknown', operationId: op }, 202);
      if (writeMode === 'off') return json({ message: 'unavailable' }, 403);
      if (writeMode === 'rejected') return json(receipt('rejected'), 409);
      if (writeMode === 'no_change') return json(receipt('no_change'));
      liveTime = '12:00'; // A later edit must not be overwritten by the historical 11:00 receipt.
      return json(receipt('saved'));
    }
    if (url.pathname === '/admin/chef-events/synthetic-0') {
      if (writeMode === 'refetch-failed') return json({ message: 'offline' }, 503);
      return json({ chefEvent: { id: 'synthetic-0', requestedDate: local(liveTime).instant, requestedTime: liveTime, timeZone: zone, status: 'pending' } });
    }
    if (url.pathname === '/admin/chef-ai/chat') {
      const body = req.postDataJSON(); requests.push(body);
      if (!conversational) assert.deepEqual(Object.keys(body), ['message']);
      if (mode === 'hold') await new Promise(resolve => { release = resolve; });
      if (chatReply) return json(typeof chatReply === 'function' ? chatReply(body) : chatReply);
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
  const dialog = page.getByRole('dialog');
  const change = index => dialog.getByRole('button', { name: 'Change date/time', exact: true }).nth(index).click();
  const edit = page.getByRole('form', { name: 'Change event date and time' });
  const button = name => dialog.getByRole('button', { name, exact: true });
  const quick = () => button("What's on my schedule this week?").click();
  async function ready() { await quick(); await change(0); await edit.getByLabel('Local time (optional)').fill('11:00'); await button('Preview').click(); await button('Confirm change').waitFor(); }
  async function bounds() {
    const box = await dialog.boundingBox(), viewport = page.viewportSize();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  }
  async function screenshot(name) { const focus = (await button('Confirm change').count()) ? button('Confirm change') : button('Done'); if (await focus.count()) await focus.scrollIntoViewIfNeeded(); await bounds(); await page.screenshot({ path: path.join(out, name + '.png') }); }
  async function fresh() { await page.reload(); await open(); }
  try {
    await page.goto(base + '/app/chef-events?date=2026-11-13'); await open();
    assert.equal(writes.length, 0); assert.equal(requests.length, 0);
    await ready();
    assert.deepEqual(writes[0], { action: 'preview', body: { eventId: 'synthetic-0', time: '11:00' } });
    assert.equal(await dialog.locator('article').count(), 5);
    assert.equal(await button('Change date/time').count(), 2);
    assert((await dialog.innerText()).includes('America/Chicago'));
    assert((await dialog.innerText()).includes('not reserved'));
    assert(!await page.getByText('fixture-signed-reference', { exact: false }).count());
    await screenshot('preview-dark-desktop');
    // Keyboard submit in the editor only previews, never confirms.
    await edit.getByLabel('Local time (optional)').focus(); await page.keyboard.press('Enter');
    await button('Confirm change').waitFor(); assert.equal(writes.filter(x => x.action === 'confirm').length, 0);
    await edit.getByLabel('Local time (optional)').fill('12:00');
    assert.equal(await button('Confirm change').count(), 0);
    await change(1); assert.equal(writes.length, 2);
    await edit.getByLabel('Date (optional)').fill('2026-11-10'); await button('Preview').click();
    await button('Confirm change').waitFor();
    assert.deepEqual(writes.at(-1), { action: 'preview', body: { eventId: 'synthetic-1', date: '2026-11-10' } });
    await page.keyboard.press('Escape'); assert.equal(await edit.count(), 0); assert(await dialog.isVisible());
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0);
    await open(); await change(0); await edit.getByLabel('Local time (optional)').fill('11:00'); await button('Preview').click();
    await button('Confirm change').evaluate(el => { el.click(); el.click(); });
    await dialog.getByText('Live event now · pending', { exact: true }).waitFor();
    assert.equal(writes.filter(x => x.action === 'confirm').length, 1);
    assert((await dialog.innerText()).includes('Local arrival 12:00'));
    assert((await dialog.innerText()).includes('Historical schedule snapshot'));
    assert((await dialog.innerText()).includes('synchronization is not verified'));
    await screenshot('saved-dark-desktop'); await button('Done').click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('medusa_admin_theme', theme), theme);
      await page.setViewportSize({ width: 390, height: 844 }); await fresh(); await ready();
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
      await screenshot(`preview-${theme}-mobile`); await button('Cancel edit').click();
    }
    // Commit + lost HTTP response, refresh to an empty chat, then recover the exact old reference.
    writeMode = 'lost'; await fresh(); await ready(); await button('Confirm change').click();
    await dialog.getByText('Outcome unknown', { exact: true }).waitFor();
    const beforeRefresh = writes.length; await fresh(); assert.equal(writes.length, beforeRefresh);
    assert(await dialog.getByText('What can I help you with?', { exact: true }).isVisible());
    assert.equal(await dialog.locator('article').count(), 0);
    const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('chef-schedule-attempt:')));
    assert.equal(stored.length, 1); assert(stored[0][1].includes('fixture-signed-reference'));
    assert(!stored[0][1].includes('Family supper'));
    writeMode = 'off'; await button('Recover outcome').click();
    await dialog.getByText(/does not prove the earlier save rolled back/).waitFor();
    writeMode = 'saved'; await button('Recover outcome').click();
    await dialog.getByText('Live event now · pending', { exact: true }).waitFor();
    assert((await dialog.innerText()).includes('Local arrival 12:00'));
    await screenshot('recovered-dark-mobile'); await button('Done').click();
    for (const [mode, text] of [['no_change', 'No change needed'], ['rejected', 'Rejected / stale preview'], ['refetch-failed', 'Current view unavailable. This historical outcome remains SAVED.']]) {
      writeMode = mode; await fresh(); await ready(); await button('Confirm change').click();
      await dialog.getByText(text, { exact: true }).waitFor(); await button('Done').click();
    }
    for (const mode of ['off', 'policy']) {
      writeMode = mode; await fresh(); await quick(); await change(0); await edit.getByLabel('Local time (optional)').fill('11:00'); await button('Preview').click();
      await dialog.getByRole('alert').waitFor(); assert.equal(await button('Confirm change').count(), 0);
      if (mode === 'off') assert((await dialog.innerText()).includes('Schedule changes are unavailable'));
    }
    writeMode = 'saved'; await fresh(); await ready();
    const confirmsBeforeStorageFailure = writes.filter(x => x.action === 'confirm').length;
    await page.evaluate(() => {
      window.fixtureStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (this === sessionStorage) throw new Error('fixture quota'); return window.fixtureStorageSetItem.call(this, key, value); };
    });
    await button('Confirm change').click(); await dialog.getByRole('alert').waitFor();
    assert((await dialog.innerText()).includes('No change was sent'));
    assert.equal(writes.filter(x => x.action === 'confirm').length, confirmsBeforeStorageFailure);
    await page.evaluate(() => { Storage.prototype.setItem = window.fixtureStorageSetItem; });
    await page.setViewportSize({ width: 320, height: 740 }); await bounds();
    // Conversational proposal uses the same production editor/transport; never a confirm tool.
    conversational = true; writeMode = 'saved'; mode = 'events';
    const intent = { target: 'context', date: { kind: 'day_of_month', day: 29 }, time: null, clarification: 'none' };
    const sole = { ...entries[0], requestedTime: { start: '2026-11-30T17:00:00.000Z', end: '2026-11-30T19:30:00.000Z' }, displayTime: { start: '2026-11-30T17:00:00.000Z', end: '2026-11-30T19:30:00.000Z' } };
    const context = { candidates: [{ id: 'synthetic-0', revision: 'a'.repeat(32) }], observedAt: Date.now() };
    const soleAnswer = { ...answer, message: '1 recorded event overlaps this window. These records do not determine availability.', range: { start: '2026-11-30T06:00:00.000Z', end: '2026-12-01T06:00:00.000Z' }, entries: [sole], editContext: context };
    const proposal = { entries: [], message: 'Review the proposed change below. Only Confirm change can save it.', editProposal: { eventId: 'synthetic-0', date: '2026-11-29', expectedRevision: 'a'.repeat(32) } };
    async function ask(text) { await dialog.locator('textarea').fill(text); await button('Send').click(); }
    const confirmsBeforeConversation = writes.filter(x => x.action === 'confirm').length;
    for (const theme of ['dark', 'light']) {
      for (const viewport of [{ width: 1532, height: 1024 }, { width: 390, height: 844 }]) {
        await page.evaluate(theme => localStorage.setItem('medusa_admin_theme', theme), theme);
        await page.setViewportSize(viewport); chatReply = soleAnswer; await fresh(); await quick();
        await button('Change date/time').waitFor();
        assert(await dialog.locator('article').evaluate(el => !!(el.querySelector('button').compareDocumentPosition(el.querySelector('details')) & Node.DOCUMENT_POSITION_FOLLOWING)));
        await screenshot(`conversational-card-${theme}-${viewport.width}`);
        const before = writes.length; chatReply = proposal; await ask('Can you move it to the 29th?');
        await button('Confirm change').waitFor();
        assert.deepEqual(requests.at(-1), { message: 'Can you move it to the 29th?', context });
        assert.equal(writes.length, before + 1);
        assert.deepEqual(writes.at(-1), { action: 'preview', body: { eventId: 'synthetic-0', date: '2026-11-29' } });
        assert.equal(await edit.getByLabel('Local time (optional)').inputValue(), '');
        assert((await dialog.innerText()).includes('2026-11-30'));
        assert((await dialog.innerText()).includes('2026-11-29'));
        await screenshot(`conversational-preview-${theme}-${viewport.width}`);
        chatReply = { entries: [], message: 'Use the explicit Confirm change button to save.' };
        await ask('yes'); await dialog.getByText(chatReply.message, { exact: true }).waitFor();
        await ask('confirm'); await button('Send').waitFor({ state: 'visible' });
        assert.equal(writes.filter(x => x.action === 'confirm').length, confirmsBeforeConversation);
      }
    }
    // Backend refusal retains exactly the requested Sunday, without inventing Monday.
    chatReply = soleAnswer; await fresh(); await quick(); await button('Change date/time').waitFor();
    writeMode = 'policy'; chatReply = proposal; await ask('Move it to the 29th');
    await dialog.getByRole('alert').waitFor();
    assert((await dialog.innerText()).includes('no longer available'));
    assert.equal(await edit.getByLabel('Date (optional)').inputValue(), '2026-11-29');
    assert.equal(await button('Confirm change').count(), 0);
    await screenshot('conversational-refusal-mobile');
    // One pending + one confirmed (same appearance) must be an explicit exact-ID choice.
    writeMode = 'saved';
    const other = { ...sole, id: 'presentation-other', source: { type: 'private-event', id: 'synthetic-2' }, status: 'confirmed' };
    const bothContext = { ...context, candidates: [...context.candidates, { id: 'synthetic-2', revision: 'a'.repeat(32) }] };
    chatReply = { ...soleAnswer, message: '2 recorded events overlap this window.', entries: [sole, other], editContext: bothContext }; await fresh(); await quick();
    await button('Change date/time').waitFor();
    chatReply = { entries: [], message: 'Which event?', editClarification: { intent, context: bothContext } };
    const beforeChoice = writes.length; await ask('Move it to the 29th');
    const choices = dialog.getByRole('region', { name: 'Choose event for proposed change' });
    await choices.waitFor(); assert.equal(writes.length, beforeChoice);
    assert((await choices.innerText()).includes('synthetic-0')); assert((await choices.innerText()).includes('synthetic-2'));
    chatReply = body => { assert.equal(body.selection.context.selectedId, 'synthetic-0'); return proposal; };
    await choices.getByRole('button', { name: 'Choose this event' }).first().click();
    await button('Confirm change').waitFor(); assert.equal(writes.length, beforeChoice + 1);
    // Late model reply after manual selection/cancel may not reopen the editor.
    chatReply = soleAnswer; await fresh(); await quick(); await button('Change date/time').waitFor();
    mode = 'hold'; chatReply = proposal; await ask('Move it to the 29th');
    await dialog.getByText('Checking your request…', { exact: true }).waitFor();
    await change(0); await button('Cancel edit').click();
    const beforeLate = writes.length; release(); mode = 'events';
    await dialog.getByText(/That proposal was discarded/).waitFor();
    assert.equal(writes.length, beforeLate); assert.equal(await edit.count(), 0);
    assert.equal(writes.filter(x => x.action === 'confirm').length, confirmsBeforeConversation);
    // Third-run owner prompts: unfinished 2 PM task -> date target clarification -> independent lookup.
    const timeProposal = { entries: [], message: 'Review this change before confirming.', editProposal: { eventId: 'synthetic-0', expectedRevision: 'a'.repeat(32), time: '14:00' } };
    for (const theme of ['dark', 'light']) {
      for (const viewport of [{ width: 1532, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        await page.evaluate(theme => localStorage.setItem('medusa_admin_theme', theme), theme);
        await page.setViewportSize(viewport); await fresh(); writeMode = 'saved';
        if (viewport.width > 640) {
          const normal = await dialog.boundingBox(); assert(normal.width <= 490);
          await button('Expand Sous Chef').click(); const expanded = await dialog.boundingBox();
          assert(expanded.width >= 620 && expanded.width <= 680); assert(expanded.height > normal.height);
          assert.equal(await button('Collapse Sous Chef').getAttribute('aria-expanded'), 'true');
        } else {
          const box = await dialog.boundingBox(); assert(box.width >= viewport.width - 20); assert(box.height >= viewport.height - 20); assert.equal(await button('Expand Sous Chef').isVisible(), false);
        }
        assert.equal(await dialog.locator('textarea').getAttribute('rows'), '1');
        const task = { version: 1, intent: { target: 'context', targetDate: null, date: null, time: '14:00', clarification: 'none', continuation: false }, expiresAt: Date.now() + 300000 };
        chatReply = { entries: [], message: 'Which event should I move to 2 PM?', editTask: task };
        const beforeOwner = writes.length; await ask('can you update the time to 2pm?');
        await dialog.getByText('Which event should I move to 2 PM?', { exact: true }).waitFor();
        await button('Cancel change').waitFor(); assert.equal(writes.length, beforeOwner);
        await screenshot(`owner-clarification-${theme}-${viewport.width}`);
        chatReply = body => { assert.equal(body.task.intent.time, '14:00'); assert.equal(body.message, 'this is for the event on the 30th'); return timeProposal; };
        await ask('this is for the event on the 30th'); await button('Confirm change').waitFor();
        assert.deepEqual(writes.at(-1), { action: 'preview', body: { eventId: 'synthetic-0', time: '14:00' } });
        assert.equal(await edit.getByLabel('Date (optional)').inputValue(), '');
        assert((await dialog.innerText()).includes('2026-11-30 · 14:00'));
        await screenshot(`owner-preview-${theme}-${viewport.width}`);
        await fresh();
        chatReply = body => { assert.deepEqual(body, { message: 'Can you update the event I have on the 30th to 2pm?' }); return timeProposal; };
        await ask('Can you update the event I have on the 30th to 2pm?'); await button('Confirm change').waitFor();
        assert.equal(writes.length, beforeOwner + 2);
        assert.equal(writes.filter(x => x.action === 'confirm').length, confirmsBeforeConversation);
        await page.keyboard.press('Escape'); assert.equal(await edit.count(), 0); assert(await dialog.isVisible());
        await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 0); await open();
      }
    }
    // Rejected 2 PM keeps only the proposed time in the same editable panel.
    await fresh(); writeMode = 'policy'; chatReply = timeProposal;
    await ask('Can you update the event I have on the 30th to 2pm?'); await dialog.getByRole('alert').waitFor();
    assert.equal(await edit.getByLabel('Local time (optional)').inputValue(), '14:00');
    assert.equal(await button('Confirm change').count(), 0);
    await screenshot('owner-policy-refusal-mobile');
    // Escape cancels only the typed task first; navigation remains nonmodal.
    await fresh(); writeMode = 'saved'; chatReply = { entries: [], message: 'Which event should I move to 2 PM?', editTask: { version: 1, intent: { target: 'context', date: null, time: '14:00', clarification: 'none' }, expiresAt: Date.now() + 300000 } };
    await ask('can you update the time to 2pm?'); await button('Cancel change').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await button('Cancel change').count(), 0); assert(await dialog.isVisible());
    assert.equal(await dialog.locator('textarea').evaluate(el => document.activeElement === el), true);
    assert.deepEqual(errors, []); assert.deepEqual(unknown, []);
    console.log(JSON.stringify({ passed: true, screenshots: out, previewRequests: writes.filter(x => x.action === 'preview').length, confirmRequests: writes.filter(x => x.action === 'confirm').length, recoverRequests: writes.filter(x => x.action === 'recover').length, unknownRoutes: unknown, browserErrors: errors }, null, 2));
  } catch (error) {
    console.error({ browserErrors: errors, unknownRoutes: unknown, pageText: await page.locator("body").innerText() });
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
