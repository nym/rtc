import { test, expect } from './fixtures/coordinator-fixture.js';

test('worker.errored produces visible toast, dismissible', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 1, eventId: 'p1',
    project: { id: 'p1', name: 'Test' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 2, eventId: 's1',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script', label: 'Solo',
  });
  await fake.ingest({
    kind: 'worker.errored', t: 3, eventId: 'e1',
    workerId: 'w1', message: 'API rate limit', recoverable: true,
  });

  const toast = page.getByTestId('error-toast-e1');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('API rate limit');
  await toast.click();
  await expect(toast).toHaveCount(0);
});
