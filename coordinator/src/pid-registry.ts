import type { DashboardEvent } from '@rtc/core';

export interface PidEntry {
  workerId: string;
  pid: number;
  hostname?: string;
}

export class PidRegistry {
  private byWorker = new Map<string, PidEntry>();

  apply(event: DashboardEvent): void {
    if (event.kind === 'worker.spawned' && event.pid) {
      this.byWorker.set(event.workerId, {
        workerId: event.workerId,
        pid: event.pid,
        hostname: event.hostname,
      });
    } else if (event.kind === 'worker.despawned') {
      this.byWorker.delete(event.workerId);
    }
  }

  get(workerId: string): PidEntry | undefined {
    return this.byWorker.get(workerId);
  }

  size(): number { return this.byWorker.size; }

  all(): PidEntry[] { return [...this.byWorker.values()]; }
}
