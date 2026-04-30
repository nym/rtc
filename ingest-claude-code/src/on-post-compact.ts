import { aggregateByModel } from './transcript.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import { writeMarks } from './transcript-marks.js';
import { ensureBootstrapped } from './bootstrap.js';
import type { DashboardEvent } from '@rtc/core';

interface PostCompactHook {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

async function main() {
  const hook = (await readStdinJson<PostCompactHook>()) ?? {};
  const workerId = hook.session_id ?? `cc-${process.ppid}`;
  await ensureBootstrapped({ workerId, cwd: hook.cwd });

  // Reset the on-stop delta baseline to whatever the post-compact transcript
  // contains right now. Without this, future Stop events would compute
  // negative deltas (post-compact totals < pre-compact marks) and emit nothing,
  // causing tokens consumed after compaction to silently disappear.
  if (hook.transcript_path) {
    const baseline = await aggregateByModel(hook.transcript_path);
    writeMarks(workerId, baseline);
  }

  const event: DashboardEvent = {
    kind: 'session.compacted',
    t: Date.now(), eventId: makeEventId('compacted'),
    workerId,
  };
  await postEvents([event]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-post-compact error:', err);
});
