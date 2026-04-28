import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { createThreeApp, type WorkerProjection, type ThreeApp } from './three-app.js';

interface Props {
  onSelectWorker: (workerId: string) => void;
}

export function ThreeCanvas({ onSelectWorker }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<ThreeApp | null>(null);
  const [projections, setProjections] = useState<WorkerProjection[]>([]);
  const world = useStore((s) => s.world);

  useEffect(() => {
    if (!hostRef.current) return;
    const app = createThreeApp(hostRef.current);
    appRef.current = app;
    app.setOnFrame((p) => setProjections(p));

    const ro = new ResizeObserver(() => {
      const el = hostRef.current!;
      app.resize(el.clientWidth || 1, el.clientHeight || 1);
    });
    ro.observe(hostRef.current);
    return () => {
      ro.disconnect();
      app.dispose();
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    appRef.current?.syncFromState(world);
  }, [world]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      {projections.map((p) => (
        <button
          key={p.workerId}
          type="button"
          className="worker-hit-target"
          data-testid={`worker-${p.label}`}
          data-alive={p.alive ? 'true' : 'false'}
          style={{ left: `${p.screenX}px`, top: `${p.screenY}px` }}
          onClick={() => onSelectWorker(p.workerId)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
