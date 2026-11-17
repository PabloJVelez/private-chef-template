// Production Admin assets with browser-intercepted synthetic APIs. No Medusa server,
// database, auth service or model calls. Run from the repository root after medusa build.
const { chromium } = require('playwright');
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
  const browser = await chromium.launch({ headless: true });
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
  const dialog = page.getByRole('dialog');
  const button = name => dialog.getByRole('button', { name, exact: true });
  async function metrics() {
    return dialog.evaluate(el => {
      const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}; };
      const log = el.querySelector('.chef-chat-log');
      return { panel: rect(el), close: rect(el.querySelector('[aria-label="Close Sous Chef"]')),
        input: rect(el.querySelector("textarea")), log: rect(log), send: rect(el.querySelector('[aria-label="Send"]')), font: getComputedStyle(el.querySelector('textarea')).fontSize,
        active: document.activeElement?.tagName, innerWidth, scale: visualViewport.scale, welcome: el.querySelector('.chef-chat-log > div') ? rect(el.querySelector('.chef-chat-log > div')) : null, logWidth: log.clientWidth, logScrollWidth: log.scrollWidth, viewport: {height:visualViewport.height,top:visualViewport.offsetTop} };
    });
  }
  try {
    for (const [width,height] of (touch ? [[320,568],[360,640],[375,667],[390,844],[430,932],[667,320],[844,390],[768,1024],[1024,768]] : [[390,844],[1440,900]])) {
      for (const theme of ['light','dark']) {
        await page.setViewportSize({width,height});
        await page.goto(base + '/app');
        await page.evaluate(t => {document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t);},theme);
        await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();
        const opening = await metrics();
        console.log(JSON.stringify({width,height,theme,opening}));
        await page.screenshot({path:path.join(out,`opening-${width}-${theme}.png`)});
        if (!baseline) {
          assert.equal(opening.active, touch ? 'BUTTON' : 'TEXTAREA', 'Opening focus follows input capability');
          assert(opening.panel.x >= 0 && opening.panel.x + opening.panel.width <= width, 'Opening fits horizontally');
          assert(opening.logScrollWidth <= opening.logWidth + 1, 'Welcome fits horizontally');
          assert(opening.send.bottom <= height && opening.close.y >= 0 && opening.close.x + opening.close.width <= width, 'Opening controls visible');
          if (width <= 640) assert(opening.welcome.height <= 250, 'Compact phone welcome');
        }
        let openingKeyboard;
        if (touch && width <= 1024) {
          await dialog.getByRole('textbox', {name:'Schedule question',exact:true}).focus();
          const visibleHeight = Math.min(400, Math.max(230, height - 320));
          await page.evaluate(h => window.simulateKeyboard(h, 12), visibleHeight);
          await page.waitForTimeout(50);
          openingKeyboard = await metrics();
          if (!baseline && (width <= 640 || touch || height <= 480)) {
            assert(openingKeyboard.send.bottom <= visibleHeight + 12, 'Empty composer above modeled keyboard');
            assert(openingKeyboard.close.y >= 12, 'Empty Close above modeled keyboard');
          }
          if (width === 390 && theme === 'dark') {
            await page.evaluate(h => {
              const label = document.createElement('div'); label.id = 'opening-keyboard-label';
              label.textContent = 'SIMULATED KEYBOARD — no real device';
              label.style.cssText = `position:fixed;top:${h+12}px;bottom:0;left:0;right:0;z-index:9999;background:#cbd5e1;color:#0f172a;padding:16px;font:14px sans-serif`;
              document.body.append(label);
            }, visibleHeight);
            await page.screenshot({path:path.join(out,'opening-keyboard-model-390-dark.png')});
            await page.locator('#opening-keyboard-label').evaluate(el => el.remove());
          }
          if (width === 667 || width === 844) {
            for (const shortHeight of [180, 120, 90]) {
              await dialog.getByRole('textbox', {name:'Schedule question',exact:true}).fill('Landscape draft\nwith several\nlines retained');
              await page.evaluate(h => window.simulateKeyboard(h, 24), shortHeight);
              await page.waitForTimeout(50);
              const short = await metrics();
              for (const control of [short.input, short.send, short.close]) {
                assert(control.y >= 24 && control.bottom <= shortHeight + 24, 'Short-landscape controls inside visible viewport');
                assert(control.height >= 44, 'Short-landscape controls retain touch target');
              }
              assert(short.log.height > 0 && short.log.bottom <= short.input.y, 'Conversation retains separate scroll area');
              assert(short.send.x + short.send.width <= short.close.x, 'Send and Close do not overlap');
              await page.screenshot({path:path.join(out,`landscape-keyboard-${width}-${shortHeight}-${theme}.png`)});
              results.push({width,height,theme,shortHeight,short});
            }
            await dialog.getByRole('textbox', {name:'Schedule question',exact:true}).fill('');
          }
          await page.evaluate(() => window.simulateKeyboard(null));
          await button('Close Sous Chef').click();
          await page.getByRole('button',{name:'Ask Sous Chef',exact:true}).click();
          if (!baseline && touch) assert.notEqual((await metrics()).active, 'TEXTAREA', 'Reopen without keyboard');
          // Android-like layout viewport resize and rotation, without a viewport shim.
          await page.setViewportSize({width, height: visibleHeight});
          await page.waitForTimeout(50);
          if (!baseline) assert((await metrics()).send.bottom <= visibleHeight, 'Layout resize keeps Send visible');
          await page.setViewportSize({width: height, height: width});
          await page.waitForTimeout(50);
          const rotated = await metrics();
          if (!baseline) assert(rotated.panel.x >= 0 && rotated.panel.x + rotated.panel.width <= height && rotated.send.bottom <= width, 'Rotation fits');
          await page.setViewportSize({width,height});
        }
        // Give the actual Admin main scroller a deterministic tall synthetic page.
        await page.locator('main').evaluate(el => { const spacer=document.createElement('div');spacer.style.cssText='height:2000px;flex-shrink:0';spacer.setAttribute('aria-hidden','true');el.append(spacer);el.scrollTop=100; });
        await button("What's on my schedule this week?").click();
        await button('Change date/time').first().click();
        await dialog.getByLabel('Local time (optional)').fill('11:00');
        await button('Confirm change').waitFor();
        await button('Confirm change').scrollIntoViewIfNeeded();
        const closed = await metrics();
        const date = await dialog.locator('input[type=date]').boundingBox();
        const time = await dialog.locator('input[type=time]').boundingBox();
        if (width === 320) assert(time.y >= date.y + date.height, '320px date/time stack');
        if (width === 320 && theme === 'light') await page.screenshot({path:path.join(out,'preview-320-light.png')});
        if (width === 1440 && theme === 'dark') await page.screenshot({path:path.join(out,'preview-desktop-dark.png')});
        if (!baseline) {
          assert(closed.logScrollWidth <= closed.logWidth + 1, 'Long preview stays within chat');
          assert(closed.panel.y >= 0 && closed.panel.bottom <= height, 'Panel fits');
          if (width <= 640 || height <= 480) {
            assert(closed.close.height >= 44 && closed.close.width >= 44, 'Close touch target');
            assert(closed.send.height >= 44, 'Send touch target');
            assert.equal(closed.font, '16px', 'Avoid mobile input zoom');
          }
        }
        // Existing long Admin surface: chat wheel gestures must not chain to it.
        const underlying = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => !el.closest('.chef-chat-panel') && el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)).map(el => ({el,top:el.scrollTop})).map(({el,top},i) => {el.dataset.mobileScrollProbe=String(i);return top;}));
        assert(underlying.length > 0, 'Exercise a scrollable underlying Admin surface');
        const log = dialog.locator('.chef-chat-log');
        await log.evaluate(el => el.scrollTop = el.scrollHeight);
        await log.hover(); await page.mouse.wheel(0,700); await page.waitForTimeout(150);
        assert.deepEqual(await page.locator('[data-mobile-scroll-probe]').evaluateAll(els => els.map(el=>el.scrollTop)),underlying);
        // Confirm remains a physical button; a new turn revokes the unused preview.
        await dialog.getByRole('textbox', {name:'Schedule question',exact:true}).fill('What is on my schedule?');
        await button('Send').click();
        await button('Confirm change').waitFor({state:'hidden'});
        assert.equal(writes.filter(x => x.action !== 'preview').length,0);
        const afterTurn = await metrics();
        if (!baseline) assert(afterTurn.close.y >= afterTurn.panel.y, 'Answer scroll keeps header reachable');
        let keyboard;
        if (width < 700) {
          await dialog.getByRole('textbox',{name:'Schedule question',exact:true}).fill('Next question');
          const visibleHeight = Math.max(210,height-300);
          await page.evaluate(h => window.simulateKeyboard(h,12),visibleHeight);
          await page.waitForTimeout(60);
          keyboard = await metrics();
          // Draw a clearly labeled occlusion area for the simulation evidence.
          await page.evaluate(h => {
            const key = document.createElement('div'); key.id='keyboard-simulation';
            key.textContent='SIMULATED KEYBOARD — no real device';
            Object.assign(key.style,{position:'fixed',top:(h+12)+'px',bottom:'0',left:'0',right:'0',zIndex:'9999',background:'#cbd5e1',color:'#0f172a',padding:'16px',font:'14px sans-serif'});document.body.append(key);
          },visibleHeight);
          if (width === 390 && theme === 'dark') await page.screenshot({path:path.join(out,'keyboard-model-390-dark.png')});
          if (!baseline) {
            assert(keyboard.send.bottom <= visibleHeight+12, 'Send above simulated keyboard');
            assert(keyboard.close.y >= 12, 'Close within visual viewport');
            await button('Send').click({trial:true});
            await button('Close Sous Chef').click({trial:true});
          }
          await page.evaluate(() => {document.getElementById('keyboard-simulation').remove();window.simulateKeyboard(null);});
        }
        results.push({width,height,theme,opening,openingKeyboard,closed,afterTurn,keyboard,backgroundScrollContainers:underlying.length});
        await button('Close Sous Chef').click();
      }
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(unknown,[]);
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline,touch,emulation:true,results,errors,unknown},null,2));
    console.log(JSON.stringify({baseline,cases:results.length,errors,unknown}));
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
