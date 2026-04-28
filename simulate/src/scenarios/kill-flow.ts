import {
  makeContext, upsertProject, spawnWorker, sleep,
} from '../simulator-core.js';
import type { EventSink } from '../simulator-core.js';

export interface KillFlowOpts {
  sink: EventSink;
  workerCount?: number;
  /** Idle pulse interval. Used to keep workers visible for testers. */
  pulseMs?: number;
  durationMin?: number;
  uuidSeed?: number;
  fixedTime?: number;
}

export async function runKillFlow(opts: KillFlowOpts): Promise<void> {
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });
  const count = opts.workerCount ?? 3;
  const pulseMs = opts.pulseMs ?? 800;
  const stopAt = opts.durationMin
    ? Date.now() + opts.durationMin * 60_000
    : Date.now() + 60_000;

  await upsertProject(ctx, { id: 'kill-target', name: 'Kill Target', color: '#90a4ae' });
  for (let i = 0; i < count; i++) {
    await spawnWorker(ctx, {
      projectId: 'kill-target',
      workerId: `kt-${i + 1}`,
      label: `KT-${i + 1}`,
      pid: 70000 + i,
    });
  }

  while (Date.now() < stopAt) {
    await sleep(pulseMs);
  }
}
