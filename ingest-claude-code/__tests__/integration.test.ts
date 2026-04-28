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
});
