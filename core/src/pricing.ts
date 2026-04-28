// LAST_UPDATED: 2026-04-28
// Source: https://platform.claude.com/docs/en/about-claude/pricing
//
// All values: USD per 1,000,000 tokens.
// Cache reads: 10% of base input rate (90% discount).
// Cache writes: 125% of base input rate (5-min TTL).

export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens (cache read). */
  cacheRead: number;
  /** USD per 1M cache-write tokens. */
  cacheWrite: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // Current generation
  'claude-opus-4-7':            { input: 5,    output: 25,   cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-6':            { input: 5,    output: 25,   cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-sonnet-4-6':          { input: 3,    output: 15,   cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-5':          { input: 3,    output: 15,   cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5':           { input: 1,    output: 5,    cacheRead: 0.10, cacheWrite: 1.25 },

  // Legacy (still callable)
  'claude-opus-4-1':            { input: 15,   output: 75,   cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-3-5':           { input: 0.80, output: 4,    cacheRead: 0.08, cacheWrite: 1.00 },
};

export const DEFAULT_PRICING_KEY = 'claude-sonnet-4-6';

/**
 * Compute USD cost for a single API response's usage block.
 * Unknown models default to Sonnet pricing.
 */
export function computeCost(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }
): number {
  // Strip date suffix if present, e.g. "claude-haiku-4-5-20251001" → "claude-haiku-4-5".
  const stripped = model.replace(/-\d{8}$/, '');
  const p = PRICING[stripped] ?? PRICING[DEFAULT_PRICING_KEY]!;

  const inTok    = usage.input_tokens             ?? 0;
  const outTok   = usage.output_tokens            ?? 0;
  const cacheW   = usage.cache_creation_input_tokens ?? 0;
  const cacheR   = usage.cache_read_input_tokens     ?? 0;

  return (
    (inTok  * p.input      / 1_000_000) +
    (outTok * p.output     / 1_000_000) +
    (cacheW * p.cacheWrite / 1_000_000) +
    (cacheR * p.cacheRead  / 1_000_000)
  );
}
