import { KILL_GRACE_MS } from '@rtc/core/config-node';

export interface KillResult {
  ok: boolean;
  error?: string;
}

export interface KillExecutorOpts {
  /** Override for tests. */
  killFn?: (pid: number, signal: NodeJS.Signals) => void;
  /** Override grace period for tests. */
  graceMs?: number;
}

export function makeKillExecutor(opts: KillExecutorOpts = {}) {
  const killFn = opts.killFn ?? ((pid: number, sig: NodeJS.Signals) => process.kill(pid, sig));
  const grace = opts.graceMs ?? KILL_GRACE_MS;

  return async function killPid(pid: number): Promise<KillResult> {
    try {
      killFn(pid, 'SIGTERM');
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    await new Promise((r) => setTimeout(r, grace));
    try {
      killFn(pid, 'SIGKILL');
    } catch {
      // Already dead — that's fine.
    }
    return { ok: true };
  };
}
