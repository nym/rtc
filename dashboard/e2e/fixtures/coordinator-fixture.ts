import { test as base, expect, type Page } from '@playwright/test';
import { FakeCoordinator } from '@rtc/coordinator/fake';
import type { DashboardEvent } from '@rtc/core';

export interface FakeHandle {
  ingest: (e: DashboardEvent) => Promise<void>;
  forceDisconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  /** Local FakeCoordinator instance kept in step for assertions in Node-side. */
  inProcess: FakeCoordinator;
}

type Fixtures = { fake: FakeHandle };

export const test = base.extend<Fixtures>({
  fake: async ({ page }, use) => {
    const inProcess = new FakeCoordinator();

    await page.addInitScript(() => {
      (window as Window & typeof globalThis).__RTC_TEST_MODE = true;
    });

    const handle: FakeHandle = {
      inProcess,
      async ingest(e) {
        inProcess.ingest(e);
        await waitForIngest(page);
        await page.evaluate((event) => {
          (window as Window & typeof globalThis).__rtcIngest?.(event);
        }, e as unknown as Record<string, unknown>);
      },
      async forceDisconnect() {
        await page.evaluate(() => {
          (window as Window & typeof globalThis).__rtcForceDisconnect?.();
        });
      },
      async reconnect() {
        await page.evaluate(() => {
          (window as Window & typeof globalThis).__rtcReconnect?.();
        });
      },
    };

    await use(handle);
  },
});

async function waitForIngest(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as Window & typeof globalThis).__rtcIngest === 'function', undefined, { timeout: 5000 });
}

export { expect };
