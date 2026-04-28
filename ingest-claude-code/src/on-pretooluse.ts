import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PreToolUseHook { session_id?: string; tool_name?: string; agent_id?: string; }

async function main() {
  const hook = (await readStdinJson<PreToolUseHook>()) ?? {};
  // When inside a subagent call, agent_id identifies the subagent worker;
  // otherwise the parent session is the worker.
  const workerId = hook.agent_id ?? hook.session_id ?? `cc-${process.ppid}`;
  const isMcp = typeof hook.tool_name === 'string' && hook.tool_name.startsWith('mcp__');
  const event: DashboardEvent = {
    kind: 'worker.activity',
    t: Date.now(), eventId: makeEventId('act'),
    workerId, activity: isMcp ? 'mcp_call' : 'tool_use',
    detail: hook.tool_name,
  };
  await postEvents(event);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-pretooluse error:', err);
});
