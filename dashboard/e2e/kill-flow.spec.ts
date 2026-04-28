import { test, expect } from './fixtures/coordinator-fixture.js';

test('kill confirm → despawn → workers-alive decrements', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 1, eventId: 'p',
    project: { id: 'p1', name: 'Test Project' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 2, eventId: 'w',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script',
    pid: 99999, label: 'Solo',
  });

  await expect(page.getByTestId('workers-alive-count')).toHaveText('1');

  await page.getByTestId('worker-Solo').click();
  await expect(page.getByRole('dialog', { name: /Solo/ })).toBeVisible();

  await page.getByTestId('kill-button').click();
  await page.getByTestId('kill-confirm').click();

  await expect(page.getByTestId('workers-alive-count')).toHaveText('0');
});
