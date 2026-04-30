import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import { ensureBootstrapped } from './bootstrap.js';
import type { DashboardEvent } from '@rtc/core';

interface PermissionDeniedHook {
  session_id?: string;
  agent_id?: string;
  tool_name?: string;
  cwd?: string;
}

async function main() {
  const hook = (await readStdinJson<PermissionDeniedHook>()) ?? {};
  const workerId = hook.agent_id ?? hook.session_id ?? `cc-${process.ppid}`;
  await ensureBootstrapped({
    workerId,
    cwd: hook.cwd,
    ...(hook.agent_id && hook.session_id ? { parentWorkerId: hook.session_id } : {}),
  });
  const tool = hook.tool_name ?? 'unknown';

  const event: DashboardEvent = {
    kind: 'worker.notification',
    t: Date.now(), eventId: makeEventId('perm-denied'),
    workerId,
    level: 'warn',
    message: `permission denied: ${tool}`,
    source: 'permission_denied',
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-permission-denied error:', err);
});
