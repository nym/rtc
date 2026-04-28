import { describe, expect, test, afterEach } from 'vitest';
import { startCoordinator, type CoordinatorHandle } from '../src/index.js';
import type { DashboardEvent } from '@rtc/core';

const STALE_TTL_MS = 3 * 60 * 1000; // matches core/src/config.ts default
const FADE_MS = 5 * 60 * 1000;       // matches core/src/config.ts default

let active: CoordinatorHandle | null = null;
let fakeNow = 0;

afterEach(async () => {
  if (active) {
    await active.close();
    active = null;
  }
});

const startEphemeral = async (initialNow: number): Promise<CoordinatorHandle> => {
  fakeNow = initialNow;
  active = await startCoordinator({
    port: 0,
    host: '127.0.0.1',
    ephemeral: true,
    sweepIntervalMs: 0, // disable periodic timer; tests call sweepStale() manually
    now: () => fakeNow,
    killOpts: { graceMs: 1, killFn: () => { /* noop */ } },
  });
  return active;
};

const projectUpserted = (id: string, t: number): DashboardEvent => ({
  kind: 'project.upserted', t, eventId: `p-${id}-${t}`,
  project: { id, name: id },
});

const workerSpawned = (workerId: string, t: number, projectId = 'p1'): DashboardEvent => ({
  kind: 'worker.spawned', t, eventId: `s-${workerId}-${t}`,
  projectId, workerId, source: 'sdk-script', pid: 1234, label: workerId,
});

describe('coordinator stale sweeper', () => {
  test('sweeps idle workers as unresponsive', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent(projectUpserted('p1', 1000));
    await handle.ingestEvent(workerSpawned('w1', 1000));
    expect(handle.state().workers['w1']?.alive).toBe(true);

    fakeNow = 1000 + STALE_TTL_MS + 1;
    await handle.sweepStale();

    const w = handle.state().workers['w1'];
    expect(w).toBeDefined();
    expect(w?.alive).toBe(false);
    // alive=false implies a worker.despawned event fired; reason is 'unresponsive'
    // when the sweeper synthesizes it (vs. 'killed'/'completed' from other paths).
    expect(handle.state().totals.workersAlive).toBe(0);
  });

  test('does not despawn workers with recent activity', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent(projectUpserted('p1', 1000));
    await handle.ingestEvent(workerSpawned('w1', 1000));
    // Activity at t = STALE_TTL_MS - 1000 keeps lastEventAt fresh.
    const activityT = STALE_TTL_MS - 1000;
    await handle.ingestEvent({
      kind: 'worker.activity', t: activityT, eventId: 'a1',
      workerId: 'w1', activity: 'tool_use',
    });

    // Advance now past STALE_TTL_MS, but keep within the window since activity.
    fakeNow = STALE_TTL_MS + 500;
    await handle.sweepStale();

    expect(handle.state().workers['w1']?.alive).toBe(true);
    expect(handle.state().totals.workersAlive).toBe(1);
  });

  test('removes dead workers after fade', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent(projectUpserted('p1', 1000));
    await handle.ingestEvent(workerSpawned('w1', 1000));
    await handle.ingestEvent({
      kind: 'worker.despawned', t: 10_000, eventId: 'd1',
      workerId: 'w1', reason: 'completed',
    });
    expect(handle.state().workers['w1']?.alive).toBe(false);

    fakeNow = 10_000 + FADE_MS + 1;
    await handle.sweepStale();

    expect(handle.state().workers['w1']).toBeUndefined();
  });

  test('does NOT remove a recently-despawned worker', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent(projectUpserted('p1', 1000));
    await handle.ingestEvent(workerSpawned('w1', 1000));
    await handle.ingestEvent({
      kind: 'worker.despawned', t: 10_000, eventId: 'd1',
      workerId: 'w1', reason: 'completed',
    });

    fakeNow = 10_000 + FADE_MS - 1000;
    await handle.sweepStale();

    const w = handle.state().workers['w1'];
    expect(w).toBeDefined();
    expect(w?.alive).toBe(false);
  });

  test('removes stale MCP servers', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent({
      kind: 'mcp.server.upserted', t: 1000, eventId: 'mcp-1',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });
    expect(handle.state().mcpServers['p1:github']).toBeDefined();

    fakeNow = 1000 + STALE_TTL_MS + 1;
    await handle.sweepStale();

    expect(handle.state().mcpServers['p1:github']).toBeUndefined();
  });

  test('refreshes lastSeen on re-upsert so server stays alive', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent({
      kind: 'mcp.server.upserted', t: 1000, eventId: 'mcp-1',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });
    await handle.ingestEvent({
      kind: 'mcp.server.upserted', t: STALE_TTL_MS, eventId: 'mcp-2',
      server: { id: 'p1:github', name: 'github', projectId: 'p1' },
    });

    fakeNow = STALE_TTL_MS + 1000;
    await handle.sweepStale();

    expect(handle.state().mcpServers['p1:github']).toBeDefined();
  });

  test('sweep with no stale items emits nothing', async () => {
    const handle = await startEphemeral(1000);
    await handle.ingestEvent(projectUpserted('p1', 1000));
    await handle.ingestEvent(workerSpawned('w1', 1000));
    const revBefore = handle.state().revision;

    fakeNow = 2000; // well within TTL
    await handle.sweepStale();

    expect(handle.state().revision).toBe(revBefore);
  });
});
