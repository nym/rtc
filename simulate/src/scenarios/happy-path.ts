import {
  makeContext, upsertProject, spawnWorker, harvestOnce, despawnWorker,
} from '../simulator-core.js';
import type { EventSink } from '../simulator-core.js';

export interface HappyPathOpts {
  sink: EventSink;
  uuidSeed?: number;
  fixedTime?: number;
}

export async function runHappyPath(opts: HappyPathOpts): Promise<void> {
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });

  await upsertProject(ctx, { id: 'happy', name: 'Happy', color: '#81c784' });
  await spawnWorker(ctx, { projectId: 'happy', workerId: 'hp1', label: 'Solo' });
  await harvestOnce(ctx, 'hp1', { thinkMs: 200, workMs: 200, tokens: 50 });
  await despawnWorker(ctx, { workerId: 'hp1', reason: 'completed' });
}
