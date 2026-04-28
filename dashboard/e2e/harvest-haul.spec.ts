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
  await fake.ingest({
    kind: 'worker.activity', t: 2, eventId: 'a1',
    workerId: 'w1', activity: 'tool_use', detail: 'harvest_minerals',
  });

  const hit = page.getByTestId('worker-Hauler');
  await expect(hit).toBeVisible();
  await expect(hit).toHaveAttribute('data-carrying', 'false');

  // Trigger harvest completion.
  await fake.ingest({
    kind: 'worker.activity', t: 3, eventId: 'a2',
    workerId: 'w1', activity: 'idle',
  });

  // Carry flag must turn on once the transition propagates through a render frame.
  await expect(hit).toHaveAttribute('data-carrying', 'true', { timeout: 2_000 });

  // After walking home (≈3.5 world units at 0.018 units/frame ≈ 4s), carry releases.
  await expect(hit).toHaveAttribute('data-carrying', 'false', { timeout: 12_000 });
});
