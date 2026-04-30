import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATE_DIR } from '@rtc/core/config-node';
import { resolveProjectIdentity } from './identity.js';
import { makeEventId, postEvents } from './post.js';
import type { DashboardEvent } from '@rtc/core';

const BOOTSTRAP_DIR = path.join(STATE_DIR, 'worker-bootstrap');

/** Re-emit the bootstrap pair every N ms on active sessions, so a worker
 *  that gets sweep-removed during a silent gap is re-adopted on next event
 *  rather than its activity events being silently dropped by the reducer. */
const BOOTSTRAP_REFRESH_MS = 30_000;

const markerPath = (workerId: string): string =>
  path.join(BOOTSTRAP_DIR, `${workerId}.json`);

interface MarkerData { bootstrappedAt: number; }

function readMarker(workerId: string): MarkerData | null {
  try {
    const raw = fs.readFileSync(markerPath(workerId), 'utf8');
    return JSON.parse(raw) as MarkerData;
  } catch { return null; }
}

/** True iff the worker has a fresh enough marker to skip re-bootstrap. */
export function isBootstrapped(workerId: string): boolean {
  const data = readMarker(workerId);
  if (!data?.bootstrappedAt) return false;
  return Date.now() - data.bootstrappedAt < BOOTSTRAP_REFRESH_MS;
}

export function markBootstrapped(workerId: string): void {
  fs.mkdirSync(BOOTSTRAP_DIR, { recursive: true });
  const target = markerPath(workerId);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ bootstrappedAt: Date.now() } satisfies MarkerData));
  fs.renameSync(tmp, target);
}

export function clearBootstrap(workerId: string): void {
  try { fs.unlinkSync(markerPath(workerId)); } catch { /* ignore */ }
}

/**
 * Ensure a worker exists in coordinator state before activity events fire for
 * it. Adopts sessions whose SessionStart hook never ran (because hooks
 * weren't configured yet at session start) on first observed activity, AND
 * re-adopts sessions whose worker was removed by the staleness sweeper
 * during a silent gap (marker older than BOOTSTRAP_REFRESH_MS).
 *
 * No-op if the marker is fresh. Otherwise emits a project.upserted +
 * worker.spawned pair derived from cwd and updates the marker. The reducer
 * treats both as idempotent updates if the worker already exists, so a
 * stale-marker race is harmless.
 */
export async function ensureBootstrapped(args: {
  workerId: string;
  cwd?: string;
  parentWorkerId?: string;
  agentType?: string;
}): Promise<void> {
  if (isBootstrapped(args.workerId)) return;
  const project = resolveProjectIdentity(args.cwd);
  const t = Date.now();
  const events: DashboardEvent[] = [
    {
      kind: 'project.upserted',
      t, eventId: makeEventId('proj-bootstrap'),
      project: {
        id: project.id, name: project.name, cwd: project.cwd,
        ...(project.color ? { color: project.color } : {}),
      },
    },
    {
      kind: 'worker.spawned',
      t, eventId: makeEventId('spawn-bootstrap'),
      projectId: project.id,
      workerId: args.workerId,
      source: 'claude-code',
      pid: process.ppid,
      hostname: os.hostname(),
      label: args.workerId.slice(0, 8),
      ...(args.parentWorkerId ? { parentWorkerId: args.parentWorkerId } : {}),
      ...(args.agentType ? { agentType: args.agentType } : {}),
    },
  ];
  await postEvents(events);
  markBootstrapped(args.workerId);
}
