import type { WorkerActivity, WorkerSource } from './events.js';

export interface Project {
  id: string;
  name: string;
  cwd?: string;
  color?: string;
  patchArcCenter?: number;
  createdAt: number;
}

export interface McpServer {
  id: string;
  name: string;
  projectId: string;
  firstSeen: number;
  lastSeen: number;
}

export interface Worker {
  id: string;
  projectId: string;
  source: WorkerSource;
  pid?: number;
  hostname?: string;
  label?: string;
  spawnedAt: number;
  lastEventAt: number;
  alive: boolean;
  activity: WorkerActivity;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
  tasksCompleted: number;
  errorCount: number;
  lastError?: string;
  /** When alive=false flipped to despawned. */
  despawnedAt?: number;
  /** Set for subagent workers — points at the parent session's worker. */
  parentWorkerId?: string;
  /** Subagent classifier (e.g. "Explore", "general-purpose"). */
  agentType?: string;
  /** Most recent assistant turn's input token count, approximating context window utilization. */
  contextTokens?: number;
  /** Model context window limit, if known. */
  modelLimit?: number;
  /** Set true when PreCompact has fired and PostCompact has not yet. */
  compactImminent?: boolean;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  tasksCompleted: number;
  workersAlive: number;
  workersTotal: number;
}

export interface WorldState {
  projects: Record<string, Project>;
  workers: Record<string, Worker>;
  mcpServers: Record<string, McpServer>;
  totals: Totals;
  /** Monotonic — bumped on any state mutation. */
  revision: number;
}

export const initialWorldState = (): WorldState => ({
  projects: {},
  workers: {},
  mcpServers: {},
  totals: {
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    tasksCompleted: 0,
    workersAlive: 0,
    workersTotal: 0,
  },
  revision: 0,
});
