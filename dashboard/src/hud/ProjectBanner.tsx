import { useStore } from '../store.js';
import { projectColor as fallbackColor } from '@rtc/core';

export function ProjectBanner() {
  const projects = useStore((s) => s.world.projects);
  const list = Object.values(projects);
  if (list.length === 0) return null;
  return (
    <div className="project-banner">
      {list.map((p) => (
        <div key={p.id} className="row" data-testid={`project-name-${p.id}`}>
          <span className="swatch" style={{ background: p.color ?? fallbackColor(p.id) }} />
          {p.name}
        </div>
      ))}
    </div>
  );
}
