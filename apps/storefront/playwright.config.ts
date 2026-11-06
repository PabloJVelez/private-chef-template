import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser', workers: 1, fullyParallel: false, timeout: 45000,
  outputDir: '../../artifacts/meal-prep-verification/browser',
  reporter: [['list'], ['json', { outputFile: '../../artifacts/meal-prep-verification/browser.json' }]],
  use: { baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
