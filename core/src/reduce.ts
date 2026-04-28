import type { DashboardEvent } from './events.js';
import type { Worker, WorldState } from './state.js';

const cloneTotals = (s: WorldState): WorldState['totals'] => ({ ...s.totals });

const recomputeTotalsForWorker = (
  totals: WorldState['totals'],
  prev: Worker | undefined,
  next: Worker
): WorldState['totals'] => {
  const t = { ...totals };
  if (!prev) {
    t.workersTotal += 1;
    if (next.alive) t.workersAlive += 1;
  } else if (prev.alive !== next.alive) {
    t.workersAlive += next.alive ? 1 : -1;
  }
  // Token + usd diffs are accumulated by the caller using deltas.
  return t;
};

/**
 * Pure reducer. Idempotent w.r.t. eventId is NOT guaranteed by the type — callers
 * should de-dupe by eventId at the transport layer if needed.
 */
export function reduce(state: WorldState, event: DashboardEvent): WorldState {
  switch (event.kind) {
    case 'project.upserted': {
      const existing = state.projects[event.project.id];
      const project = existing
        ? { ...existing, ...event.project }
        : { ...event.project, createdAt: event.t };
      return {
        ...state,
        projects: { ...state.projects, [event.project.id]: project },
        revision: state.revision + 1,
      };
    }

    case 'worker.spawned': {
      const prev = state.workers[event.workerId];
      const next: Worker = {
        id: event.workerId,
        projectId: event.projectId,
        source: event.source,
        pid: event.pid,
        hostname: event.hostname,
        label: event.label,
        spawnedAt: prev?.spawnedAt ?? event.t,
        lastEventAt: event.t,
        alive: true,
        activity: 'idle',
        inputTokens: prev?.inputTokens ?? 0,
        outputTokens: prev?.outputTokens ?? 0,
        cacheReadTokens: prev?.cacheReadTokens ?? 0,
        cacheWriteTokens: prev?.cacheWriteTokens ?? 0,
        usd: prev?.usd ?? 0,
        tasksCompleted: prev?.tasksCompleted ?? 0,
        errorCount: prev?.errorCount ?? 0,
        lastError: prev?.lastError,
      };
      const totals = recomputeTotalsForWorker(state.totals, prev, next);
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        totals,
        revision: state.revision + 1,
      };
    }

    case 'worker.activity': {
      const w = state.workers[event.workerId];
      if (!w) return state;
      const next: Worker = { ...w, activity: event.activity, lastEventAt: event.t };
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        revision: state.revision + 1,
      };
    }

    case 'tokens.consumed': {
      const w = state.workers[event.workerId];
      if (!w) return state;
      const next: Worker = {
        ...w,
        inputTokens: w.inputTokens + event.inputTokens,
        outputTokens: w.outputTokens + event.outputTokens,
        cacheReadTokens: w.cacheReadTokens + (event.cacheReadTokens ?? 0),
        cacheWriteTokens: w.cacheWriteTokens + (event.cacheWriteTokens ?? 0),
        usd: w.usd + event.usd,
        lastEventAt: event.t,
      };
      const totals = cloneTotals(state);
      totals.inputTokens += event.inputTokens;
      totals.outputTokens += event.outputTokens;
      totals.usd += event.usd;
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        totals,
        revision: state.revision + 1,
      };
    }

    case 'task.completed': {
      const w = state.workers[event.workerId];
      if (!w) return state;
      const next: Worker = {
        ...w,
        tasksCompleted: w.tasksCompleted + 1,
        lastEventAt: event.t,
      };
      const totals = cloneTotals(state);
      totals.tasksCompleted += 1;
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        totals,
        revision: state.revision + 1,
      };
    }

    case 'worker.errored': {
      const w = state.workers[event.workerId];
      if (!w) return state;
      const next: Worker = {
        ...w,
        errorCount: w.errorCount + 1,
        lastError: event.message,
        lastEventAt: event.t,
      };
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        revision: state.revision + 1,
      };
    }

    case 'worker.despawned': {
      const w = state.workers[event.workerId];
      if (!w) return state;
      if (!w.alive) {
        return { ...state, revision: state.revision + 1 };
      }
      const next: Worker = {
        ...w,
        alive: false,
        despawnedAt: event.t,
        lastEventAt: event.t,
      };
      const totals = cloneTotals(state);
      totals.workersAlive = Math.max(0, totals.workersAlive - 1);
      return {
        ...state,
        workers: { ...state.workers, [event.workerId]: next },
        totals,
        revision: state.revision + 1,
      };
    }
  }
}

export function reduceMany(state: WorldState, events: DashboardEvent[]): WorldState {
  let s = state;
  for (const e of events) s = reduce(s, e);
  return s;
}
