import { useEffect, useMemo } from 'react';
import { ThreeCanvas } from './scene/ThreeCanvas.js';
import { TopBar } from './hud/TopBar.js';
import { WorkerPopover } from './hud/WorkerPopover.js';
import { KillConfirm } from './hud/KillConfirm.js';
import { ErrorToasts } from './hud/ErrorToasts.js';
import { ProjectBanner } from './hud/ProjectBanner.js';
import { connect, type Transport } from './transport.js';
import { useStore } from './store.js';

export function App() {
  const setSelected = useStore((s) => s.selectWorker);
  const setPending = useStore((s) => s.setPendingKill);
  const selectedId = useStore((s) => s.selectedWorkerId);
  const pendingId = useStore((s) => s.pendingKill);

  const transport: Transport = useMemo(() => connect(), []);

  useEffect(() => {
    return () => transport.disconnect();
  }, [transport]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedId) setPending(selectedId);
      if (e.key === 'Escape') {
        if (pendingId) setPending(null);
        else if (selectedId) setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, pendingId, setPending, setSelected]);

  const handleSelect = (workerId: string, e?: React.MouseEvent) => {
    if (e?.shiftKey) {
      // Shift+click skips confirm
      setSelected(workerId);
      transport.sendCommand({ commandId: `c-${Date.now()}`, kind: 'worker.kill', workerId });
      return;
    }
    setSelected(workerId);
  };

  const handleKill = () => {
    if (selectedId) setPending(selectedId);
  };

  const handleConfirm = (workerId: string) => {
    transport.sendCommand({ commandId: `c-${Date.now()}`, kind: 'worker.kill', workerId });
    setPending(null);
    setSelected(null);
  };

  return (
    <div className="app-shell">
      <ThreeCanvas onSelectWorker={(id) => handleSelect(id)} />
      <TopBar />
      <ProjectBanner />
      <WorkerPopover onKill={handleKill} onClose={() => setSelected(null)} />
      <KillConfirm onConfirm={handleConfirm} onCancel={() => setPending(null)} />
      <ErrorToasts />
    </div>
  );
}
