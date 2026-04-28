import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import { deleteMarks } from './transcript-marks.js';
import type { DashboardEvent } from '@rtc/core';

interface SessionEndHook {
  session_id?: string;
  reason?: string;
}

async function main() {
  const hook = (await readStdinJson<SessionEndHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;

  const event: DashboardEvent = {
    kind: 'worker.despawned',
    t: Date.now(), eventId: makeEventId('despawn'),
    workerId,
    reason: 'completed',
  };

  await postEvents([event]);
  deleteMarks(workerId);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-session-end error:', err);
});
