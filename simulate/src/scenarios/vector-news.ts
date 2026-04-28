// Replay of the "vector signals in LLMs" research session that fired through
// the Claude Code hooks: one parent session worker + five Explore subagents,
// each making a handful of WebSearch / WebFetch tool calls before reporting
// back. Mirrors the event stream SessionStart → SubagentStart × N → PreToolUse
// / PostToolUse cascades → SubagentStop × N → (session continues) would emit.

import {
  makeContext, upsertProject, setActivity, consumeTokens, completeTask,
  errorWorker, sleep, type EventSink, type SimContext,
} from '../simulator-core.js';
import type { DashboardEvent } from '@rtc/core';

export interface VectorNewsOpts {
  sink: EventSink;
  /** Wallclock dilation; 1.0 = real-time, 0.25 = 4× faster. */
  speed?: number;
  uuidSeed?: number;
  fixedTime?: number;
}

const PROJECT_ID = 'rtc';
const PROJECT_NAME = 'rtc';
const PARENT_WORKER_ID = 'cc-research-parent';
const PARENT_LABEL = 'Research Lead';

interface SubagentSpec {
  id: string;
  label: string;
  /** What this Explore agent was tasked with looking for. */
  topic: string;
  /** Sequence of tool calls fired during the subagent's run. */
  toolCalls: Array<{ tool: string; detail: string; thinkMs: number; workMs: number }>;
  /** Total tokens this subagent burned (claude-code transcript-style aggregate). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Did this agent surface a recoverable error mid-run? */
  errorAfter?: number;
}

const SUBAGENTS: SubagentSpec[] = [
  {
    id: 'agent-arxiv', label: 'Arxiv', topic: 'arxiv.org sparse autoencoder steering',
    toolCalls: [
      { tool: 'WebSearch', detail: 'arxiv vector signals LLM 2025', thinkMs: 600, workMs: 2200 },
      { tool: 'WebFetch',  detail: 'arxiv.org/abs/2509.23799',     thinkMs: 800, workMs: 2400 },
      { tool: 'WebSearch', detail: 'sparse representation steering', thinkMs: 700, workMs: 2000 },
      { tool: 'WebFetch',  detail: 'arxiv.org/abs/2503.16851',     thinkMs: 600, workMs: 2200 },
      { tool: 'WebFetch',  detail: 'arxiv.org/abs/2509.03738',     thinkMs: 700, workMs: 2300 },
    ],
    inputTokens: 18_400, outputTokens: 2_100, cacheReadTokens: 14_200,
  },
  {
    id: 'agent-hn', label: 'HackerNews', topic: 'hacker news vector signal threads',
    toolCalls: [
      { tool: 'WebSearch', detail: 'site:news.ycombinator.com vector LLM', thinkMs: 500, workMs: 1900 },
      { tool: 'WebFetch',  detail: 'news.ycombinator.com/item?id=47618223', thinkMs: 600, workMs: 1800 },
      { tool: 'WebFetch',  detail: 'news.ycombinator.com/item?id=46616529', thinkMs: 700, workMs: 2000 },
      { tool: 'WebFetch',  detail: 'news.ycombinator.com/item?id=47159833', thinkMs: 600, workMs: 1700 },
    ],
    inputTokens: 14_800, outputTokens: 1_600, cacheReadTokens: 11_900,
    errorAfter: 2,
  },
  {
    id: 'agent-blogs', label: 'Blogs', topic: 'AI lab engineering blogs',
    toolCalls: [
      { tool: 'WebSearch', detail: 'anthropic emotion concepts', thinkMs: 600, workMs: 2100 },
      { tool: 'WebFetch',  detail: 'anthropic.com/research/emotion-concepts-function', thinkMs: 800, workMs: 2600 },
      { tool: 'WebFetch',  detail: 'mistral.ai/news/codestral-embed', thinkMs: 700, workMs: 2200 },
      { tool: 'WebFetch',  detail: 'engineering.fb.com/2026/03/31/...', thinkMs: 700, workMs: 2300 },
      { tool: 'WebFetch',  detail: 'anthropic.com/research/evaluating-feature-steering', thinkMs: 700, workMs: 2200 },
    ],
    inputTokens: 22_100, outputTokens: 2_400, cacheReadTokens: 17_600,
  },
  {
    id: 'agent-twitter', label: 'Twitter', topic: 'x.com vector signal posts',
    toolCalls: [
      { tool: 'WebSearch', detail: 'site:x.com vector signals LLM',  thinkMs: 500, workMs: 1700 },
      { tool: 'WebFetch',  detail: 'x.com/AnthropicAI/status/1951...', thinkMs: 600, workMs: 1900 },
      { tool: 'WebFetch',  detail: 'x.com/karpathy/status/1647...',    thinkMs: 600, workMs: 1700 },
      { tool: 'WebSearch', detail: 'site:twitter.com steering vectors', thinkMs: 500, workMs: 1600 },
    ],
    inputTokens: 12_400, outputTokens: 1_400, cacheReadTokens: 9_800,
    errorAfter: 1,
  },
  {
    id: 'agent-vendors', label: 'Vendors', topic: 'vector DB + embedding announcements',
    toolCalls: [
      { tool: 'WebSearch', detail: 'voyage 4 embedding model',     thinkMs: 600, workMs: 2000 },
      { tool: 'WebFetch',  detail: 'blog.voyageai.com/2026/01/15/voyage-4', thinkMs: 700, workMs: 2200 },
      { tool: 'WebFetch',  detail: 'infoq.com pinecone DRN',        thinkMs: 600, workMs: 1900 },
      { tool: 'WebFetch',  detail: 'siliconangle cohere embed v4',  thinkMs: 700, workMs: 2100 },
      { tool: 'WebFetch',  detail: 'siliconangle qdrant gpu hnsw',  thinkMs: 700, workMs: 2200 },
      { tool: 'WebFetch',  detail: 'weaviate.io/blog/embeddings',   thinkMs: 600, workMs: 2000 },
    ],
    inputTokens: 24_700, outputTokens: 2_700, cacheReadTokens: 19_300,
  },
];

