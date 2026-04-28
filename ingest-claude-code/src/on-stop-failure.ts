import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface StopFailureHook {
  session_id?: string;
  error_type?: string;
}

async function main() {
  const hook = (await readStdinJson<StopFailureHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;

  const event: DashboardEvent = {
    kind: 'worker.errored',
    t: Date.now(), eventId: makeEventId('err'),
    workerId,
    message: hook.error_type ?? 'turn ended with API error',
    recoverable: false,
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-stop-failure error:', err);
});
