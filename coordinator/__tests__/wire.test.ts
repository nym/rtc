import { describe, expect, test, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { startCoordinator, type CoordinatorHandle } from '../src/index.js';
import type { DashboardEvent, ServerMessage } from '@rtc/core';

let active: CoordinatorHandle | null = null;

afterEach(async () => {
  if (active) {
    await active.close();
    active = null;
  }
});

const startEphemeral = async (): Promise<CoordinatorHandle> => {
  active = await startCoordinator({
    port: 0,
    host: '127.0.0.1',
    ephemeral: true,
    killOpts: { graceMs: 1, killFn: () => { /* noop */ } },
  });
  return active;
};

interface BufferedWs {
  ws: WebSocket;
  await: (predicate: (m: ServerMessage) => boolean) => Promise<ServerMessage>;
  close: () => void;
}

const openWs = async (port: number): Promise<BufferedWs> => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
  const queue: ServerMessage[] = [];
  const waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

  ws.on('message', (raw: unknown) => {
    let msg: ServerMessage;
    try { msg = JSON.parse(String(raw)) as ServerMessage; } catch { return; }
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i]!;
      if (w.predicate(msg)) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(msg);
        return;
      }
    }
    queue.push(msg);
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', (e) => reject(e));
  });

  return {
    ws,
    await(predicate) {
      const matched = queue.findIndex(predicate);
      if (matched >= 0) {
        const [msg] = queue.splice(matched, 1);
        return Promise.resolve(msg!);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error('timeout'));
        }, 4000);
        waiters.push({ predicate, resolve, reject, timer });
      });
    },
    close() { ws.close(); },
  };
};

describe('wire protocol', () => {
  test('GET /healthz responds with ok', async () => {
    const handle = await startEphemeral();
    const res = await fetch(`http://127.0.0.1:${handle.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ok');
  });

  test('POST /events accepts a single event and persists in state', async () => {
    const handle = await startEphemeral();
    const event: DashboardEvent = {
      kind: 'project.upserted', t: 1, eventId: 'p1',
      project: { id: 'p1', name: 'P1' },
    };
    const res = await fetch(`http://127.0.0.1:${handle.port}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(202);
    expect(handle.state().projects['p1']?.name).toBe('P1');
  });

  test('POST /events accepts an array', async () => {
    const handle = await startEphemeral();
    const events: DashboardEvent[] = [
      { kind: 'project.upserted', t: 1, eventId: 'p1', project: { id: 'p1', name: 'P1' } },
      { kind: 'worker.spawned', t: 2, eventId: 's1', projectId: 'p1', workerId: 'w1', source: 'sdk-script' },
    ];
    const res = await fetch(`http://127.0.0.1:${handle.port}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(events),
    });
    expect(res.status).toBe(202);
    expect(handle.state().workers['w1']?.alive).toBe(true);
  });

  test('WS /stream sends a snapshot on connect', async () => {
    const handle = await startEphemeral();
    await handle.ingestEvent({
      kind: 'project.upserted', t: 1, eventId: 'p1', project: { id: 'p1', name: 'A' },
    });
    const buf = await openWs(handle.port);
    const snap = await buf.await((m) => m.type === 'snapshot');
    expect(snap.type).toBe('snapshot');
    if (snap.type === 'snapshot') {
      expect(snap.state.projects['p1']?.name).toBe('A');
    }
    buf.close();
  });

  test('WS /stream broadcasts events after the snapshot', async () => {
    const handle = await startEphemeral();
    const buf = await openWs(handle.port);
    await buf.await((m) => m.type === 'snapshot');
    const eventP = buf.await((m) => m.type === 'event');
    await handle.ingestEvent({
      kind: 'project.upserted', t: 1, eventId: 'p2', project: { id: 'p2', name: 'B' },
    });
    const msg = await eventP;
    expect(msg.type).toBe('event');
    if (msg.type === 'event' && msg.event.kind === 'project.upserted') {
      expect(msg.event.project.name).toBe('B');
    }
    buf.close();
  });

  test('worker.kill command returns command_result', async () => {
    const handle = await startEphemeral();
    await handle.ingestEvent({
      kind: 'worker.spawned', t: 1, eventId: 's', projectId: 'p1', workerId: 'w1', source: 'sdk-script', pid: 99999,
    });
    const buf = await openWs(handle.port);
    await buf.await((m) => m.type === 'snapshot');
    const resultP = buf.await((m) => m.type === 'command_result');
    buf.ws.send(JSON.stringify({
      type: 'command',
      command: { commandId: 'c1', kind: 'worker.kill', workerId: 'w1' },
    }));
    const msg = await resultP;
    expect(msg.type).toBe('command_result');
    if (msg.type === 'command_result') {
      expect(msg.commandId).toBe('c1');
      expect(msg.ok).toBe(true);
    }
    buf.close();
  });
});
