import fs from 'node:fs';
import readline from 'node:readline';
import { computeCost } from '@rtc/core';

export interface UsageTotals {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface PerModelTotals {
  [model: string]: UsageTotals;
}

const empty = (): UsageTotals => ({
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

interface AssistantLine {
  type?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/** Aggregate the entire transcript into a single bucket (last-seen model). */
export async function aggregate(transcriptPath: string): Promise<UsageTotals> {
  const totals = empty();

  if (!fs.existsSync(transcriptPath)) return totals;

  const stream = readline.createInterface({
    input: fs.createReadStream(transcriptPath),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    if (!line.trim()) continue;
    let obj: AssistantLine;
    try { obj = JSON.parse(line) as AssistantLine; }
    catch { continue; }
    if (obj?.type !== 'assistant') continue;
    const u = obj.message?.usage;
    if (!u) continue;
    totals.model = obj.message?.model ?? totals.model;
    totals.inputTokens     += u.input_tokens ?? 0;
    totals.outputTokens    += u.output_tokens ?? 0;
    totals.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    totals.cacheWriteTokens+= u.cache_creation_input_tokens ?? 0;
  }
  return totals;
}

/** Aggregate by model so per-turn model swaps are cost-correct. */
export async function aggregateByModel(transcriptPath: string): Promise<PerModelTotals> {
  const byModel: PerModelTotals = {};
  if (!fs.existsSync(transcriptPath)) return byModel;

  const stream = readline.createInterface({
    input: fs.createReadStream(transcriptPath),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    if (!line.trim()) continue;
    let obj: AssistantLine;
    try { obj = JSON.parse(line) as AssistantLine; }
    catch { continue; }
    if (obj?.type !== 'assistant') continue;
    const u = obj.message?.usage;
    if (!u) continue;
    const model = obj.message?.model ?? 'unknown';
    const bucket = byModel[model] ?? empty();
    bucket.model = model;
    bucket.inputTokens     += u.input_tokens ?? 0;
    bucket.outputTokens    += u.output_tokens ?? 0;
    bucket.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    bucket.cacheWriteTokens+= u.cache_creation_input_tokens ?? 0;
    byModel[model] = bucket;
  }
  return byModel;
}

/** Compute USD for a UsageTotals using core's pricing. */
export function totalsToUsd(totals: UsageTotals): number {
  return computeCost(totals.model ?? 'unknown', {
    input_tokens: totals.inputTokens,
    output_tokens: totals.outputTokens,
    cache_creation_input_tokens: totals.cacheWriteTokens,
    cache_read_input_tokens: totals.cacheReadTokens,
  });
}
