import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import { ensureBootstrapped } from './bootstrap.js';
import type { DashboardEvent, NotificationLevel } from '@rtc/core';

interface NotificationHook {
  session_id?: string;
  notification_type?: string;
  notification_content?: string;
  cwd?: string;
}

const levelFor = (type?: string): NotificationLevel => {
  if (!type) return 'info';
  const t = type.toLowerCase();
  if (t.includes('error')) return 'error';
  if (t.includes('warn') || t.includes('permission')) return 'warn';
  return 'info';
};

async function main() {
  const hook = (await readStdinJson<NotificationHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  await ensureBootstrapped({ workerId, cwd: hook.cwd });

  const event: DashboardEvent = {
    kind: 'worker.notification',
    t: Date.now(), eventId: makeEventId('notif'),
    workerId,
    level: levelFor(hook.notification_type),
    message: hook.notification_content ?? hook.notification_type ?? 'notification',
    ...(hook.notification_type ? { source: hook.notification_type } : {}),
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-notification error:', err);
});
