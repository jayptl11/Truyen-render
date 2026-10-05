import { defineConfig } from '@playwright/test';
const firefox = process.env.PLAYWRIGHT_BROWSER === 'firefox';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 20000,
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5188',
    browserName: firefox ? 'firefox' : 'chromium',
    launchOptions: firefox ? {} : {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run ${process.env.PLAYWRIGHT_PREVIEW ? 'preview' : 'dev'} -- --host 127.0.0.1 --port 5188 --strictPort`,
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
  },
});
