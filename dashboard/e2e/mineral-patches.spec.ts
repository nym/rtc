import { test, expect } from './fixtures/coordinator-fixture.js';

const LABELS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const;

test('N alive workers ↔ N mineral-patch hit-targets at distinct positions', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p',
    project: { id: 'p1', name: 'Patches' },
  });
  for (let i = 0; i < LABELS.length; i++) {
    await fake.ingest({
      kind: 'worker.spawned', t: i + 1, eventId: `s${i}`,
      projectId: 'p1', workerId: `w-${LABELS[i]!.toLowerCase()}`,
      source: 'sdk-script', pid: 70000 + i, label: LABELS[i]!,
    });
  }

  for (const label of LABELS) {
    await expect(page.getByTestId(`mineral-patch-${label}`)).toBeVisible();
  }

  const positions = await Promise.all(
    LABELS.map(async (label) => {
      const box = await page.getByTestId(`mineral-patch-${label}`).boundingBox();
      return box ? { label, x: Math.round(box.x), y: Math.round(box.y) } : { label, x: -1, y: -1 };
    })
  );

  // Every patch position must be distinct from every other patch.
  const keys = positions.map((p) => `${p.x},${p.y}`);
  const unique = new Set(keys);
  expect(unique.size).toBe(LABELS.length);

  // Despawning a worker must remove its patch (count decrements).
  await fake.ingest({
    kind: 'worker.despawned', t: 100, eventId: 'd1',
    workerId: 'w-charlie', reason: 'completed',
  });
  await expect(page.getByTestId('mineral-patch-Charlie')).toHaveCount(0);
  await expect(page.getByTestId('mineral-patch-Alpha')).toBeVisible();
  await expect(page.getByTestId('workers-alive-count')).toHaveText(String(LABELS.length - 1));
});
