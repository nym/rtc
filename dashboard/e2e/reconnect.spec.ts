import { test, expect } from './fixtures/coordinator-fixture.js';

test('forced disconnect + reconnect resyncs from snapshot', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({ kind: 'project.upserted', t: 0, eventId: 'p',
                      project: { id: 'p1', name: 'A' } });
  await fake.ingest({ kind: 'worker.spawned', t: 1, eventId: 'w',
                      projectId: 'p1', workerId: 'w1', source: 'sdk-script', label: 'Solo' });
  await expect(page.getByTestId('workers-alive-count')).toHaveText('1');

  await fake.forceDisconnect();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'disconnected');

  await fake.reconnect();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');
  await expect(page.getByTestId('workers-alive-count')).toHaveText('1');
});
