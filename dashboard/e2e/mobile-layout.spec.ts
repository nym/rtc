import { test, expect } from './fixtures/coordinator-fixture.js';

const VIEWPORT = { width: 390, height: 844 };
test.use({ viewport: VIEWPORT });

const LABELS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const;
const REQUIRED_TESTIDS = [
  'top-bar',
  'workers-alive-count',
  'workers-total-count',
  'total-tokens',
  'total-usd',
  'connection-status',
  'sound-toggle',
] as const;

test('mobile viewport: same HUD elements, readable type, no horizontal overflow', async ({ page, fake }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');

  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p',
    project: { id: 'p1', name: 'Llminerals Outpost', color: '#7e57c2' },
  });
  for (let i = 0; i < LABELS.length; i++) {
    await fake.ingest({
      kind: 'worker.spawned', t: i + 1, eventId: `s${i}`,
      projectId: 'p1', workerId: `w-${LABELS[i]!.toLowerCase()}`,
      source: 'sdk-script', pid: 70000 + i, label: LABELS[i]!,
    });
  }

  // 1. Same HUD elements that desktop renders.
  for (const id of REQUIRED_TESTIDS) {
    await expect(page.getByTestId(id)).toBeVisible();
  }

  // 2. Workers + patches visible.
  for (const label of LABELS) {
    await expect(page.getByTestId(`worker-${label}`)).toBeVisible();
    await expect(page.getByTestId(`mineral-patch-${label}`)).toBeVisible();
  }

  // 3. No horizontal page overflow at this viewport.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // 4. Stat values render at >=16px (readable without zoom).
  const minStatFs = await page.evaluate(() => {
    const sel = '[data-testid$="-count"], [data-testid="total-tokens"], [data-testid="total-usd"]';
    const els = Array.from(document.querySelectorAll(sel));
    if (els.length === 0) return 0;
    return els.reduce((min, el) => Math.min(min, parseFloat(getComputedStyle(el).fontSize)), Infinity);
  });
  expect(minStatFs).toBeGreaterThanOrEqual(16);

  // 5. Worker hit-targets are touch-sized (>=32x32) and inside the viewport.
  for (const label of LABELS) {
    const box = await page.getByTestId(`worker-${label}`).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    expect(box!.x).toBeGreaterThanOrEqual(-2);
    expect(box!.y).toBeGreaterThanOrEqual(-2);
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width + 2);
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height + 2);
  }

  // 6. Mineral patch markers all within viewport bounds.
  for (const label of LABELS) {
    const box = await page.getByTestId(`mineral-patch-${label}`).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-4);
    expect(box!.y).toBeGreaterThanOrEqual(-4);
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width + 4);
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height + 4);
  }

  // 7. Top-bar height is bounded so the iso scene still dominates the viewport.
  const topBarBox = await page.getByTestId('top-bar').boundingBox();
  expect(topBarBox).not.toBeNull();
  expect(topBarBox!.height).toBeLessThan(VIEWPORT.height * 0.25);
});
