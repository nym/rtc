import { describe, expect, test } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, aggregateByModel, totalsToUsd } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = (name: string) => path.join(__dirname, 'fixtures', name);

describe('transcript parser', () => {
  test('aggregates a simple two-assistant transcript', async () => {
    const totals = await aggregate(FIX('simple.jsonl'));
    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(125);
    expect(totals.cacheWriteTokens).toBe(10);
    expect(totals.cacheReadTokens).toBe(20);
    expect(totals.model).toBe('claude-sonnet-4-6');
  });

  test('returns empty totals for a missing transcript', async () => {
    const totals = await aggregate('/no/such/path/anywhere.jsonl');
    expect(totals.inputTokens).toBe(0);
    expect(totals.outputTokens).toBe(0);
    expect(totals.model).toBeNull();
  });

  test('skips non-assistant lines, malformed JSON, and missing usage', async () => {
    const totals = await aggregate(FIX('garbled.jsonl'));
    expect(totals.inputTokens).toBe(42);
    expect(totals.outputTokens).toBe(7);
  });

  test('aggregateByModel splits totals across model swaps', async () => {
    const byModel = await aggregateByModel(FIX('multi-model.jsonl'));
    expect(byModel['claude-haiku-4-5']?.inputTokens).toBe(3000);
    expect(byModel['claude-haiku-4-5']?.outputTokens).toBe(300);
    expect(byModel['claude-opus-4-7']?.inputTokens).toBe(500);
    expect(byModel['claude-opus-4-7']?.outputTokens).toBe(250);
  });

  test('totalsToUsd uses the recorded model for pricing', async () => {
    const totals = await aggregate(FIX('simple.jsonl'));
    const usd = totalsToUsd(totals);
    // Sonnet-4.6: 300 in * 3 + 125 out * 15 + 10 cw * 3.75 + 20 cr * 0.3 → all per 1M
    const expected = (300 * 3 + 125 * 15 + 10 * 3.75 + 20 * 0.3) / 1_000_000;
    expect(usd).toBeCloseTo(expected, 9);
  });

  test('aggregateByModel returns {} for empty/missing transcript', async () => {
    const byModel = await aggregateByModel('/no/such/path.jsonl');
    expect(Object.keys(byModel).length).toBe(0);
  });
});
