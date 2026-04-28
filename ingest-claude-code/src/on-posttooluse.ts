import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PostToolUseHook { session_id?: string; }

async function main() {
  const hook = (await readStdinJson<PostToolUseHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  const event: DashboardEvent = {
    kind: 'worker.activity',
    t: Date.now(), eventId: makeEventId('act'),
    workerId, activity: 'thinking',
  };
  await postEvents(event);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-posttooluse error:', err);
});
