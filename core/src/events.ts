export type WorkerSource = 'claude-code' | 'sdk-script';
export type WorkerActivity = 'idle' | 'thinking' | 'tool_use' | 'streaming';
export type DespawnReason = 'completed' | 'killed' | 'crashed';

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
      kind: 'worker.despawned';
      workerId: string;
      reason: DespawnReason;
    });

export type EventKind = DashboardEvent['kind'];
