import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PreToolUseHook { session_id?: string; tool_name?: string; }

async function main() {
  const hook = (await readStdinJson<PreToolUseHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  const event: DashboardEvent = {
    kind: 'worker.activity',
    t: Date.now(), eventId: makeEventId('act'),
    workerId, activity: 'tool_use',
    detail: hook.tool_name,
  };
  await postEvents(event);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-pretooluse error:', err);
});
