import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMOS_DIR = path.resolve(__dirname, '../../demos');

export default defineConfig({
  testDir: './',
  timeout: 60_000,
  outputDir: path.join(DEMOS_DIR, 'tests'),
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    video: {
      mode: 'on',
      size: { width: 1440, height: 900 },
    },
  },

  projects: [
    {
      name: 'e2e',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'demo-recording',
      testMatch: /^(?!.*mobile-).*llminerals\.demo\.ts$/,
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-demo-recording',
      testMatch: /mobile-llminerals\.demo\.ts/,
      timeout: 90_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 14']?.userAgent,
        video: { mode: 'on', size: { width: 390, height: 844 } },
      },
    },
  ],

  webServer: {
    command: 'pnpm --filter @rtc/dashboard preview --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    cwd: path.resolve(__dirname, '../..'),
  },
});
