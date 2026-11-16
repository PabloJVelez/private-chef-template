// Production Admin assets with browser-intercepted synthetic APIs. No Medusa server,
// database, auth service or model calls. Run from the repository root after medusa build.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.SOUS_TYPING_EVIDENCE_DIR || '/tmp/sous-typing-browser-evidence';
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
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
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
      if (mode === 'greeting') return json({replyKind: 'greeting', message: 'Hey Chef! What can I help you with?', entries: []});
      if (mode === 'help') return json({replyKind: 'help', message: 'I can help with your schedule.', entries: []});
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
  try {
    await page.goto(base + '/app');
    await page.getByRole('button', { name: 'Ask Sous Chef', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const timings = [];
    for (const [kind, prompt] of [['greeting', 'Hello'], ['help', 'What can you help me with?']]) {
      mode = kind;
      await dialog.getByRole('textbox', {name:'Schedule question', exact:true}).fill(prompt);
      const start = Date.now();
      await dialog.getByRole('button', {name:'Send',exact:true}).click();
      const typing = dialog.getByRole('status', {name:'Sous Chef is typing'});
      await typing.waitFor({state:'visible'});
      assert.equal(await typing.locator('.chef-chat-typing > span').count(), 3);
      assert.equal(await typing.locator('.chef-chat-typing > span').first().evaluate(el => getComputedStyle(el).animationName), 'chef-chat-typing');
      await page.screenshot({path:path.join(out,kind+'-typing-dark.png')});
      await typing.waitFor({state:'hidden'});
      timings.push(Date.now()-start);
    }
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');});
    mode='greeting';
    await dialog.getByRole('textbox',{name:'Schedule question',exact:true}).fill('Hello');
    await dialog.getByRole('button',{name:'Send',exact:true}).click();
    const typing=dialog.getByRole('status',{name:'Sous Chef is typing'});
    await typing.waitFor();
    assert.equal(await typing.locator('.chef-chat-typing > span').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.screenshot({path:path.join(out,'typing-mobile-light-reduced-motion.png')});
    await typing.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    assert.deepEqual(unknown,[]);
    const result={synthetic:true,liveModel:false,timings,requests:requests.length,errors,unknown};
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