function spawnEvent(ctx: SimContext, args: {
  projectId: string; workerId: string; label?: string; pid?: number;
  source: 'claude-code' | 'sdk-script';
  parentWorkerId?: string; agentType?: string;
}): Promise<void> | void {
  const event: DashboardEvent = {
    kind: 'worker.spawned',
    t: ctx.now(), eventId: ctx.uuid(),
    projectId: args.projectId,
    workerId: args.workerId,
    source: args.source,
    hostname: 'simulator',
    ...(args.label ? { label: args.label } : {}),
    ...(args.pid !== undefined ? { pid: args.pid } : {}),
    ...(args.parentWorkerId ? { parentWorkerId: args.parentWorkerId } : {}),
    ...(args.agentType ? { agentType: args.agentType } : {}),
  };
  return ctx.sink(event);
}

function despawn(ctx: SimContext, workerId: string, reason: 'completed' | 'killed' | 'crashed' = 'completed'): Promise<void> | void {
  const event: DashboardEvent = {
    kind: 'worker.despawned',
    t: ctx.now(), eventId: ctx.uuid(),
    workerId, reason,
  };
  return ctx.sink(event);
}

function context(ctx: SimContext, workerId: string, contextTokens: number): Promise<void> | void {
  const event: DashboardEvent = {
    kind: 'worker.context',
    t: ctx.now(), eventId: ctx.uuid(),
    workerId, contextTokens, modelLimit: 200_000,
  };
  return ctx.sink(event);
}

