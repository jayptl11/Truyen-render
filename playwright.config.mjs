import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT || 5188);
const firefox = process.env.PLAYWRIGHT_BROWSER === 'firefox';
export default defineConfig({
  testDir: './tests/browser',
  outputDir: `test-results/${process.env.PLAYWRIGHT_PREVIEW ? 'preview' : 'dev'}-${firefox ? 'firefox' : 'chromium'}-${port}`,
  timeout: 20000,
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: firefox ? 'firefox' : 'chromium',
    launchOptions: firefox ? {} : {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run ${process.env.PLAYWRIGHT_PREVIEW ? 'preview' : 'dev'} -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
