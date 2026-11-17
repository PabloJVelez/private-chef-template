// Operator-installed harness, never loaded from the PR checkout.
const fs = require('node:fs');
const { chromium } = require(process.env.PREVIEW_PLAYWRIGHT_MODULE || 'playwright-core');
const [envPath, evidencePath] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split('\n').map(line => {
  const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
}));
(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PREVIEW_CHROMIUM_PATH,
    args: ['--no-sandbox'] });
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
})().catch(() => { console.error('Browser acceptance failed; inspect private runtime'); process.exitCode = 1; });
