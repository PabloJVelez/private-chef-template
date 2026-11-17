// Operator-installed harness, never loaded from the PR checkout.
const fs = require('node:fs');
const { chromium } = require(process.env.PREVIEW_PLAYWRIGHT_MODULE || 'playwright-core');
const [envPath, evidencePath] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split('\n').map(line => {
  const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
}));
(async () => {
  // Live public DNS queries, not fixed IP overrides; normal hostname TLS checks.
  const rules = [];
  for (const origin of [env.API_URL, env.STOREFRONT_URL]) {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1') continue; // Local integration fixture only.
    const response = await fetch('https://cloudflare-dns.com/dns-query?type=A&name=' + encodeURIComponent(host), { headers: { Accept: 'application/dns-json' } });
    const dns = await response.json();
    const address = dns.Answer?.find(answer => answer.type === 1)?.data;
    if (dns.Status !== 0 || !address || !/^[0-9.]+$/.test(address)) throw new Error('Public DNS lookup failed');
    rules.push('MAP ' + host + ' ' + address);
  }
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PREVIEW_CHROMIUM_PATH,
    args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=' + rules.join(', ')] });
  try {
    const results = [];
    for (const url of [env.STOREFRONT_URL + '/', env.STOREFRONT_URL + '/request', env.API_URL + '/app']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      if (!response || response.status() !== 200 || new URL(page.url()).hostname !== new URL(url).hostname)
        throw new Error('Public browser routing/status failed');
      if (url.endsWith('/app')) {
        await page.locator('input[name=email]').fill('chef@example.invalid');
        await page.locator('input[name=password]').fill(env.PREVIEW_ADMIN_PASSWORD);
        await page.getByRole('button', { name: 'Continue with Email' }).click();
        await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 });
      }
      if (errors.length) throw new Error('Browser page errors');
      results.push({ url: page.url(), status: response.status(), errors });
      await page.close();
    }
    fs.writeFileSync(evidencePath, JSON.stringify(results, null, 2), { mode: 0o600 });
    console.log('Public browser and Admin login acceptance passed');
  } finally { await browser.close(); }
})().catch(error => {
  let detail = String(error.stack);
  for (const key of ['PREVIEW_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'JWT_SECRET', 'COOKIE_SECRET', 'MEDUSA_PUBLISHABLE_KEY'])
    if (env[key]) detail = detail.split(env[key]).join('[redacted]');
  fs.writeFileSync(evidencePath + '.error', detail, { mode: 0o600 });
  console.error('Browser acceptance failed; private diagnostics saved');
  process.exitCode = 1;
});
