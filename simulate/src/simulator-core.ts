import type { DashboardEvent, WorkerActivity } from '@rtc/core';

export type EventSink = (e: DashboardEvent) => void | Promise<void>;

export interface SimContext {
  sink: EventSink;
  now: () => number;
  uuid: () => string;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeContext(
  sink: EventSink,
  opts?: { fixedTime?: number; uuidSeed?: number }
): SimContext {
  let t = opts?.fixedTime ?? Date.now();
  let u = opts?.uuidSeed ?? 0;
  return {
    sink,
    now: () => (opts?.fixedTime !== undefined ? t++ : Date.now()),
    uuid: opts?.uuidSeed !== undefined
      ? () => `det-${u++}`
      : () => (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  };
}

export const upsertProject = (
  ctx: SimContext,
  p: { id: string; name: string; color?: string }
) => ctx.sink({
  kind: 'project.upserted',
  t: ctx.now(), eventId: ctx.uuid(),
  project: p,
});

export const spawnWorker = (
  ctx: SimContext,
  args: { projectId: string; workerId: string; label?: string; pid?: number }
) => ctx.sink({
  kind: 'worker.spawned',
  t: ctx.now(), eventId: ctx.uuid(),
  source: 'sdk-script',
  hostname: 'simulator',
  ...args,
});

export const setActivity = (
  ctx: SimContext,
  workerId: string,
  activity: WorkerActivity,
  detail?: string
) => ctx.sink({
  kind: 'worker.activity',
  t: ctx.now(), eventId: ctx.uuid(),
  workerId, activity,
  ...(detail ? { detail } : {}),
});

export const consumeTokens = (
  ctx: SimContext,
  args: {
    workerId: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    usd: number;
  }
) => ctx.sink({
  kind: 'tokens.consumed',
  t: ctx.now(), eventId: ctx.uuid(),
  model: args.model ?? 'claude-sonnet-4-6',
  workerId: args.workerId,
  inputTokens: args.inputTokens,
  outputTokens: args.outputTokens,
  ...(args.cacheReadTokens !== undefined ? { cacheReadTokens: args.cacheReadTokens } : {}),
  ...(args.cacheWriteTokens !== undefined ? { cacheWriteTokens: args.cacheWriteTokens } : {}),
  usd: args.usd,
});

export const completeTask = (
  ctx: SimContext,
  workerId: string,
  taskName?: string
) => ctx.sink({
  kind: 'task.completed',
  t: ctx.now(), eventId: ctx.uuid(),
  workerId,
  ...(taskName ? { taskName } : {}),
});

export const errorWorker = (
  ctx: SimContext,
  args: { workerId: string; message: string; recoverable?: boolean }
) => ctx.sink({
  kind: 'worker.errored',
  t: ctx.now(), eventId: ctx.uuid(),
  workerId: args.workerId,
  message: args.message,
  recoverable: args.recoverable ?? true,
});

export const despawnWorker = (
  ctx: SimContext,
  args: { workerId: string; reason?: 'completed' | 'killed' | 'crashed' }
) => ctx.sink({
  kind: 'worker.despawned',
  t: ctx.now(), eventId: ctx.uuid(),
  workerId: args.workerId,
  reason: args.reason ?? 'completed',
});

/** One full harvest run for a worker. */
export async function harvestOnce(
  ctx: SimContext,
  workerId: string,
  opts?: { thinkMs?: number; workMs?: number; tokens?: number }
) {
  const thinkMs = opts?.thinkMs ?? 800;
  const workMs  = opts?.workMs  ?? 1200;
  const out     = opts?.tokens  ?? 250;

  await setActivity(ctx, workerId, 'thinking');
  await sleep(thinkMs);

  await setActivity(ctx, workerId, 'tool_use', 'harvest_minerals');
  await sleep(workMs);

  await consumeTokens(ctx, {
    workerId,
    inputTokens: out * 4,
    outputTokens: out,
    usd: (out * 4 * 3 + out * 15) / 1_000_000,
  });
  await completeTask(ctx, workerId, 'harvest');
  await setActivity(ctx, workerId, 'idle');
}
