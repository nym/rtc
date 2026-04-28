import { test } from './fixtures/coordinator-fixture.js';
import type { DashboardEvent } from '@rtc/core';

const LABELS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const;
const PROJECT_ID = 'demo-llminerals';

let counter = 0;
const eid = (p: string) => `${p}-${counter++}`;

test('record llminerals demo', async ({ page, fake }, testInfo) => {
  testInfo.setTimeout(90_000);
  await page.goto('/');
  await page.waitForSelector('[data-testid="connection-status"][data-state="connected"]');

  // Project + 5 workers.
  await fake.ingest({
    kind: 'project.upserted', t: Date.now(), eventId: eid('p'),
    project: { id: PROJECT_ID, name: 'Llminerals Outpost', color: '#7e57c2' },
  });
  for (let i = 0; i < LABELS.length; i++) {
    await fake.ingest({
      kind: 'worker.spawned', t: Date.now(), eventId: eid('s'),
      projectId: PROJECT_ID, workerId: `w-${LABELS[i]!.toLowerCase()}`,
      source: 'sdk-script', pid: 90000 + i, label: LABELS[i]!,
    });
  }

  const start = Date.now();
  while (Date.now() - start < 30_000) {
    for (let i = 0; i < LABELS.length; i++) {
      const workerId = `w-${LABELS[i]!.toLowerCase()}`;
      const events: DashboardEvent[] = [
        { kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
          workerId, activity: 'thinking' },
      ];
      for (const e of events) await fake.ingest(e);
      await page.waitForTimeout(80);

      await fake.ingest({
        kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
        workerId, activity: 'tool_use', detail: 'harvest_minerals',
      });
      await page.waitForTimeout(120);

      await fake.ingest({
        kind: 'tokens.consumed', t: Date.now(), eventId: eid('t'),
        workerId, model: 'claude-sonnet-4-6',
        inputTokens: 1280 + i * 100, outputTokens: 320 + i * 20,
        usd: 0.012 + i * 0.003,
      });
      await fake.ingest({
        kind: 'task.completed', t: Date.now(), eventId: eid('c'),
        workerId, taskName: 'harvest',
      });
      await fake.ingest({
        kind: 'worker.activity', t: Date.now(), eventId: eid('a'),
        workerId, activity: 'idle',
      });
      if ((i === 2 || i === 4) && Math.random() < 0.4) {
        await fake.ingest({
          kind: 'worker.errored', t: Date.now(), eventId: eid('err'),
          workerId, message: 'Rate limit hit on harvest', recoverable: true,
        });
      }
    }
  }

  await page.waitForTimeout(2_000);
});
