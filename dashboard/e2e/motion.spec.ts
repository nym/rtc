import { test, expect } from './fixtures/coordinator-fixture.js';

// Run this spec with motion enabled — opposite of the other E2E specs.
test.use({ freezeMotion: false });

test('worker hit-target screen position changes during a harvest cycle', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p',
    project: { id: 'p1', name: 'Motion' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 1, eventId: 's',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script', label: 'Mover',
  });
  await fake.ingest({
    kind: 'worker.activity', t: 2, eventId: 'a1',
    workerId: 'w1', activity: 'tool_use',
  });

  const hit = page.getByTestId('worker-Mover');
  await expect(hit).toBeVisible();

  const samples: number[] = [];
  for (let i = 0; i < 8; i++) {
    const box = await hit.boundingBox();
    if (box) samples.push(box.x);
    await page.waitForTimeout(300);
  }

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  // Worker walks toward patch on tool_use; expect noticeable horizontal drift.
  // Threshold is conservative because the worker spawns at the base-adjacent
  // loiter spot and stops short of the patch (HARVEST_STOP_DISTANCE), so the
  // trajectory is shorter than it was when the worker spawned at a random
  // global ring position and walked all the way onto the patch.
  expect(max - min).toBeGreaterThan(3);
});
