import {
  makeContext, upsertProject, spawnWorker, errorWorker, despawnWorker, sleep,
} from '../simulator-core.js';
import type { EventSink } from '../simulator-core.js';

export interface ErrorStormOpts {
  sink: EventSink;
  /** Number of errors to fire. Default 30. */
  count?: number;
  /** Pause between errors in ms. Default 200. */
  intervalMs?: number;
  uuidSeed?: number;
  fixedTime?: number;
}

export async function runErrorStorm(opts: ErrorStormOpts): Promise<void> {
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });
  const count = opts.count ?? 30;
  const intervalMs = opts.intervalMs ?? 200;

  await upsertProject(ctx, { id: 'storm', name: 'Storm', color: '#e57373' });
  await spawnWorker(ctx, { projectId: 'storm', workerId: 's1', label: 'Storm-1' });

  for (let i = 0; i < count; i++) {
    await errorWorker(ctx, {
      workerId: 's1',
      message: `Error pulse #${i + 1}`,
      recoverable: i % 3 !== 0,
    });
    await sleep(intervalMs);
  }
  await despawnWorker(ctx, { workerId: 's1', reason: 'crashed' });
}
