import { resolveProjectIdentity, hostname } from './identity.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface SubagentStartHook {
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  cwd?: string;
}

async function main() {
  const hook = (await readStdinJson<SubagentStartHook>()) ?? {};
  const project = resolveProjectIdentity(hook.cwd);
  const parentWorkerId = hook.session_id;
  const workerId = hook.agent_id ?? `sub-${parentWorkerId ?? process.ppid}-${Date.now()}`;
  const t = Date.now();

  const events: DashboardEvent[] = [
    {
      kind: 'project.upserted',
      t, eventId: makeEventId('proj'),
      project: { id: project.id, name: project.name, cwd: project.cwd, ...(project.color ? { color: project.color } : {}) },
    },
    {
      kind: 'worker.spawned',
      t, eventId: makeEventId('spawn'),
      projectId: project.id,
      workerId,
      source: 'claude-code',
      pid: process.ppid,
      hostname: hostname(),
      label: hook.agent_type ?? workerId.slice(0, 8),
      ...(parentWorkerId ? { parentWorkerId } : {}),
      ...(hook.agent_type ? { agentType: hook.agent_type } : {}),
    },
  ];

  await postEvents(events);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-subagent-start error:', err);
});
