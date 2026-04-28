import { resolveProjectIdentity, hostname } from './identity.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface SessionStartHook { session_id?: string; cwd?: string; }

async function main() {
  const hook = (await readStdinJson<SessionStartHook>()) ?? {};
  const project = resolveProjectIdentity(hook.cwd);
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
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
      label: workerId.slice(0, 8),
    },
  ];

  await postEvents(events);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-session-start error:', err);
});
