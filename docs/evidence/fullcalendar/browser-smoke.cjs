/** Built Admin browser fixture. No live backend/providers or owner data.
 * Run from repo root: PLAYWRIGHT_MODULE=/path/to/playwright node docs/evidence/fullcalendar/browser-smoke.cjs
 * Requires a completed Medusa build and Playwright Chromium installation.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('apps/medusa/.medusa/server/public/admin');
const output = path.resolve('docs/evidence/fullcalendar');
const entry = (id, start, end, status = 'confirmed', title = id) => ({
  id: `private-event:${id}`, source: { type: 'private-event', id }, detailPath: `/chef-events/${id}`,
  title, category: 'plated_dinner', status, timeZone: 'America/Chicago',
  requestedTime: { start, end }, appointmentTime: status === 'pending' ? null : { start, end },
  displayTime: { start, end }, protectedTime: status === 'pending' ? [] : [{ start, end, state: 'confirmed' }],
});
const entries = [
  ...Array.from({ length: 6 }, (_, i) => entry(`busy-${i}`, `2026-11-10T${String(16+i).padStart(2,'0')}:00:00Z`, `2026-11-10T${String(17+i).padStart(2,'0')}:00:00Z`, i % 2 ? 'pending' : 'confirmed', ['Rivera dinner','Chen celebration','Morgan tasting','Patel dinner','Lewis reception','Kim gathering'][i])),
  entry('late-nov-29','2026-11-29T22:00:00Z','2026-11-30T01:00:00Z','confirmed','Sunday dinner'),
  entry('late-nov-30','2026-11-30T23:00:00Z','2026-12-01T02:00:00Z','pending','Monday request'),
  entry('overnight','2026-11-14T05:00:00Z','2026-11-14T08:00:00Z','confirmed','Overnight service'),
  entry('crossing','2026-11-01T04:00:00Z','2026-11-01T07:00:00Z','confirmed','Crossing month start'),
  entry('spring','2027-03-14T08:30:00Z','2027-03-14T09:30:00Z','confirmed','Spring DST dinner'),
  entry('fall','2027-11-07T07:30:00Z','2027-11-07T08:30:00Z','confirmed','Fall DST dinner'),
];
async function main() {
  const server = http.createServer((req,res) => {
    let file = path.join(root, new URL(req.url, 'http://localhost').pathname.replace(/^\/app\/?/,''));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root,'index.html');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Chicago' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], requests = [], checks = [];
    page.on('pageerror', e => errors.push({url:page.url(),message:e.message}));
    let mode = 'normal';
    let delayed;
    await page.route('**/admin/**', async route => {
      const u = new URL(route.request().url()), key = u.pathname;
      let body = {};
      if (key === '/admin/users/me') body = { user: { id:'test-admin',email:'fixture@example.test',first_name:'Calendar',last_name:'Fixture' } };
      else if (key === '/admin/stores') body = { stores:[{id:'store',name:'Chef Workspace',supported_currencies:[{currency_code:'usd',is_default:true}]}],count:1 };
      else if (key === '/admin/google-calendar') body = { status:'active',pendingIncidents:[] };
      else if (key === '/admin/chef-workspace/calendar') {
        requests.push(Object.fromEntries(u.searchParams));
        if (mode === 'delay') await new Promise(resolve => { delayed = resolve; });
        if (mode === 'error') { await route.fulfill({status:503,json:{message:'Fixture calendar timeout'}});return; }
        const start = Date.parse(u.searchParams.get('start')), end = Date.parse(u.searchParams.get('end'));
        const statuses = u.searchParams.get('statuses').split(',');
        body = { complete:mode !== 'incomplete', range:{start:u.searchParams.get('start'),end:u.searchParams.get('end')}, entries:mode === 'incomplete' ? [] : entries.filter(e => statuses.includes(e.status) && Date.parse(e.displayTime.start) < end && Date.parse(e.displayTime.end) > start) };
      } else if (key.startsWith('/admin/chef-events/')) body = { chef_event: {} };
      else { const collection=key.split('/').pop().replaceAll('-','_');body={ [collection]:[],count:0,limit:20,offset:0 }; }
      await route.fulfill({json:body});
    });
    const goto = async query => {
      await page.goto(`${base}/app/chef-events?${query}`);
      await page.locator('.chef-workspace-calendar[aria-busy="false"]').waitFor();
    };
    const shot = name => page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});
    const ready = () => page.locator('.chef-workspace-calendar[aria-busy="false"]').waitFor();
    await goto('date=2026-11-10&view=month');
    assert.equal(requests.at(-1).start,'2026-11-01T05:00:00.000Z');
    assert.equal(requests.at(-1).end,'2026-12-06T06:00:00.000Z');
    assert.equal(await page.locator('[data-date="2026-11-29"]').count(),1);
    assert.equal(await page.locator('[data-date="2026-11-30"]').count(),1);
    assert.equal(await page.locator('[data-date="2026-10-18"]').count(),0);
    await page.getByText('Sunday dinner',{exact:true}).waitFor();
    await page.getByText('Monday request',{exact:true}).waitFor();
    await page.getByText('Crossing month start',{exact:true}).waitFor();
    assert.ok(await page.locator('.fc-daygrid-more-link').count());
    await page.evaluate(()=>localStorage.setItem('medusa_admin_theme','light')); await page.reload(); await ready();
    await shot('month-light');
    await page.evaluate(()=>localStorage.setItem('medusa_admin_theme','dark')); await page.reload(); await ready();
    await shot('month-dark');
    await page.locator('.fc-daygrid-more-link').first().click();
    await page.locator('.fc-popover').waitFor();
    assert.equal(await page.locator('.fc-popover .fc-event').count(),6);
    await shot('overflow-dark');
    await page.locator('.fc-popover-close').click();
    checks.push('November dates, crossing interval, busy-day overflow, light/dark');

    const dateButton=page.getByRole('button',{name:'Show day for Tuesday, November 10, 2026',exact:true});
    await dateButton.focus(); await page.keyboard.press('Enter'); await ready();
    assert.ok(page.url().includes('view=day'));
    assert.ok(page.url().includes('date=2026-11-10'));
    await page.locator('.fc-timeGridDay-view').waitFor();
    assert.equal(await page.locator('.fc-event-resizer').count(),0);
    await shot('day-dark');
    await page.goBack(); await ready();
    await page.locator('.fc-dayGridMonth-view').waitFor();
    await page.goForward(); await ready();
    await page.locator('.fc-timeGridDay-view').waitFor();
    checks.push('keyboard date drilldown, URL Back/Forward, read-only day view');

    await goto('date=2027-03-14&view=day');
    assert.equal((Date.parse(requests.at(-1).end)-Date.parse(requests.at(-1).start))/3600000,23);
    await page.getByText('Spring DST dinner',{exact:true}).waitFor();
    await goto('date=2027-11-07&view=day');
    assert.equal((Date.parse(requests.at(-1).end)-Date.parse(requests.at(-1).start))/3600000,25);
    await page.getByText('Fall DST dinner',{exact:true}).waitFor();
    checks.push('spring/fall DST day ranges: 23/25 hours');
    await goto('date=2026-11-14&view=day');
    await page.getByText('Overnight service',{exact:true}).waitFor();
    checks.push('overnight interval visible on following day');

    await goto('date=2026-11-10&view=agenda');
    assert.equal(requests.at(-1).end,'2026-12-11T06:00:00.000Z');
    await page.locator('.fc-list-event button').first().focus(); await page.keyboard.press('Enter');
    await page.waitForURL(/\/app\/chef-events\/busy-/);
    checks.push('legacy 31-date agenda link, keyboard native detail routing');

    await goto('date=2026-11-10&view=month&statuses=completed');
    assert.equal(await page.locator('.fc-event').count(),0);
    assert.equal(requests.at(-1).statuses,'completed');
    await page.getByRole('button',{name:'Day',exact:true}).click(); await ready();
    assert.ok(page.url().includes('statuses=completed'));
    assert.ok((await page.locator('.workspace-calendar-state').innerText()).includes('No events'));
    checks.push('initial status filter, view-change preservation, empty state');
    await goto('date=2026-11-10&view=month');
    mode='delay';
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.locator('.chef-workspace-calendar[aria-busy="true"]').waitFor();
    assert.equal(await page.locator('.fc-event').count(),0);
    mode='normal';
    await page.getByRole('button',{name:'Next',exact:true}).click(); await ready();
    delayed?.();
    await page.waitForTimeout(150);
    assert.ok(page.url().includes('2027-01'));
    assert.equal(await page.locator('.fc-event').count(),0);
    checks.push('fast navigation clears old results and ignores late response');

    mode='error'; await goto('date=2026-11-10&view=agenda');
    await page.getByRole('alert').filter({hasText:'Calendar unavailable'}).waitFor();
    assert.ok(!(await page.locator('.chef-workspace-calendar').innerText()).includes('No events'));
    await shot('error');
    mode='normal'; await page.getByRole('button',{name:'Retry',exact:true}).click(); await ready();
    await page.locator('.fc-list-event').first().waitFor();
    mode='incomplete'; await goto('date=2026-11-10&view=agenda');
    await page.getByRole('alert').filter({hasText:'Too many events'}).waitFor();
    await shot('incomplete');
    assert.equal(await page.locator('.fc-event').count(),0);
    mode='normal'; await page.getByRole('button',{name:'Retry',exact:true}).click(); await ready();
    checks.push('failure/incomplete are not empty success; retry recovers');

    await page.setViewportSize({width:390,height:844});
    await goto('date=2026-11-10');
    await page.locator('.fc-workspaceAgenda-view').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await shot('mobile-agenda');
    await page.getByRole('button',{name:'Month',exact:true}).click(); await ready();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await shot('mobile-month');
    checks.push('mobile default agenda, mobile month, no page overflow');
    assert.ok(requests.every(r=>r.start && r.end && !('limit' in r)));
    // Detail-page fixture is intentionally incomplete; capture errors elsewhere only.
    const unexpected=errors.filter(e=>!new URL(e.url).pathname.startsWith('/app/chef-events/busy-'));
    assert.deepEqual(unexpected,[]);
    const result={checks,requests,errors,limits:'Synthetic API and Admin identity/Google fixtures against real production Admin build; no live backend/provider/auth proof.'};
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
