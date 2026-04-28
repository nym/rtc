import { test as base, expect, type Page } from '@playwright/test';
import type { DashboardEvent } from '@rtc/core';

export interface FakeHandle {
  ingest: (e: DashboardEvent) => Promise<void>;
  forceDisconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
}

interface Fixtures {
  fake: FakeHandle;
  /** When true, dashboard worker animation is paused so hit-target positions are stable. */
  freezeMotion: boolean;
}

export const test = base.extend<Fixtures>({
  freezeMotion: [true, { option: true }],
  fake: async ({ page, freezeMotion }, use) => {
    await page.addInitScript((freeze: boolean) => {
      const w = window as Window & typeof globalThis;
      w.__RTC_TEST_MODE = true;
      if (freeze) (w as Window & { __RTC_FREEZE_MOTION?: boolean }).__RTC_FREEZE_MOTION = true;
    }, freezeMotion);

    const handle: FakeHandle = {
      async ingest(e) {
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
