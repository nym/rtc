import {
  makeContext, upsertProject, upsertMcpServer, spawnWorker,
  harvestOnce, mcpCallOnce, despawnWorker, sleep,
} from '../simulator-core.js';
import type { EventSink } from '../simulator-core.js';

export interface Cc3McpOpts {
  sink: EventSink;
  durationMin?: number;
  uuidSeed?: number;
  fixedTime?: number;
  speed?: number;
}

interface WorkerSpec {
  id: string;
  label: string;
  thinkMs: number;
  workMs: number;
  tokens: number;
  /** Probability per loop iteration that this worker hits the MCP server instead of harvesting. */
  mcpRatio: number;
  mcpTool: string;
}

const WORKERS: WorkerSpec[] = [
  { id: 'cc-orion',  label: 'Orion',  thinkMs: 700,  workMs: 1100, tokens: 240, mcpRatio: 0.35, mcpTool: 'list_issues' },
  { id: 'cc-lyra',   label: 'Lyra',   thinkMs: 900,  workMs: 1300, tokens: 320, mcpRatio: 0.50, mcpTool: 'search_files' },
  { id: 'cc-vega',   label: 'Vega',   thinkMs: 600,  workMs:  900, tokens: 180, mcpRatio: 0.25, mcpTool: 'fetch_doc' },
];

const MCP_SERVERS = [
  { id: 'demo-cc3:github', name: 'github' },
  { id: 'demo-cc3:fs',     name: 'fs'     },
] as const;

export async function runCc3Mcp(opts: Cc3McpOpts): Promise<void> {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });
  const projectId = 'demo-cc3';

  await upsertProject(ctx, {
    id: projectId,
    name: 'CC3 Outpost',
    color: '#5fa8d3',
    // Fan patches across the camera-near arc so the formation reads as "below" the base
    // in the iso view.
    patchArcCenter: Math.PI / 2,
  });

  for (const s of MCP_SERVERS) {
    await upsertMcpServer(ctx, { id: s.id, name: s.name, projectId });
  }

  for (const [i, w] of WORKERS.entries()) {
    await spawnWorker(ctx, {
      projectId, workerId: w.id, label: w.label,
      pid: 91000 + i,
      source: 'claude-code',
    });
  }

  const staggers = [0, 250, 500];
  const wallStart = Date.now();
  const stopAt = opts.durationMin ? wallStart + opts.durationMin * 60_000 : Number.POSITIVE_INFINITY;

  await Promise.all(WORKERS.map(async (w, i) => {
    await sleep(staggers[i]! / speed);
    let runs = 0;
    // Deterministic-feeling pseudo-random by hashing iteration with worker id char codes
    const seed = w.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    while (Date.now() < stopAt) {
      runs++;
      // Cheap deterministic 0..1 from runs+seed
      const r = ((seed * (runs + 13)) % 1000) / 1000;
      if (r < w.mcpRatio) {
        const server = MCP_SERVERS[runs % MCP_SERVERS.length]!;
        await mcpCallOnce(ctx, w.id, server.name, w.mcpTool, {
          thinkMs: w.thinkMs / speed,
          workMs:  w.workMs / speed,
          tokens:  Math.floor(w.tokens * 0.4),
        });
      } else {
        await harvestOnce(ctx, w.id, {
          thinkMs: w.thinkMs / speed,
          workMs:  w.workMs / speed,
          tokens:  w.tokens,
        });
      }
    }
    await despawnWorker(ctx, { workerId: w.id, reason: 'completed' });
  }));
}
