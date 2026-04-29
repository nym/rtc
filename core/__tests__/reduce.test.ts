import { describe, expect, test } from 'vitest';
import { initialWorldState, reduce, reduceMany } from '../src/index.js';
import type { DashboardEvent } from '../src/index.js';

const projectUpserted = (id: string, t = 1): DashboardEvent => ({
  kind: 'project.upserted', t, eventId: `p-${id}-${t}`,
  project: { id, name: id, color: '#abcdef' },
});

const workerSpawned = (workerId: string, projectId = 'p1', t = 2): DashboardEvent => ({
  kind: 'worker.spawned', t, eventId: `s-${workerId}-${t}`,
  projectId, workerId, source: 'sdk-script', pid: 1234, label: workerId,
});

describe('reduce', () => {
  test('empty initial state has zero totals', () => {
    const s = initialWorldState();
    expect(s.totals.workersTotal).toBe(0);
    expect(s.totals.workersAlive).toBe(0);
    expect(s.revision).toBe(0);
  });

  test('project.upserted adds the project', () => {
    const s0 = initialWorldState();
    const s1 = reduce(s0, projectUpserted('p1'));
    expect(s1.projects['p1']?.name).toBe('p1');
    expect(s1.revision).toBe(1);
  });

  test('project.upserted replaces an existing project', () => {
    const s0 = reduce(initialWorldState(), projectUpserted('p1'));
    const s1 = reduce(s0, {
      kind: 'project.upserted', t: 5, eventId: 'p-rename',
      project: { id: 'p1', name: 'renamed' },
    });
    expect(s1.projects['p1']?.name).toBe('renamed');
  });

  test('worker.spawned increments workersTotal and workersAlive', () => {
    let s = initialWorldState();
    s = reduce(s, projectUpserted('p1'));
    s = reduce(s, workerSpawned('w1'));
    expect(s.totals.workersTotal).toBe(1);
    expect(s.totals.workersAlive).toBe(1);
    expect(s.workers['w1']?.alive).toBe(true);
  });

  test('worker.activity updates only the activity field', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, {
      kind: 'worker.activity', t: 3, eventId: 'a1',
      workerId: 'w1', activity: 'tool_use', detail: 'harvest',
    });
    expect(s.workers['w1']?.activity).toBe('tool_use');
  });

  test('worker.activity for an unknown worker is a no-op', () => {
    const s0 = initialWorldState();
    const s1 = reduce(s0, {
      kind: 'worker.activity', t: 1, eventId: 'a',
      workerId: 'unknown', activity: 'idle',
    });
    expect(s1).toBe(s0);
  });

  test('tokens.consumed accumulates per worker and into totals', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, {
      kind: 'tokens.consumed', t: 4, eventId: 't1',
      workerId: 'w1', model: 'claude-sonnet-4-6',
      inputTokens: 1000, outputTokens: 200,
      cacheReadTokens: 50, cacheWriteTokens: 25,
      usd: 0.05,
    });
    expect(s.workers['w1']?.inputTokens).toBe(1000);
    expect(s.workers['w1']?.outputTokens).toBe(200);
    expect(s.workers['w1']?.cacheReadTokens).toBe(50);
    expect(s.workers['w1']?.cacheWriteTokens).toBe(25);
    expect(s.workers['w1']?.usd).toBeCloseTo(0.05, 6);
    expect(s.totals.inputTokens).toBe(1000);
    expect(s.totals.outputTokens).toBe(200);
    expect(s.totals.usd).toBeCloseTo(0.05, 6);
  });

  test('task.completed bumps tasksCompleted on worker and totals', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, { kind: 'task.completed', t: 5, eventId: 'c1', workerId: 'w1', taskName: 'x' });
    s = reduce(s, { kind: 'task.completed', t: 6, eventId: 'c2', workerId: 'w1' });
    expect(s.workers['w1']?.tasksCompleted).toBe(2);
    expect(s.totals.tasksCompleted).toBe(2);
  });

  test('worker.errored increments errorCount and stores lastError', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, {
      kind: 'worker.errored', t: 7, eventId: 'e1',
      workerId: 'w1', message: 'rate limit', recoverable: true,
    });
    expect(s.workers['w1']?.errorCount).toBe(1);
    expect(s.workers['w1']?.lastError).toBe('rate limit');
  });

  test('worker.despawned flips alive=false and decrements workersAlive', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    expect(s.totals.workersAlive).toBe(1);
    s = reduce(s, {
      kind: 'worker.despawned', t: 9, eventId: 'd1',
      workerId: 'w1', reason: 'killed',
    });
    expect(s.workers['w1']?.alive).toBe(false);
    expect(s.totals.workersAlive).toBe(0);
    expect(s.totals.workersTotal).toBe(1);
  });

  test('despawning an already-dead worker does not double-decrement', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, { kind: 'worker.despawned', t: 9, eventId: 'd1', workerId: 'w1', reason: 'completed' });
    s = reduce(s, { kind: 'worker.despawned', t: 10, eventId: 'd2', workerId: 'w1', reason: 'completed' });
    expect(s.totals.workersAlive).toBe(0);
  });

  test('revision counter is monotonic across multiple events', () => {
    let s = initialWorldState();
    const start = s.revision;
    s = reduceMany(s, [projectUpserted('p1'), workerSpawned('w1'), workerSpawned('w2'), {
      kind: 'task.completed', t: 11, eventId: 'c', workerId: 'w1',
    }]);
    expect(s.revision).toBeGreaterThan(start);
    expect(s.revision).toBe(start + 4);
  });

  test('worker.context sets contextTokens and modelLimit on the worker', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, {
      kind: 'worker.context', t: 12, eventId: 'ctx1',
      workerId: 'w1', contextTokens: 12345, modelLimit: 200000,
    });
    expect(s.workers['w1']?.contextTokens).toBe(12345);
    expect(s.workers['w1']?.modelLimit).toBe(200000);
    expect(s.workers['w1']?.lastEventAt).toBe(12);
  });

  test('worker.context for an unknown worker is a no-op', () => {
    const s0 = reduce(initialWorldState(), projectUpserted('p1'));
    const s1 = reduce(s0, {
      kind: 'worker.context', t: 13, eventId: 'ctx-noop',
      workerId: 'unknown', contextTokens: 100,
    });
    expect(s1).toBe(s0);
  });

  test('worker.notification is a no-op state change but bumps lastEventAt and revision', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    const before = s.workers['w1']!;
    const revBefore = s.revision;
    s = reduce(s, {
      kind: 'worker.notification', t: 99, eventId: 'n1',
      workerId: 'w1', level: 'warn', message: 'permission required',
    });
    const after = s.workers['w1']!;
    // Substantive fields unchanged
    expect(after.activity).toBe(before.activity);
    expect(after.errorCount).toBe(before.errorCount);
    expect(after.inputTokens).toBe(before.inputTokens);
    expect(after.lastError).toBe(before.lastError);
    // lastEventAt and revision both bumped
    expect(after.lastEventAt).toBe(99);
    expect(s.revision).toBe(revBefore + 1);
  });

  test('worker.notification for an unknown worker is a no-op', () => {
    const s0 = reduce(initialWorldState(), projectUpserted('p1'));
    const s1 = reduce(s0, {
      kind: 'worker.notification', t: 1, eventId: 'n-noop',
      workerId: 'unknown', level: 'info', message: 'x',
    });
    expect(s1).toBe(s0);
  });

  test('session.compact_imminent flips compactImminent=true on the worker', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    expect(s.workers['w1']?.compactImminent).toBeUndefined();
    s = reduce(s, {
      kind: 'session.compact_imminent', t: 20, eventId: 'ci1',
      workerId: 'w1', trigger: 'auto',
    });
    expect(s.workers['w1']?.compactImminent).toBe(true);
    expect(s.workers['w1']?.lastEventAt).toBe(20);
  });

  test('session.compacted flips compactImminent=false on the worker', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, {
      kind: 'session.compact_imminent', t: 21, eventId: 'ci2', workerId: 'w1',
    });
    expect(s.workers['w1']?.compactImminent).toBe(true);
    s = reduce(s, {
      kind: 'session.compacted', t: 22, eventId: 'cd1', workerId: 'w1',
    });
    expect(s.workers['w1']?.compactImminent).toBe(false);
    expect(s.workers['w1']?.lastEventAt).toBe(22);
  });

  test('worker.spawned carries through parentWorkerId and agentType when set', () => {
    let s = initialWorldState();
    s = reduce(s, projectUpserted('p1'));
    s = reduce(s, {
      kind: 'worker.spawned', t: 30, eventId: 'spawn-sub',
      projectId: 'p1', workerId: 'sub-A', source: 'claude-code',
      parentWorkerId: 'parent-1', agentType: 'Explore',
    });
    expect(s.workers['sub-A']?.parentWorkerId).toBe('parent-1');
    expect(s.workers['sub-A']?.agentType).toBe('Explore');
  });

  test('mcp.server.upserted inserts a new server keyed by id with firstSeen=lastSeen=event.t', () => {
    let s = initialWorldState();
    const revBefore = s.revision;
    s = reduce(s, {
      kind: 'mcp.server.upserted', t: 42, eventId: 'mcp-1',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });
    const srv = s.mcpServers['p1:github'];
    expect(srv).toBeDefined();
    expect(srv?.name).toBe('github');
    expect(srv?.projectId).toBe('p1');
    expect(srv?.firstSeen).toBe(42);
    expect(srv?.lastSeen).toBe(42);
    expect(s.revision).toBe(revBefore + 1);
  });

  test('mcp.server.upserted for an existing id updates name/projectId/lastSeen but preserves firstSeen', () => {
    let s = initialWorldState();
    s = reduce(s, {
      kind: 'mcp.server.upserted', t: 100, eventId: 'mcp-first',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });
    const revAfterFirst = s.revision;
    s = reduce(s, {
      kind: 'mcp.server.upserted', t: 250, eventId: 'mcp-second',
      server: { id: 'p1:github', name: 'github-renamed', projectId: 'p2' },
    });
    const srv = s.mcpServers['p1:github'];
    expect(srv?.firstSeen).toBe(100);
    expect(srv?.lastSeen).toBe(250);
    expect(srv?.name).toBe('github-renamed');
    expect(srv?.projectId).toBe('p2');
    expect(s.revision).toBe(revAfterFirst + 1);
  });

  test('project.upserted carries through patchArcCenter when set', () => {
    let s = initialWorldState();
    s = reduce(s, {
      kind: 'project.upserted', t: 1, eventId: 'p-arc',
      project: { id: 'p1', name: 'p1', patchArcCenter: -Math.PI / 2 },
    });
    expect(s.projects['p1']?.patchArcCenter).toBeCloseTo(-Math.PI / 2, 9);
  });

  test('worker.removed deletes the worker from state.workers', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    s = reduce(s, { kind: 'worker.despawned', t: 9, eventId: 'd1', workerId: 'w1', reason: 'completed' });
    expect(s.workers['w1']).toBeDefined();
    s = reduce(s, { kind: 'worker.removed', t: 100, eventId: 'r1', workerId: 'w1' });
    expect(s.workers['w1']).toBeUndefined();
    // Removing a dead worker should not change workersAlive (already 0).
    expect(s.totals.workersAlive).toBe(0);
    // workersTotal is the lifetime counter — it does not decrement.
    expect(s.totals.workersTotal).toBe(1);
  });

  test('worker.removed decrements workersAlive if the worker was still alive', () => {
    let s = reduceMany(initialWorldState(), [projectUpserted('p1'), workerSpawned('w1')]);
    expect(s.totals.workersAlive).toBe(1);
    s = reduce(s, { kind: 'worker.removed', t: 50, eventId: 'r-live', workerId: 'w1' });
    expect(s.workers['w1']).toBeUndefined();
    expect(s.totals.workersAlive).toBe(0);
  });

  test('worker.removed for an unknown workerId is a no-op', () => {
    const s0 = reduce(initialWorldState(), projectUpserted('p1'));
    const s1 = reduce(s0, { kind: 'worker.removed', t: 1, eventId: 'r-noop', workerId: 'unknown' });
    expect(s1).toBe(s0);
    expect(s1.revision).toBe(s0.revision);
  });

  test('mcp.server.removed deletes the server from state.mcpServers', () => {
    let s = initialWorldState();
    s = reduce(s, {
      kind: 'mcp.server.upserted', t: 10, eventId: 'mcp-up',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });
    expect(s.mcpServers['p1:github']).toBeDefined();
    const revBefore = s.revision;
    s = reduce(s, { kind: 'mcp.server.removed', t: 20, eventId: 'mcp-rm', serverId: 'p1:github' });
    expect(s.mcpServers['p1:github']).toBeUndefined();
    expect(s.revision).toBe(revBefore + 1);
  });

  test('mcp.server.removed for an unknown serverId is a no-op', () => {
    const s0 = initialWorldState();
    const s1 = reduce(s0, { kind: 'mcp.server.removed', t: 1, eventId: 'mcp-rm-noop', serverId: 'unknown' });
    expect(s1).toBe(s0);
    expect(s1.revision).toBe(s0.revision);
  });

  test('project.upserted on a new project sets lastSeen and createdAt to event.t', () => {
    let s = initialWorldState();
    s = reduce(s, projectUpserted('p1', 42));
    const p = s.projects['p1'];
    expect(p?.lastSeen).toBe(42);
    expect(p?.createdAt).toBe(42);
    expect(p?.createdAt).toBe(p?.lastSeen);
  });

  test('project.upserted on an existing project bumps lastSeen but preserves createdAt', () => {
    let s = initialWorldState();
    s = reduce(s, projectUpserted('p1', 100));
    expect(s.projects['p1']?.createdAt).toBe(100);
    expect(s.projects['p1']?.lastSeen).toBe(100);
    s = reduce(s, projectUpserted('p1', 500));
    expect(s.projects['p1']?.createdAt).toBe(100);
    expect(s.projects['p1']?.lastSeen).toBe(500);
  });

  test('project.removed deletes the project from state and bumps revision', () => {
    let s = initialWorldState();
    s = reduce(s, projectUpserted('p1', 1));
    expect(s.projects['p1']).toBeDefined();
    const revBefore = s.revision;
    s = reduce(s, { kind: 'project.removed', t: 50, eventId: 'p-rm', projectId: 'p1' });
    expect(s.projects['p1']).toBeUndefined();
    expect(s.revision).toBe(revBefore + 1);
  });

  test('project.removed for an unknown projectId is a no-op', () => {
    const s0 = initialWorldState();
    const s1 = reduce(s0, { kind: 'project.removed', t: 1, eventId: 'p-rm-noop', projectId: 'unknown' });
    expect(s1).toBe(s0);
    expect(s1.revision).toBe(s0.revision);
  });
});
