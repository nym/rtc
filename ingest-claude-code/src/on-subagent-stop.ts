import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface SubagentStopHook {
  session_id?: string;
  agent_id?: string;
}

async function main() {
  const hook = (await readStdinJson<SubagentStopHook>()) ?? {};
  if (!hook.agent_id) return;

  const event: DashboardEvent = {
    kind: 'worker.despawned',
    t: Date.now(), eventId: makeEventId('despawn'),
    workerId: hook.agent_id,
    reason: 'completed',
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-subagent-stop error:', err);
});
