import os from 'node:os';
import path from 'node:path';

const env: Record<string, string | undefined> = process.env ?? {};

export const STATE_DIR = env.RTC_STATE_DIR ?? path.join(os.homedir(), '.orchestrator-dashboard');
export const EVENTS_JSONL = path.join(STATE_DIR, 'events.jsonl');
export const TRANSCRIPT_MARKS_DIR = path.join(STATE_DIR, 'transcript-marks');

export {
  COORDINATOR_PORT,
  COORDINATOR_HOST,
  COORDINATOR_HTTP,
  COORDINATOR_WS,
  JSONL_MAX_BYTES,
  JSONL_MAX_BACKUPS,
  KILL_GRACE_MS,
  WORKER_FADE_MS,
  PROJECT_ID_ENV,
  PROJECT_CONFIG_FILE,
} from './config.js';
