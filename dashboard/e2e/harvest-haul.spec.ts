import { test, expect } from './fixtures/coordinator-fixture.js';

// Carrying behaviour requires real motion so the worker can walk back to base.
test.use({ freezeMotion: false });

test('worker hit-target flips data-carrying through a harvest cycle', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p',
    project: { id: 'p1', name: 'Haul' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 1, eventId: 's',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script', label: 'Hauler',
  });
  const hit = page.getByTestId('worker-Hauler');
  await expect(hit).toBeVisible();
  await expect(hit).toHaveAttribute('data-carrying', 'false');

  await fake.ingest({
    kind: 'worker.activity', t: 2, eventId: 'a1',
    workerId: 'w1', activity: 'tool_use', detail: 'harvest_minerals',
  });

  // Allow the worker time to reach the patch (≈5.5 world units at 0.024/frame ≈ 4s).
  await page.waitForTimeout(5_500);

  // End harvest — the carry flag should flip because the worker is now at the patch.
  await fake.ingest({
    kind: 'worker.activity', t: 3, eventId: 'a2',
    workerId: 'w1', activity: 'idle',
  });

  await expect(hit).toHaveAttribute('data-carrying', 'true', { timeout: 2_000 });

  // Worker walks back ≈5.5 units at 0.024/frame ≈ 4s; release on arrival.
  await expect(hit).toHaveAttribute('data-carrying', 'false', { timeout: 12_000 });
});
