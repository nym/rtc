import { aggregateByModel, lastInputTokens, totalsToUsd } from './transcript.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import { readMarks, writeMarks, deltaTotals, isNonZero } from './transcript-marks.js';
import { ensureBootstrapped } from './bootstrap.js';
import type { DashboardEvent } from '@rtc/core';

interface StopHook {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

async function main() {
  const hook = (await readStdinJson<StopHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  await ensureBootstrapped({ workerId, cwd: hook.cwd });

  if (!hook.transcript_path) return;

  const current = await aggregateByModel(hook.transcript_path);
  const previous = readMarks(workerId);

  const events: DashboardEvent[] = [];
  for (const [model, currTotals] of Object.entries(current)) {
    const delta = deltaTotals(currTotals, previous[model]);
    if (!isNonZero(delta)) continue;
    const usd = totalsToUsd(delta);
    events.push({
      kind: 'tokens.consumed',
      t: Date.now(), eventId: makeEventId('tok'),
      workerId,
      model: delta.model ?? 'unknown',
      inputTokens: delta.inputTokens,
      outputTokens: delta.outputTokens,
      ...(delta.cacheReadTokens ? { cacheReadTokens: delta.cacheReadTokens } : {}),
      ...(delta.cacheWriteTokens ? { cacheWriteTokens: delta.cacheWriteTokens } : {}),
      usd,
    });
  }

  const ctx = await lastInputTokens(hook.transcript_path);
  if (ctx > 0) {
    events.push({
      kind: 'worker.context',
      t: Date.now(), eventId: makeEventId('ctx'),
      workerId,
      contextTokens: ctx,
    });
  }

  if (events.length > 0) {
    await postEvents(events);
  }
  writeMarks(workerId, current);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-stop error:', err);
});
