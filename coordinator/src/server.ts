import http from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import {
  initialWorldState,
  reduce,
  type DashboardEvent,
  type ServerMessage,
  type ClientMessage,
  type WorldState,
} from '@rtc/core';
import { COORDINATOR_HOST, COORDINATOR_PORT, EVENTS_JSONL } from '@rtc/core/config-node';
import { JsonlLog } from './jsonl.js';
import { PidRegistry } from './pid-registry.js';
import { makeKillExecutor, type KillExecutorOpts } from './kill.js';

export interface CoordinatorOpts {
  port?: number;
  host?: string;
  jsonlPath?: string;
  killOpts?: KillExecutorOpts;
  /** Skip JSONL persistence + replay. Used in tests. */
  ephemeral?: boolean;
}

export interface CoordinatorHandle {
  fastify: FastifyInstance;
  port: number;
  state: () => WorldState;
  ingestEvent: (e: DashboardEvent) => Promise<void>;
  close: () => Promise<void>;
}

export async function startCoordinator(opts: CoordinatorOpts = {}): Promise<CoordinatorHandle> {
  const port = opts.port ?? COORDINATOR_PORT;
  const host = opts.host ?? COORDINATOR_HOST;
  const ephemeral = opts.ephemeral ?? false;

  const jsonl = ephemeral ? null : new JsonlLog(opts.jsonlPath ?? EVENTS_JSONL);
  const pids = new PidRegistry();
  const killPid = makeKillExecutor(opts.killOpts ?? {});

  let state: WorldState = initialWorldState();

  if (jsonl) {
    await jsonl.open();
    for await (const e of jsonl.replay()) {
      state = reduce(state, e);
      pids.apply(e);
    }
  }

  const httpServer = http.createServer();
  const fastify = Fastify({ logger: false, serverFactory: (handler) => {
    httpServer.on('request', handler);
    return httpServer;
  } });

  fastify.get('/healthz', async () => 'ok');
  fastify.get('/state', async () => state);
  fastify.post('/events', async (req, reply) => {
    const body = req.body as DashboardEvent | DashboardEvent[];
    const events = Array.isArray(body) ? body : [body];
    for (const e of events) await ingest(e);
    return reply.code(202).send({ accepted: events.length });
  });

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url || !request.url.startsWith('/stream')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      clients.add(ws);
      send(ws, { type: 'snapshot', state, serverTime: Date.now() });

      ws.on('message', async (raw) => {
        let msg: ClientMessage;
        try { msg = JSON.parse(String(raw)) as ClientMessage; }
        catch { return; }
        if (msg.type !== 'command') return;
        const cmd = msg.command;
        if (cmd.kind === 'worker.kill') {
          const entry = pids.get(cmd.workerId);
          if (!entry) {
            send(ws, { type: 'command_result', commandId: cmd.commandId, ok: false, error: 'unknown worker' });
            return;
          }
          const result = await killPid(entry.pid);
          send(ws, {
            type: 'command_result',
            commandId: cmd.commandId,
            ok: result.ok,
            ...(result.error ? { error: result.error } : {}),
          });
          if (result.ok) {
            await ingest({
              kind: 'worker.despawned',
              t: Date.now(), eventId: `kill-${cmd.commandId}`,
              workerId: cmd.workerId, reason: 'killed',
            });
          }
        }
      });

      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
    });
  });

  async function ingest(e: DashboardEvent): Promise<void> {
    state = reduce(state, e);
    pids.apply(e);
    if (jsonl) await jsonl.append(e);
    broadcast({ type: 'event', event: e });
  }

  function broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const c of clients) {
      if (c.readyState === c.OPEN) c.send(data);
    }
  }

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  await fastify.ready();
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });
  const addr = httpServer.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : port;

  return {
    fastify,
    port: boundPort,
    state: () => state,
    ingestEvent: ingest,
    async close() {
      for (const c of clients) {
        try { c.close(); } catch { /* ignore */ }
      }
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await fastify.close();
      if (jsonl) await jsonl.close();
    },
  };
}
