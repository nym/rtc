import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCoordinator, type CoordinatorHandle } from '@rtc/coordinator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const HOOKS_DIR = path.join(REPO_ROOT, 'ingest-claude-code', 'src');
const FIXTURES = path.join(__dirname, 'fixtures');

interface RunResult { exitCode: number; stderr: string; }

let stateDir: string;

const runHook = (script: string, payload: unknown, port: number): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [path.join(HOOKS_DIR, script)], {
      env: {
        ...process.env,
        RTC_PORT: String(port),
        RTC_HOST: '127.0.0.1',
        // Avoid interference: hooks fall back to basename($PWD) for projectId
        // when no env override and no .orchestrator.json — fix it explicitly.
        ORCHESTRATOR_PROJECT_ID: 'test-project',
        // Per-test isolated state dir so transcript-marks files don't pollute
        // the developer's ~/.orchestrator-dashboard.
        RTC_STATE_DIR: stateDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr!.on('data', (d) => { stderr += String(d); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 0, stderr }));
    child.stdin!.write(JSON.stringify(payload));
    child.stdin!.end();
  });

let handle: CoordinatorHandle;

beforeEach(async () => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtc-ingest-cc-test-'));
  handle = await startCoordinator({
    port: 0,
    host: '127.0.0.1',
    ephemeral: true,
    killOpts: { graceMs: 1, killFn: () => { /* noop */ } },
  });
});

afterEach(async () => {
  await handle.close();
  fs.rmSync(stateDir, { recursive: true, force: true });
});

const seedWorker = async (workerId: string, projectId = 'test-project'): Promise<void> => {
  await handle.ingestEvent({
    kind: 'project.upserted', t: 1, eventId: `p-${projectId}`,
    project: { id: projectId, name: projectId },
  });
  await handle.ingestEvent({
    kind: 'worker.spawned', t: 2, eventId: `s-${workerId}`,
    projectId, workerId, source: 'claude-code',
  });
};

