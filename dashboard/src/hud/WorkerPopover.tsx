import { useStore } from '../store.js';

interface Props {
  onKill: () => void;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const fmtUsd = (n: number) => `$${n.toFixed(4)}`;

export function WorkerPopover({ onKill, onClose }: Props) {
  const selectedId = useStore((s) => s.selectedWorkerId);
  const worker = useStore((s) => (selectedId ? s.world.workers[selectedId] : undefined));
  if (!worker) return null;

  const label = worker.label ?? worker.id;
  return (
    <div
      className="popover"
      role="dialog"
      aria-label={label}
      data-testid={`popover-${label}`}
      style={{ top: '20%', right: 32 }}
    >
      <h2>{label}</h2>
      <dl>
        <dt>Project</dt><dd>{worker.projectId}</dd>
        <dt>Source</dt><dd>{worker.source}</dd>
        <dt>Activity</dt><dd>{worker.activity}</dd>
        <dt>PID</dt><dd>{worker.pid ?? '—'}</dd>
        <dt>Tokens</dt><dd>{fmt(worker.inputTokens + worker.outputTokens)}</dd>
        <dt>USD</dt><dd>{fmtUsd(worker.usd)}</dd>
        <dt>Tasks</dt><dd>{worker.tasksCompleted}</dd>
        <dt>Errors</dt><dd>{worker.errorCount}</dd>
      </dl>
      <div className="actions">
        <button type="button" className="secondary" onClick={onClose}>Close</button>
        {worker.alive && (
          <button type="button" data-testid="kill-button" onClick={onKill}>Kill</button>
        )}
      </div>
    </div>
  );
}
