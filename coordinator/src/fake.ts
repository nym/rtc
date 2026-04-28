import {
  initialWorldState,
  reduce,
  type DashboardEvent,
  type ServerMessage,
  type WorldState,
} from '@rtc/core';

/**
 * In-process FakeCoordinator. Same shape as the real coordinator's WS API,
 * but no socket and no JSONL. Used by Playwright fixtures and unit tests.
 */
export class FakeCoordinator {
  private state: WorldState = initialWorldState();
  private listeners = new Set<(msg: ServerMessage) => void>();

  ingest(e: DashboardEvent): void {
    this.state = reduce(this.state, e);
    for (const l of this.listeners) l({ type: 'event', event: e });
  }

  /** Mimic the WS subscribe API the dashboard expects. */
  subscribe(onMessage: (msg: ServerMessage) => void): () => void {
    this.listeners.add(onMessage);
    onMessage({ type: 'snapshot', state: this.state, serverTime: Date.now() });
    return () => { this.listeners.delete(onMessage); };
  }

  get currentState(): WorldState { return this.state; }
}
