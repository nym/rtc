import { useStore } from '../store.js';

interface Props {
  onConfirm: (workerId: string) => void;
  onCancel: () => void;
}

export function KillConfirm({ onConfirm, onCancel }: Props) {
  const pendingId = useStore((s) => s.pendingKill);
  const worker = useStore((s) => (pendingId ? s.world.workers[pendingId] : undefined));
  if (!pendingId || !worker) return null;

  const label = worker.label ?? worker.id;
  return (
    <div className="kill-confirm" role="dialog" aria-label={`Confirm kill ${label}`}>
      <div className="kill-confirm-card">
        <h2>Confirm Kill</h2>
        <p>
          Send SIGTERM to <strong>{label}</strong> (pid {worker.pid ?? '—'})?
          The process will be given a 5s grace before SIGKILL.
        </p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="button" data-testid="kill-confirm" onClick={() => onConfirm(pendingId)}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
