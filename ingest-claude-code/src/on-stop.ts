import { aggregateByModel, totalsToUsd } from './transcript.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface StopHook {
  session_id?: string;
  transcript_path?: string;
}

async function main() {
  const hook = (await readStdinJson<StopHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  const events: DashboardEvent[] = [];

  if (hook.transcript_path) {
    const byModel = await aggregateByModel(hook.transcript_path);
    for (const totals of Object.values(byModel)) {
      const usd = totalsToUsd(totals);
      events.push({
        kind: 'tokens.consumed',
        t: Date.now(), eventId: makeEventId('tok'),
        workerId,
        model: totals.model ?? 'unknown',
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        ...(totals.cacheReadTokens ? { cacheReadTokens: totals.cacheReadTokens } : {}),
        ...(totals.cacheWriteTokens ? { cacheWriteTokens: totals.cacheWriteTokens } : {}),
        usd,
      });
    }
  }

  events.push({
    kind: 'worker.despawned',
    t: Date.now(), eventId: makeEventId('despawn'),
    workerId, reason: 'completed',
  });

  await postEvents(events);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-stop error:', err);
});
