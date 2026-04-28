import { COORDINATOR_HTTP } from '@rtc/core/config-node';
import type { DashboardEvent } from '@rtc/core';

export async function postEvents(events: DashboardEvent | DashboardEvent[], target: string = COORDINATOR_HTTP): Promise<void> {
  try {
    await fetch(`${target}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(events),
    });
  } catch (err) {
    // The hook should not fail Claude Code if the dashboard is offline.
    // eslint-disable-next-line no-console
    console.error('[rtc] failed to post events:', (err as Error).message);
  }
}

export function makeEventId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
