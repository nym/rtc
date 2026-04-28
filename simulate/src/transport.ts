import { COORDINATOR_HTTP } from '@rtc/core/config-node';
import type { DashboardEvent } from '@rtc/core';
import type { FakeCoordinator } from '@rtc/coordinator/fake';
import type { EventSink } from './simulator-core.js';

export const httpSink = (url: string = COORDINATOR_HTTP): EventSink => async (e: DashboardEvent) => {
  await fetch(`${url}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(e),
  });
};

export const fakeSink = (fake: FakeCoordinator): EventSink => (e: DashboardEvent) => {
  fake.ingest(e);
};
