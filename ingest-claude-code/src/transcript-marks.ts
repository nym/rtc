import fs from 'node:fs';
import path from 'node:path';
import { TRANSCRIPT_MARKS_DIR } from '@rtc/core/config-node';
import type { PerModelTotals, UsageTotals } from './transcript.js';

export type Marks = PerModelTotals;

const fileFor = (sessionId: string): string =>
  path.join(TRANSCRIPT_MARKS_DIR, `${sessionId}.json`);

export function readMarks(sessionId: string): Marks {
  try {
    const raw = fs.readFileSync(fileFor(sessionId), 'utf8');
    return JSON.parse(raw) as Marks;
  } catch {
    return {};
  }
}

export function writeMarks(sessionId: string, marks: Marks): void {
  fs.mkdirSync(TRANSCRIPT_MARKS_DIR, { recursive: true });
  const target = fileFor(sessionId);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(marks));
  fs.renameSync(tmp, target);
}

export function deleteMarks(sessionId: string): void {
  try { fs.unlinkSync(fileFor(sessionId)); } catch { /* ignore */ }
}

export function deltaTotals(curr: UsageTotals, prev: UsageTotals | undefined): UsageTotals {
  if (!prev) return curr;
  return {
    model: curr.model,
    inputTokens:     Math.max(0, curr.inputTokens     - prev.inputTokens),
    outputTokens:    Math.max(0, curr.outputTokens    - prev.outputTokens),
    cacheReadTokens: Math.max(0, curr.cacheReadTokens - prev.cacheReadTokens),
    cacheWriteTokens:Math.max(0, curr.cacheWriteTokens- prev.cacheWriteTokens),
  };
}

export function isNonZero(t: UsageTotals): boolean {
  return t.inputTokens > 0 || t.outputTokens > 0 || t.cacheReadTokens > 0 || t.cacheWriteTokens > 0;
}
