import { COORDINATOR_HTTP } from '@rtc/core/config-node';
import type { DashboardEvent } from '@rtc/core';

export async function postEvent(event: DashboardEvent | DashboardEvent[], target: string = COORDINATOR_HTTP): Promise<void> {
  try {
    await fetch(`${target}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (err) {
    // Silently fail in user code path; we never want to break agent execution.
    // eslint-disable-next-line no-console
    console.error('[rtc:ingest-sdk] post failed:', (err as Error).message);
  }
}

export const eventId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};
