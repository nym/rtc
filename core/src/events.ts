export type WorkerSource = 'claude-code' | 'sdk-script';
export type WorkerActivity = 'idle' | 'thinking' | 'tool_use' | 'mcp_call' | 'streaming';
export type DespawnReason = 'completed' | 'killed' | 'crashed';
export type NotificationLevel = 'info' | 'warn' | 'error';

export interface EventBase {
  t: number;
  eventId: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  cwd?: string;
  color?: string;
}

export type DashboardEvent =
  | (EventBase & { kind: 'project.upserted'; project: ProjectInfo })
  | (EventBase & {
      kind: 'worker.spawned';
      projectId: string;
      workerId: string;
      source: WorkerSource;
      pid?: number;
      hostname?: string;
      label?: string;
      /** Set when this worker is a subagent of another worker. */
      parentWorkerId?: string;
      /** Subagent classifier (e.g. "Explore", "general-purpose") or app name. */
      agentType?: string;
    })
  | (EventBase & {
      kind: 'worker.activity';
      workerId: string;
      activity: WorkerActivity;
      detail?: string;
    })
  | (EventBase & {
      kind: 'tokens.consumed';
      workerId: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      usd: number;
    })
  | (EventBase & {
      kind: 'worker.context';
      workerId: string;
      /** Last-seen prompt token count for this worker. Approximates context window utilization. */
      contextTokens: number;
      modelLimit?: number;
    })
  | (EventBase & {
      kind: 'task.completed';
      workerId: string;
      taskName?: string;
    })
  | (EventBase & {
      kind: 'worker.errored';
      workerId: string;
      message: string;
      recoverable: boolean;
    })
  | (EventBase & {
      kind: 'worker.notification';
      workerId: string;
      level: NotificationLevel;
      message: string;
      source?: string;
    })
  | (EventBase & {
      kind: 'session.compact_imminent';
      workerId: string;
      trigger?: 'manual' | 'auto';
    })
  | (EventBase & {
      kind: 'session.compacted';
      workerId: string;
    })
  | (EventBase & {
      kind: 'worker.despawned';
      workerId: string;
      reason: DespawnReason;
    });

export type EventKind = DashboardEvent['kind'];
