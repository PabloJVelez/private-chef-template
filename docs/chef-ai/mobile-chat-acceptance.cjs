// Production Admin assets with browser-intercepted synthetic APIs. No Medusa server,
// database, auth service or model calls. Run from the repository root after medusa build.
const { chromium } = require(process.env.PREVIEW_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const out = process.env.MOBILE_EVIDENCE_DIR || '/tmp/bts22-mobile';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:9022';
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
  await new Promise(resolve => server.listen(9022, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PREVIEW_CHROMIUM_PATH, args: ['--no-sandbox', '--no-proxy-server'] });
  const touch = process.env.MOBILE_POINTER !== 'mouse';
  const page = await browser.newPage({ viewport: { width: 1532, height: 1024 }, hasTouch: touch, isMobile: touch });
  const errors = [], unknown = [], requests = [];
  const liveTime = '10:00';
  const writes = [];
  const op = '00000000-0000-4000-8000-000000000001';
  const local = time => ({ date: '2026-11-09', time, timezone: zone, instant: `2026-11-09T${time === '10:00' ? '16' : time === '11:00' ? '17' : '18'}:00:00.000Z` });
  const preview = id => ({ target: { id, title: 'VeryLongUnbrokenSyntheticEventTitle'.repeat(4), status: 'pending', revision: 'a'.repeat(32) }, reference: 'fixture-signed-reference', operationId: op, eventId: id, expectedRevision: 'a'.repeat(32), expiresAt: new Date(Date.now() + 300000).toISOString(), current: local('10:00'), proposed: local('11:00'), reserved: false, googleAvailability: 'advisory' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('medusa_admin_theme')) localStorage.setItem('medusa_admin_theme', 'dark'); });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/app')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/admin/chef-events/schedule-edit/')) {
      const action = url.pathname.split('/').at(-1), body = req.postDataJSON(); writes.push({ action, body });
      assert.equal(action, 'preview', 'Mobile layout checks must never write');
      return json({ ...preview(body.eventId), proposed: { ...local(body.time || '10:00'), date: body.date || '2026-11-09' } });
    }
    if (url.pathname === '/admin/chef-events/synthetic-0') {
      return json({ chefEvent: { id: 'synthetic-0', requestedDate: local(liveTime).instant, requestedTime: liveTime, timeZone: zone, status: 'pending' } });
    }
    if (url.pathname === '/admin/chef-ai/chat') {
      const body = req.postDataJSON(); requests.push(body);
      return json(answer);
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
  const baseline = process.env.MOBILE_BASELINE === '1';
  const results = [];
  // Overlay-keyboard model: layout viewport stays unchanged while visual viewport
  // shrinks/pans. This is a deterministic DOM simulation, NOT a native keyboard.
  await page.addInitScript(() => {
    const native = window.visualViewport;
    const viewport = new EventTarget();
    let simulated;
    for (const key of ['height', 'offsetTop', 'scale']) Object.defineProperty(viewport, key, {get: () => simulated?.[key] ?? native[key]});
    for (const type of ['resize', 'scroll']) native.addEventListener(type, () => viewport.dispatchEvent(new Event(type)));
    Object.defineProperty(window, 'visualViewport', { value: viewport });
    window.simulateKeyboard = (height, offsetTop = 0) => {
      simulated = height === null ? undefined : {height, offsetTop, scale: 1};
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });

  try {
    for (const [width,height] of (touch ? [[320,568],[390,844],[430,932],[667,320],[844,390],[768,1024],[1024,768]] : [[1440,900]])) {
      for (const theme of ['light','dark']) {
        const phone = width <= 640 || (touch && width <= 960 && height <= 500);
        await page.setViewportSize({width,height});
        await page.goto(base + '/app');
        await page.waitForLoadState('networkidle');
        const from = page.url();
        await page.evaluate(t => {document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t);},theme);
        await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();
        const surface = phone ? page.getByRole('main', {name:'Sous Chef',exact:true}) : page.getByRole('dialog');
        await surface.waitFor();
        const close = surface.getByRole('button',{name:phone?'Back from Sous Chef':'Close Sous Chef',exact:true});
        const input = surface.getByRole('textbox',{name:'Schedule question',exact:true});
        if (phone) {
          assert.equal(new URL(page.url()).pathname, '/app/sous-chef');
          assert.equal(await page.getByRole('dialog').count(), 0);
          assert.equal(await page.locator('.chef-chat-launcher').count(), 0);
          assert.equal(await page.locator('body').evaluate(e=>e.style.position), '');
          assert.equal(await surface.evaluate(e=>getComputedStyle(e).position), 'static');
        } else assert.equal(page.url(),from);
        await surface.getByRole('button',{name:"What's on my schedule today?",exact:true}).click();
        await surface.getByText('Family supper',{exact:true}).first().waitFor();
        await input.fill('A draft\nthat survives rotation');
        if (phone) {
          for (const visible of [300,220,180,120,60,45]) {
            await page.evaluate(h=>window.simulateKeyboard(h), visible);
            await page.waitForTimeout(30);
            const geometry = await surface.evaluate(el=>{
              const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
              return {page:box(el),input:box(el.querySelector('textarea')),send:box(el.querySelector('[aria-label="Send"]')),log:box(el.querySelector('[role="log"]')),bodyPosition:document.body.style.position};
            });
            assert(geometry.input.height>=44 && geometry.send.height>=44);
            assert(geometry.input.bottom<=geometry.page.bottom+1, 'Composer is not clipped by page');
            assert(geometry.log.height>0, 'Conversation is never hidden by a special mode');
            assert.equal(geometry.bodyPosition,'');
            if(visible>=180) assert(geometry.send.bottom<=visible+1);
            // Tiny models use natural document scrolling, not all controls at once.
            await surface.getByRole('button',{name:'Send',exact:true}).click({trial:true});
            results.push({width,height,theme,visible,geometry});
          }
          await page.evaluate(()=>window.simulateKeyboard(null));
          await page.setViewportSize({width:height,height:width});
          assert.equal(await input.inputValue(),'A draft\nthat survives rotation');
          await page.setViewportSize({width,height});
        }
        await page.screenshot({path:path.join(out,`page-${width}-${theme}.png`)});
        await close.click();
        assert.equal(page.url(),from);
        if(phone) {
          await page.goForward();
          await surface.waitFor();
          assert.equal(await input.inputValue(),'A draft\nthat survives rotation');
          await page.goBack();
          await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).waitFor();
        }
        await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();
        assert.equal(await input.inputValue(),'A draft\nthat survives rotation');
        assert((await surface.getByRole('log').innerText()).includes('Family supper'));
        await close.click();
        results.push({width,height,theme,phone,navigationAndDraft:true});
      }
    }
    // Direct route and reload resolve without the dashboard shell or a dialog.
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/app/sous-chef');
    await page.getByRole('main',{name:'Sous Chef',exact:true}).waitFor();
    await page.reload();
    await page.getByRole('main',{name:'Sous Chef',exact:true}).waitFor();
    await page.getByRole('button',{name:'Back from Sous Chef',exact:true}).click();
    await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    assert.deepEqual(unknown,[]);
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({touch,emulation:true,results,errors,unknown},null,2));
    console.log(JSON.stringify({cases:results.length,errors,unknown}));
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
