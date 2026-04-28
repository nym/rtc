import { describe, expect, test } from 'vitest';
import { computeCost, PRICING } from '../src/index.js';

describe('pricing', () => {
  test('Sonnet 4.6: simple input + output', () => {
    const cost = computeCost('claude-sonnet-4-6', { input_tokens: 1_000_000, output_tokens: 0 });
    expect(cost).toBeCloseTo(3, 6);
  });

  test('Sonnet 4.6: input + output ratio matches pricing table', () => {
    const cost = computeCost('claude-sonnet-4-6', {
      input_tokens: 100_000, output_tokens: 50_000,
    });
    // 100k * 3/1M + 50k * 15/1M = 0.3 + 0.75 = 1.05
    expect(cost).toBeCloseTo(1.05, 6);
  });

  test('cache reads are 10% of input rate', () => {
    const cost = computeCost('claude-sonnet-4-6', {
      input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.30, 6);
  });

  test('cache writes are 125% of input rate', () => {
    const cost = computeCost('claude-sonnet-4-6', {
      input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3.75, 6);
  });

  test('unknown models fall back to Sonnet 4.6 pricing', () => {
    const expected = computeCost('claude-sonnet-4-6', { input_tokens: 1_000_000, output_tokens: 0 });
    const fallback = computeCost('claude-future-9-9', { input_tokens: 1_000_000, output_tokens: 0 });
    expect(fallback).toBeCloseTo(expected, 6);
  });

  test('date-suffixed model ids are stripped before lookup', () => {
    const cost = computeCost('claude-haiku-4-5-20251001', {
      input_tokens: 1_000_000, output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(PRICING['claude-haiku-4-5']!.input + PRICING['claude-haiku-4-5']!.output, 6);
  });
});
