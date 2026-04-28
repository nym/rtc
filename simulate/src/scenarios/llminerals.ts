import {
  makeContext, upsertProject, spawnWorker, harvestOnce,
  errorWorker, despawnWorker, sleep,
} from '../simulator-core.js';
import type { EventSink } from '../simulator-core.js';

export interface LlmineralsOpts {
  sink: EventSink;
  /** Stop after this many minutes. Default: run forever. */
  durationMin?: number;
  uuidSeed?: number;
  fixedTime?: number;
  /** Speed multiplier; 2.0 = twice as fast. */
  speed?: number;
}

interface WorkerSpec {
  id: string;
  label: string;
  thinkMs: number;
  workMs: number;
  tokens: number;
  errorEvery: number;
}

const WORKERS: WorkerSpec[] = [
  { id: 'w-alpha',   label: 'Alpha',   thinkMs: 600,  workMs: 1200, tokens: 320, errorEvery: 0  },
  { id: 'w-bravo',   label: 'Bravo',   thinkMs: 800,  workMs:  900, tokens: 180, errorEvery: 0  },
  { id: 'w-charlie', label: 'Charlie', thinkMs: 1100, workMs: 1400, tokens: 410, errorEvery: 7  },
  { id: 'w-delta',   label: 'Delta',   thinkMs: 500,  workMs:  700, tokens: 120, errorEvery: 0  },
  { id: 'w-echo',    label: 'Echo',    thinkMs: 1300, workMs: 1800, tokens: 600, errorEvery: 13 },
];

export async function runLlminerals(opts: LlmineralsOpts): Promise<void> {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });
  const projectId = 'demo-llminerals';

  await upsertProject(ctx, {
    id: projectId,
    name: 'Llminerals Outpost',
    color: '#7e57c2',
  });

  for (const [i, w] of WORKERS.entries()) {
    await spawnWorker(ctx, {
      projectId, workerId: w.id, label: w.label,
      pid: 90000 + i,
    });
  }

  const staggers = [0, 200, 400, 600, 800];

  const wallStart = Date.now();
  const stopAt = opts.durationMin ? wallStart + opts.durationMin * 60_000 : Number.POSITIVE_INFINITY;

  await Promise.all(WORKERS.map(async (w, i) => {
    await sleep(staggers[i]! / speed);
    let runs = 0;
    while (Date.now() < stopAt) {
      runs++;
      if (w.errorEvery && runs % w.errorEvery === 0) {
        await errorWorker(ctx, {
          workerId: w.id,
          message: `Rate limit while harvesting (run #${runs})`,
          recoverable: true,
        });
      }
      await harvestOnce(ctx, w.id, {
        thinkMs: w.thinkMs / speed,
        workMs:  w.workMs / speed,
        tokens:  w.tokens,
      });
    }
    await despawnWorker(ctx, { workerId: w.id, reason: 'completed' });
  }));
}
