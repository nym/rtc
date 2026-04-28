import { test, expect } from '@playwright/test';
import type { DashboardEvent } from '@rtc/core';

test('types only', async () => {
  const e: DashboardEvent = { kind: 'project.upserted', t: 0, eventId: 'p', project: { id: 'p', name: 'P' } };
  expect(e.kind).toBe('project.upserted');
});
