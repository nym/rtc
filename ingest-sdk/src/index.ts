import os from 'node:os';
import { computeCost, type DashboardEvent } from '@rtc/core';
import { eventId, postEvent } from './transport.js';

export interface InstrumentOpts {
  /** Project identifier this worker belongs to. */
  projectId: string;
  /** Worker identifier (stable per process). */
  workerId: string;
  /** Display label shown in HUD. */
  workerLabel?: string;
  /** Optional friendly project name. */
  projectName?: string;
  /** Optional project color. */
  projectColor?: string;
  /** Override coordinator URL (for tests). */
  target?: string;
  /** Inject a clock for tests. */
  now?: () => number;
}

interface MessagesUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface MessagesResponse {
  model?: string;
  usage?: MessagesUsage;
}

interface AnthropicMessagesShape {
  create: (...args: unknown[]) => Promise<MessagesResponse>;
}

interface AnthropicShape {
  messages: AnthropicMessagesShape;
}

/**
 * Wraps an existing Anthropic SDK client with telemetry.
 * The wrapper emits `worker.spawned` on construction, `worker.activity` +
 * `tokens.consumed` per `messages.create()` call, and `worker.despawned`
 * on SIGTERM or process exit.
 */
export function instrument<T extends AnthropicShape>(client: T, opts: InstrumentOpts): T {
  const target = opts.target;
  const now = opts.now ?? Date.now;
  let despawned = false;

  const post = (e: DashboardEvent) => postEvent(e, target);

  const projectName = opts.projectName ?? opts.projectId;
  const project: DashboardEvent = {
    kind: 'project.upserted',
    t: now(), eventId: eventId('proj'),
    project: {
      id: opts.projectId,
      name: projectName,
      ...(opts.projectColor ? { color: opts.projectColor } : {}),
    },
  };
  const spawn: DashboardEvent = {
    kind: 'worker.spawned',
    t: now(), eventId: eventId('spawn'),
    projectId: opts.projectId,
    workerId: opts.workerId,
    source: 'sdk-script',
    pid: process.pid,
    hostname: os.hostname(),
    ...(opts.workerLabel ? { label: opts.workerLabel } : {}),
  };
  void postEvent([project, spawn], target);

  const despawn = (reason: 'completed' | 'killed' | 'crashed') => {
    if (despawned) return;
    despawned = true;
    const ev: DashboardEvent = {
      kind: 'worker.despawned',
      t: now(), eventId: eventId('despawn'),
      workerId: opts.workerId,
      reason,
    };
    void postEvent(ev, target);
  };

  process.once('SIGTERM', () => despawn('killed'));
  process.once('exit', () => despawn('completed'));

  const originalCreate = client.messages.create.bind(client.messages);
  const wrappedCreate = async (...args: unknown[]): Promise<MessagesResponse> => {
    void post({
      kind: 'worker.activity', t: now(), eventId: eventId('act'),
      workerId: opts.workerId, activity: 'streaming',
    });
    try {
      const res = await originalCreate(...args);
      const usage = res.usage ?? {};
      const model = res.model ?? 'unknown';
      const usd = computeCost(model, {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      });
      void post({
        kind: 'tokens.consumed', t: now(), eventId: eventId('tok'),
        workerId: opts.workerId, model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        ...(usage.cache_read_input_tokens ? { cacheReadTokens: usage.cache_read_input_tokens } : {}),
        ...(usage.cache_creation_input_tokens ? { cacheWriteTokens: usage.cache_creation_input_tokens } : {}),
        usd,
      });
      void post({
        kind: 'worker.activity', t: now(), eventId: eventId('act'),
        workerId: opts.workerId, activity: 'idle',
      });
      return res;
    } catch (err) {
      void post({
        kind: 'worker.errored', t: now(), eventId: eventId('err'),
        workerId: opts.workerId,
        message: (err as Error).message ?? 'unknown error',
        recoverable: true,
      });
      throw err;
    }
  };

  // Replace messages.create on the original object reference so user code is transparent.
  (client.messages as { create: typeof wrappedCreate }).create = wrappedCreate;
  return client;
}

/** Convenience: build and wrap an Anthropic client in one call. */
export async function instrumentedAnthropic(opts: InstrumentOpts & { apiKey?: string }): Promise<AnthropicShape> {
  const mod = await import('@anthropic-ai/sdk').catch(() => null) as unknown as { default?: new (...a: unknown[]) => AnthropicShape } | null;
  if (!mod || !mod.default) {
    throw new Error('[rtc:ingest-sdk] @anthropic-ai/sdk not installed; install it as a peer dependency');
  }
  const Anthropic = mod.default;
  const client = new Anthropic({ apiKey: opts.apiKey });
  return instrument(client, opts);
}

export type { DashboardEvent };
