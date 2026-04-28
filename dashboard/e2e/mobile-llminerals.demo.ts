import { test } from './fixtures/coordinator-fixture.js';
import type { Page } from '@playwright/test';
import type { DashboardEvent } from '@rtc/core';

test.use({
  freezeMotion: false,
  viewport: { width: 390, height: 844 },
});

const LABELS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const;
const PROJECT_ID = 'demo-llminerals';
const WORKER_IDS = LABELS.map((l) => `w-${l.toLowerCase()}`);

const RECORDING_MS = 32_000;
const THINK_MS = 600;
const HARVEST_MS = 4_200;
const HOME_MS = 4_000;

let counter = 0;
const eid = (p: string) => `${p}-${counter++}`;

test('record mobile llminerals demo', async ({ page, fake }, testInfo) => {
  testInfo.setTimeout(60_000);
  await page.goto('/');
  await page.waitForSelector('[data-testid="connection-status"][data-state="connected"]');

  await fake.ingest({
    kind: 'project.upserted', t: Date.now(), eventId: eid('p'),
    project: { id: PROJECT_ID, name: 'Llminerals Outpost', color: '#7e57c2' },
  });
  for (let i = 0; i < LABELS.length; i++) {
    await fake.ingest({
      kind: 'worker.spawned', t: Date.now(), eventId: eid('s'),
      projectId: PROJECT_ID, workerId: WORKER_IDS[i]!,
      source: 'sdk-script', pid: 90000 + i, label: LABELS[i]!,
    });
  }

  const start = Date.now();
  await Promise.all(LABELS.map((label, i) => runWorker(page, fake, label, WORKER_IDS[i]!, i, start)));
  await page.waitForTimeout(2_000);
});

async function runWorker(
  page: Page,
  fake: { ingest: (e: DashboardEvent) => Promise<void> },
  _label: string,
  workerId: string,
  index: number,
  start: number,
): Promise<void> {
  await page.waitForTimeout(index * 350);

  let cycle = 0;
  while (Date.now() - start < RECORDING_MS) {
    cycle++;

    await fake.ingest({
      kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
      workerId, activity: 'thinking',
    });
    await page.waitForTimeout(THINK_MS);

    await fake.ingest({
      kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
      workerId, activity: 'tool_use', detail: 'harvest_minerals',
    });
    await page.waitForTimeout(HARVEST_MS);

    await fake.ingest({
      kind: 'tokens.consumed', t: Date.now(), eventId: eid('t'),
      workerId, model: 'claude-sonnet-4-6',
      inputTokens: 1280 + index * 100, outputTokens: 320 + index * 20,
      usd: 0.012 + index * 0.003,
    });
    await fake.ingest({
      kind: 'task.completed', t: Date.now(), eventId: eid('c'),
      workerId, taskName: 'harvest',
    });
    await fake.ingest({
      kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
      workerId, activity: 'idle',
    });

    if ((index === 2 || index === 4) && cycle % 3 === 0) {
      await fake.ingest({
        kind: 'worker.errored', t: Date.now(), eventId: eid('err'),
        workerId, message: `Rate limit on harvest run #${cycle}`, recoverable: true,
      });
    }

    await page.waitForTimeout(HOME_MS);
  }
}