describe('ingest-claude-code hooks (subprocess integration)', () => {
  test('on-session-start posts project + worker.spawned', async () => {
    const sessionId = 'sess-start-1';
    const result = await runHook('on-session-start.ts', {
      session_id: sessionId, cwd: '/tmp/whatever',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    expect(handle.state().projects['test-project']).toBeDefined();
    expect(handle.state().workers[sessionId]?.alive).toBe(true);
    expect(handle.state().workers[sessionId]?.source).toBe('claude-code');
  });

  test('on-pretooluse flips worker.activity to tool_use', async () => {
    const sessionId = 'sess-pre-1';
    await seedWorker(sessionId);
    const result = await runHook('on-pretooluse.ts', {
      session_id: sessionId, tool_name: 'Bash',
    }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.activity).toBe('tool_use');
  });

  test('on-posttooluse flips worker.activity to thinking', async () => {
    const sessionId = 'sess-post-1';
    await seedWorker(sessionId);
    await handle.ingestEvent({
      kind: 'worker.activity', t: 3, eventId: 'a-prev',
      workerId: sessionId, activity: 'tool_use',
    });
    const result = await runHook('on-posttooluse.ts', { session_id: sessionId }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.activity).toBe('thinking');
  });

  test('on-stop emits tokens.consumed and does not despawn', async () => {
    const sessionId = 'sess-stop-1';
    await seedWorker(sessionId);
    const result = await runHook('on-stop.ts', {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    }, handle.port);
    expect(result.exitCode).toBe(0);

    const w = handle.state().workers[sessionId];
    expect(w?.alive).toBe(true);
    // Fixture totals: 300 in, 125 out, 10 cw, 20 cr.
    expect(w?.inputTokens).toBe(300);
    expect(w?.outputTokens).toBe(125);
    expect(w?.cacheReadTokens).toBe(20);
    expect(w?.cacheWriteTokens).toBe(10);
    // Sonnet pricing: (300*3 + 125*15 + 10*3.75 + 20*0.30) / 1M
    expect(w?.usd).toBeCloseTo((300 * 3 + 125 * 15 + 10 * 3.75 + 20 * 0.30) / 1_000_000, 9);
  });

  test('on-stop tolerates a missing transcript_path (no-op)', async () => {
    const sessionId = 'sess-stop-2';
    await seedWorker(sessionId);
    const result = await runHook('on-stop.ts', { session_id: sessionId }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.alive).toBe(true);
    expect(handle.state().workers[sessionId]?.inputTokens).toBe(0);
  });

  test('on-stop fired twice against the same transcript does not double-count', async () => {
    const sessionId = 'sess-stop-delta';
    await seedWorker(sessionId);
    const payload = {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    };

    const r1 = await runHook('on-stop.ts', payload, handle.port);
    expect(r1.exitCode).toBe(0);

    const w1 = handle.state().workers[sessionId];
    expect(w1?.inputTokens).toBe(300);
    expect(w1?.outputTokens).toBe(125);
    expect(w1?.cacheReadTokens).toBe(20);
    expect(w1?.cacheWriteTokens).toBe(10);

    // Second fire — transcript hasn't grown, so delta should be 0.
    const r2 = await runHook('on-stop.ts', payload, handle.port);
    expect(r2.exitCode).toBe(0);

    const w2 = handle.state().workers[sessionId];
    expect(w2?.inputTokens).toBe(300);
    expect(w2?.outputTokens).toBe(125);
    expect(w2?.cacheReadTokens).toBe(20);
    expect(w2?.cacheWriteTokens).toBe(10);
    expect(w2?.alive).toBe(true);
  });

  test('on-session-end despawns the worker and removes the marks file', async () => {
    const sessionId = 'sess-end-1';
    await seedWorker(sessionId);

    const r1 = await runHook('on-stop.ts', {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    }, handle.port);
    expect(r1.exitCode).toBe(0);

    const marksFile = path.join(stateDir, 'transcript-marks', `${sessionId}.json`);
    expect(fs.existsSync(marksFile)).toBe(true);

    const r2 = await runHook('on-session-end.ts', {
      session_id: sessionId, reason: 'logout',
    }, handle.port);
    expect(r2.exitCode).toBe(0);

    const w = handle.state().workers[sessionId];
    expect(w?.alive).toBe(false);
    expect(fs.existsSync(marksFile)).toBe(false);
  });

  test('on-stop emits worker.context with last assistant input_tokens', async () => {
    const sessionId = 'sess-ctx-1';
    await seedWorker(sessionId);
    const result = await runHook('on-stop.ts', {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    }, handle.port);
    expect(result.exitCode).toBe(0);

    const w = handle.state().workers[sessionId];
    expect(typeof w?.contextTokens).toBe('number');
    expect(w?.contextTokens).toBeGreaterThan(0);
  });
});

describe('ingest-claude-code new hooks (subagents, notifications, compaction, failures)', () => {
  test('on-subagent-start spawns a subagent worker with parent + agentType', async () => {
    const result = await runHook('on-subagent-start.ts', {
      session_id: 'parent-1',
      agent_id: 'sub-A',
      agent_type: 'Explore',
      cwd: '/tmp/foo',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    const state = handle.state();
    expect(state.projects['test-project']).toBeDefined();
    const w = state.workers['sub-A'];
    expect(w).toBeDefined();
    expect(w?.parentWorkerId).toBe('parent-1');
    expect(w?.agentType).toBe('Explore');
    expect(w?.alive).toBe(true);
    expect(w?.source).toBe('claude-code');
  });

  test('on-subagent-stop despawns the subagent worker', async () => {
    await runHook('on-subagent-start.ts', {
      session_id: 'parent-1', agent_id: 'sub-A', agent_type: 'Explore', cwd: '/tmp/foo',
    }, handle.port);
    expect(handle.state().workers['sub-A']?.alive).toBe(true);

    const result = await runHook('on-subagent-stop.ts', {
      session_id: 'parent-1', agent_id: 'sub-A',
    }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers['sub-A']?.alive).toBe(false);
  });

  test('on-subagent-stop without agent_id is a no-op', async () => {
    await runHook('on-subagent-start.ts', {
      session_id: 'parent-2', agent_id: 'sub-B', agent_type: 'Explore', cwd: '/tmp/foo',
    }, handle.port);
    const revBefore = handle.state().revision;

    const result = await runHook('on-subagent-stop.ts', {
      session_id: 'parent-2',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    // No event posted → revision unchanged
    expect(handle.state().revision).toBe(revBefore);
    expect(handle.state().workers['sub-B']?.alive).toBe(true);
  });

  test('on-pretooluse with mcp__ tool_name flips activity to mcp_call', async () => {
    const sessionId = 'sess-mcp-1';
    await seedWorker(sessionId);
    const result = await runHook('on-pretooluse.ts', {
      session_id: sessionId, tool_name: 'mcp__github__list_issues',
    }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.activity).toBe('mcp_call');
  });

  test('on-pretooluse with agent_id flips the subagent activity, not the parent', async () => {
    const parentId = 'parent-act-1';
    const subId = 'sub-act-1';
    await seedWorker(parentId);
    await seedWorker(subId);

    const result = await runHook('on-pretooluse.ts', {
      session_id: parentId, agent_id: subId, tool_name: 'Bash',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    expect(handle.state().workers[subId]?.activity).toBe('tool_use');
    expect(handle.state().workers[parentId]?.activity).toBe('idle');
  });

  test('on-notification with permission_required succeeds', async () => {
    const sessionId = 'sess-notif-1';
    await seedWorker(sessionId);
    const result = await runHook('on-notification.ts', {
      session_id: sessionId,
      notification_type: 'permission_required',
      notification_content: 'Tool foo requires permission',
    }, handle.port);
    expect(result.exitCode).toBe(0);
  });

  test('on-notification with arbitrary error type does not crash', async () => {
    const sessionId = 'sess-notif-2';
    await seedWorker(sessionId);
    const result = await runHook('on-notification.ts', {
      session_id: sessionId,
      notification_type: 'error_x',
      notification_content: 'something bad',
    }, handle.port);
    expect(result.exitCode).toBe(0);
  });

  test('on-pre-compact flips compactImminent=true', async () => {
    const sessionId = 'sess-precompact-1';
    await seedWorker(sessionId);
    const result = await runHook('on-pre-compact.ts', {
      session_id: sessionId, trigger: 'auto',
    }, handle.port);
    expect(result.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.compactImminent).toBe(true);
  });

  test('on-post-compact resets compactImminent and rewrites marks baseline', async () => {
    const sessionId = 'sess-postcompact-1';
    await seedWorker(sessionId);

    // First on-stop creates the marks file with the fixture totals.
    const r1 = await runHook('on-stop.ts', {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    }, handle.port);
    expect(r1.exitCode).toBe(0);

    // Pre-compact to set compactImminent=true.
    const rPre = await runHook('on-pre-compact.ts', {
      session_id: sessionId, trigger: 'manual',
    }, handle.port);
    expect(rPre.exitCode).toBe(0);
    expect(handle.state().workers[sessionId]?.compactImminent).toBe(true);

    const r2 = await runHook('on-post-compact.ts', {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    }, handle.port);
    expect(r2.exitCode).toBe(0);

    expect(handle.state().workers[sessionId]?.compactImminent).toBe(false);

    const marksFile = path.join(stateDir, 'transcript-marks', `${sessionId}.json`);
    expect(fs.existsSync(marksFile)).toBe(true);
    const marks = JSON.parse(fs.readFileSync(marksFile, 'utf8')) as Record<string, unknown>;
    // Fixture's only model
    expect(Object.keys(marks)).toContain('claude-sonnet-4-6');
  });

  test('on-post-compact resets the delta baseline so a subsequent on-stop is a no-op', async () => {
    const sessionId = 'sess-postcompact-delta';
    await seedWorker(sessionId);

    const payload = {
      session_id: sessionId,
      transcript_path: path.join(FIXTURES, 'simple.jsonl'),
    };

    const r1 = await runHook('on-stop.ts', payload, handle.port);
    expect(r1.exitCode).toBe(0);
    const w1 = handle.state().workers[sessionId];
    expect(w1?.inputTokens).toBe(300);
    expect(w1?.outputTokens).toBe(125);

    const rPost = await runHook('on-post-compact.ts', payload, handle.port);
    expect(rPost.exitCode).toBe(0);

    // After post-compact resets baseline, another on-stop sees zero delta.
    const r2 = await runHook('on-stop.ts', payload, handle.port);
    expect(r2.exitCode).toBe(0);
    const w2 = handle.state().workers[sessionId];
    expect(w2?.inputTokens).toBe(300);
    expect(w2?.outputTokens).toBe(125);
    expect(w2?.cacheReadTokens).toBe(20);
    expect(w2?.cacheWriteTokens).toBe(10);
  });

  test('on-posttooluse-failure increments errorCount and stores tool_error', async () => {
    const sessionId = 'sess-toolfail-1';
    await seedWorker(sessionId);
    const result = await runHook('on-posttooluse-failure.ts', {
      session_id: sessionId, tool_name: 'Bash', tool_error: 'exit 1',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    const w = handle.state().workers[sessionId];
    expect(w?.errorCount).toBe(1);
    expect(w?.lastError).toBe('exit 1');
  });

  test('on-stop-failure increments errorCount and stores error_type', async () => {
    const sessionId = 'sess-stopfail-1';
    await seedWorker(sessionId);
    const result = await runHook('on-stop-failure.ts', {
      session_id: sessionId, error_type: 'rate_limit_error',
    }, handle.port);
    expect(result.exitCode).toBe(0);

    const w = handle.state().workers[sessionId];
    expect(w?.errorCount).toBe(1);
    expect(w?.lastError).toBe('rate_limit_error');
  });
});
