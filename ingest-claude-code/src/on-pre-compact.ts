import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PreCompactHook {
  session_id?: string;
  trigger?: 'manual' | 'auto';
}

async function main() {
  const hook = (await readStdinJson<PreCompactHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;

  const event: DashboardEvent = {
    kind: 'session.compact_imminent',
    t: Date.now(), eventId: makeEventId('compact'),
    workerId,
    ...(hook.trigger ? { trigger: hook.trigger } : {}),
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-pre-compact error:', err);
});
