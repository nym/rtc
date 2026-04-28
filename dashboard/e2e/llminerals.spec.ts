import { test, expect } from './fixtures/coordinator-fixture.js';
import type { DashboardEvent } from '@rtc/core';

test.describe('llminerals scenario', () => {
  test('5 worker hit-targets visible, USD ticks above 0', async ({ page, fake }) => {
    await page.goto('/');
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

    const projectId = 'demo-llminerals';
    const project: DashboardEvent = {
      kind: 'project.upserted', t: 1, eventId: 'p',
      project: { id: projectId, name: 'Llminerals Outpost', color: '#7e57c2' },
    };
    await fake.ingest(project);
    const labels = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
    for (let i = 0; i < labels.length; i++) {
      await fake.ingest({
        kind: 'worker.spawned', t: 2 + i, eventId: `s${i}`,
        projectId, workerId: `w-${labels[i]!.toLowerCase()}`, source: 'sdk-script',
        pid: 90000 + i, label: labels[i]!,
      });
    }

    await expect(page.getByText('Llminerals Outpost')).toBeVisible({ timeout: 4_000 });
    await expect(page.getByTestId('workers-alive-count')).toHaveText('5');
    await expect(page.getByTestId('workers-total-count')).toHaveText('5');

    for (const label of labels) {
      await expect(page.getByTestId(`worker-${label}`)).toBeVisible();
    }

    await fake.ingest({
      kind: 'tokens.consumed', t: 100, eventId: 't1',
      workerId: 'w-alpha', model: 'claude-sonnet-4-6',
      inputTokens: 1280, outputTokens: 320,
      usd: 0.0086,
    });

    await expect.poll(async () => {
      const txt = await page.getByTestId('total-usd').textContent();
      const n = Number(String(txt ?? '$0').replace(/[^0-9.]/g, ''));
      return n;
    }, { timeout: 4_000 }).toBeGreaterThan(0);

    await page.getByTestId('worker-Alpha').click();
    await expect(page.getByRole('dialog', { name: /Alpha/ })).toBeVisible();
  });
});
