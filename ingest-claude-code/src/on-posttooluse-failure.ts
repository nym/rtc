import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PostToolUseFailureHook {
  session_id?: string;
  agent_id?: string;
  tool_name?: string;
  tool_error?: string;
}

async function main() {
  const hook = (await readStdinJson<PostToolUseFailureHook>()) ?? {};
  const workerId = hook.agent_id ?? hook.session_id ?? `cc-${process.ppid}`;
  const message = hook.tool_error ?? `tool error${hook.tool_name ? ` in ${hook.tool_name}` : ''}`;

  const event: DashboardEvent = {
    kind: 'worker.errored',
    t: Date.now(), eventId: makeEventId('err'),
    workerId,
    message,
    recoverable: true,
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-posttooluse-failure error:', err);
});
