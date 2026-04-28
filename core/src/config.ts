// Browser-safe constants. Node-only paths live in `./config-node.ts`.
const env: Record<string, string | undefined> =
  (typeof process !== 'undefined' && process.env) ? process.env : {};

/** TCP port the coordinator listens on (HTTP + WS). Override via env. */
export const COORDINATOR_PORT = Number(env.RTC_PORT ?? 7777);

/** Coordinator host. Localhost only for MVP. */
export const COORDINATOR_HOST = env.RTC_HOST ?? '127.0.0.1';

export const COORDINATOR_HTTP = `http://${COORDINATOR_HOST}:${COORDINATOR_PORT}`;
export const COORDINATOR_WS   = `ws://${COORDINATOR_HOST}:${COORDINATOR_PORT}/stream`;

/** JSONL rotation. */
export const JSONL_MAX_BYTES   = 100 * 1024 * 1024;
export const JSONL_MAX_BACKUPS = 7;

/** Kill timing. */
export const KILL_GRACE_MS = 5_000;

/** A worker or MCP server with no events for this long is considered gone. */
export const STALE_TTL_MS = 3 * 60 * 1000;

/** A despawned worker is removed from state this long after despawn. */
export const WORKER_FADE_MS = 5 * 60 * 1000;

/** How often the coordinator sweeps for stale workers / MCP servers. */
export const SWEEP_INTERVAL_MS = 30 * 1000;

/** Project identity resolution. */
export const PROJECT_ID_ENV = 'ORCHESTRATOR_PROJECT_ID';
export const PROJECT_CONFIG_FILE = '.orchestrator.json';
