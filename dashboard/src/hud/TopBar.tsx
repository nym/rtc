import { useStore } from '../store.js';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

export function TopBar() {
  const totals = useStore((s) => s.world.totals);
  const connection = useStore((s) => s.connection);
  const muted = useStore((s) => s.soundMuted);
  const toggleSound = useStore((s) => s.toggleSound);

  return (
    <header className="top-bar" data-testid="top-bar">
      <h1>Real Time Conductor</h1>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Workers Alive</span>
          <span className="stat-value" data-testid="workers-alive-count">{totals.workersAlive}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Workers Total</span>
          <span className="stat-value" data-testid="workers-total-count">{totals.workersTotal}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Tokens</span>
          <span className="stat-value" data-testid="total-tokens">{fmt(totals.inputTokens + totals.outputTokens)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">USD</span>
          <span className="stat-value" data-testid="total-usd">{fmtUsd(totals.usd)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          className="connection-badge"
          data-testid="sound-toggle"
          onClick={toggleSound}
          style={{ cursor: 'pointer' }}
        >
          {muted ? 'Muted' : 'Sound'}
        </button>
        <span className="connection-badge" data-testid="connection-status" data-state={connection}>
          {connection}
        </span>
      </div>
    </header>
  );
}
