import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startCoordinator, type CoordinatorHandle } from '@rtc/coordinator';
import { instrument } from '../src/index.js';

let handle: CoordinatorHandle;

beforeEach(async () => {
  handle = await startCoordinator({
    port: 0,
    host: '127.0.0.1',
    ephemeral: true,
    killOpts: { graceMs: 1, killFn: () => { /* noop */ } },
  });
});

afterEach(async () => {
  await handle.close();
});

const targetUrl = () => `http://127.0.0.1:${handle.port}`;

const waitFor = async (cond: () => boolean, ms = 3_000): Promise<void> => {
  const start = Date.now();
  while (!cond() && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 15));
  }
  if (!cond()) throw new Error('timeout waiting for condition');
};

describe('ingest-sdk integration', () => {
  test('instrument() emits project + worker.spawned to a real coordinator', async () => {
    const fake = { messages: { create: async () => ({ model: 'claude-sonnet-4-6', usage: {} }) } };
    instrument(fake, {
      projectId: 'p1',
      workerId: 'w1',
      workerLabel: 'Solo',
      target: targetUrl(),
      noLifecycleHandlers: true,
    });

    await waitFor(() => !!handle.state().workers['w1']);
    expect(handle.state().projects['p1']?.name).toBe('p1');
    expect(handle.state().workers['w1']?.alive).toBe(true);
    expect(handle.state().workers['w1']?.source).toBe('sdk-script');
    expect(handle.state().workers['w1']?.label).toBe('Solo');
  });

  test('messages.create emits activity → tokens.consumed → activity', async () => {
    const fake = {
      messages: {
        create: async () => ({
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 1_000,
            output_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }),
      },
    };
    const client = instrument(fake, {
      projectId: 'p2', workerId: 'w2', target: targetUrl(), noLifecycleHandlers: true,
    });
    await waitFor(() => !!handle.state().workers['w2']);

    await client.messages.create();

    await waitFor(() => (handle.state().workers['w2']?.inputTokens ?? 0) > 0);
    const w = handle.state().workers['w2']!;
    expect(w.inputTokens).toBe(1_000);
    expect(w.outputTokens).toBe(200);
    // Sonnet 4.6: 1000*3/1M + 200*15/1M = 0.003 + 0.003 = 0.006
    expect(w.usd).toBeCloseTo(0.006, 6);
    // Final activity should settle to idle.
    await waitFor(() => w.activity === 'idle' || handle.state().workers['w2']?.activity === 'idle');
    expect(handle.state().workers['w2']?.activity).toBe('idle');
  });

  test('messages.create error emits worker.errored and rethrows', async () => {
    const boom = new Error('rate limit');
    const fake = { messages: { create: async () => { throw boom; } } };
    const client = instrument(fake, {
      projectId: 'p3', workerId: 'w3', target: targetUrl(), noLifecycleHandlers: true,
    });
    await waitFor(() => !!handle.state().workers['w3']);

    await expect(client.messages.create()).rejects.toThrow('rate limit');

    await waitFor(() => (handle.state().workers['w3']?.errorCount ?? 0) > 0);
    expect(handle.state().workers['w3']?.lastError).toBe('rate limit');
    // Worker still alive — error is not a despawn event.
    expect(handle.state().workers['w3']?.alive).toBe(true);
  });

  test('cache tokens are forwarded and priced correctly', async () => {
    const fake = {
      messages: {
        create: async () => ({
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 100_000,
            cache_read_input_tokens: 200_000,
          },
        }),
      },
    };
    const client = instrument(fake, {
      projectId: 'p4', workerId: 'w4', target: targetUrl(), noLifecycleHandlers: true,
    });
    await waitFor(() => !!handle.state().workers['w4']);

    await client.messages.create();

    await waitFor(() => (handle.state().workers['w4']?.cacheReadTokens ?? 0) > 0);
    const w = handle.state().workers['w4']!;
    expect(w.cacheWriteTokens).toBe(100_000);
    expect(w.cacheReadTokens).toBe(200_000);
    // 100k * 3.75/1M + 200k * 0.30/1M = 0.375 + 0.060 = 0.435
    expect(w.usd).toBeCloseTo(0.435, 6);
  });
});