async function runSubagent(ctx: SimContext, sub: SubagentSpec, speed: number): Promise<void> {
  for (let i = 0; i < sub.toolCalls.length; i++) {
    const call = sub.toolCalls[i]!;
    await setActivity(ctx, sub.id, 'thinking');
    await sleep(call.thinkMs / speed);
    await setActivity(ctx, sub.id, 'tool_use', call.tool);
    await sleep(call.workMs / speed);
    if (sub.errorAfter !== undefined && i + 1 === sub.errorAfter) {
      await errorWorker(ctx, {
        workerId: sub.id,
        message: `${call.tool} timed out fetching ${call.detail}`,
        recoverable: true,
      });
    }
  }
  await setActivity(ctx, sub.id, 'idle');

  // Subagent reports back: aggregated tokens.consumed + a context update
  // matching what on-stop.ts would emit on transcript scan.
  const usd =
    (sub.inputTokens * 3 + sub.outputTokens * 15 + sub.cacheReadTokens * 0.30) / 1_000_000;
  await consumeTokens(ctx, {
    workerId: sub.id,
    inputTokens: sub.inputTokens,
    outputTokens: sub.outputTokens,
    cacheReadTokens: sub.cacheReadTokens,
    usd,
  });
  await context(ctx, sub.id, sub.inputTokens + sub.cacheReadTokens);
  await completeTask(ctx, sub.id, sub.topic);
  await despawn(ctx, sub.id, 'completed');
}

export async function runVectorNews(opts: VectorNewsOpts): Promise<void> {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const ctx = makeContext(opts.sink, {
    ...(opts.fixedTime !== undefined ? { fixedTime: opts.fixedTime } : {}),
    ...(opts.uuidSeed !== undefined ? { uuidSeed: opts.uuidSeed } : {}),
  });

  // SessionStart fired in this session → project + parent worker.
  await upsertProject(ctx, { id: PROJECT_ID, name: PROJECT_NAME, color: '#5ad1ff' });
  await spawnEvent(ctx, {
    projectId: PROJECT_ID, workerId: PARENT_WORKER_ID,
    source: 'claude-code', label: PARENT_LABEL,
    pid: 90000,
  });

  // Parent ingests the user prompt — UserPromptSubmit-style activity.
  await setActivity(ctx, PARENT_WORKER_ID, 'thinking', 'plan research delegation');
  await sleep(1_200 / speed);

  // Parent fires the Agent tool calls — each fires SubagentStart, which spawns
  // a separate worker with parentWorkerId pointing back at us. The 5 are
  // launched in a single message, so spawns happen in tight succession (≈100 ms).
  for (let i = 0; i < SUBAGENTS.length; i++) {
    const s = SUBAGENTS[i]!;
    await spawnEvent(ctx, {
      projectId: PROJECT_ID, workerId: s.id,
      source: 'claude-code', label: s.label,
      pid: 91000 + i, parentWorkerId: PARENT_WORKER_ID, agentType: 'Explore',
    });
    await sleep(100 / speed);
  }

  // Parent waits on Promise.all of the subagents.
  await setActivity(ctx, PARENT_WORKER_ID, 'tool_use', 'Task[Explore × 5]');

  // Subagents run their tool-call cycles in parallel.
  await Promise.all(SUBAGENTS.map((s) => runSubagent(ctx, s, speed)));

  // SubagentStop has fired for all five. Parent transitions to thinking
  // (synthesizing results) and emits its own tokens.consumed for the prompt
  // tokens it spent on the synthesis turn.
  await setActivity(ctx, PARENT_WORKER_ID, 'thinking', 'synthesize findings');
  await sleep(1_800 / speed);

  const parentIn = SUBAGENTS.reduce((acc, s) => acc + s.outputTokens, 0) + 4_000;
  const parentOut = 1_400;
  await consumeTokens(ctx, {
    workerId: PARENT_WORKER_ID,
    inputTokens: parentIn, outputTokens: parentOut,
    cacheReadTokens: 18_000,
    usd: (parentIn * 3 + parentOut * 15 + 18_000 * 0.30) / 1_000_000,
  });
  await context(ctx, PARENT_WORKER_ID, parentIn + 18_000);
  await completeTask(ctx, PARENT_WORKER_ID, 'vector signals research');
  await setActivity(ctx, PARENT_WORKER_ID, 'idle');

  // Parent stays alive — Stop hook fires when the model returns to user, but
  // SessionEnd is what despawns. Leave the parent in idle for the demo.
}
