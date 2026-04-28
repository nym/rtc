import * as THREE from 'three';
import { ISO_CAMERA_ANGLE, placeOnGround, projectColor as fallbackColor, type WorldState } from '@rtc/core';

export interface WorkerProjection {
  workerId: string;
  label: string;
  alive: boolean;
  screenX: number;
  screenY: number;
}

export interface ThreeApp {
  dispose: () => void;
  resize: (w: number, h: number) => void;
  setOnFrame: (cb: (workers: WorkerProjection[]) => void) => void;
  syncFromState: (state: WorldState) => void;
}

export function createThreeApp(host: HTMLDivElement): ThreeApp {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050a14');
  scene.fog = new THREE.Fog('#050a14', 22, 60);

  const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
  const cam = new THREE.OrthographicCamera(-12 * aspect, 12 * aspect, 12, -12, 0.1, 200);
  cam.zoom = 1;
  positionIsoCamera(cam, 30);
  cam.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.classList.add('three-canvas');

  // Lighting
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(8, 14, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ad8ff, 0.4);
  fill.position.set(-6, 8, -6);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x223344, 0.5));

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#0d1a2c', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(60, 30, 0x1a3050, 0x0a1828);
  grid.position.y = 0.01;
  scene.add(grid);

  // Mineral patch (single, central — placeholder)
  const patch = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 1.2),
    new THREE.MeshStandardMaterial({ color: '#7e57c2', emissive: '#311b92', emissiveIntensity: 0.45 })
  );
  patch.position.set(4.5, 0.4, 0);
  scene.add(patch);

  const baseGroup = new THREE.Group();
  scene.add(baseGroup);
  const unitsGroup = new THREE.Group();
  scene.add(unitsGroup);

  const baseMeshes = new Map<string, THREE.Mesh>();
  const workerEntries = new Map<string, WorkerEntry>();

  const projectionVec = new THREE.Vector3();
  let onFrame: ((workers: WorkerProjection[]) => void) | null = null;

  let lastTime = performance.now();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const projections: WorkerProjection[] = [];
    for (const entry of workerEntries.values()) {
      stepWorker(entry, dt, now);
      // Project world position to screen coords for hit-target overlay.
      projectionVec.copy(entry.group.position);
      projectionVec.y += 1.0;
      projectionVec.project(cam);
      const sx = (projectionVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      const sy = (-projectionVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      projections.push({
        workerId: entry.workerId,
        label: entry.label,
        alive: entry.alive,
        screenX: sx,
        screenY: sy,
      });
    }

    if (onFrame) onFrame(projections);
    renderer.render(scene, cam);
  };
  animate();

  function syncFromState(state: WorldState) {
    // Bases
    const seenProjects = new Set<string>();
    for (const project of Object.values(state.projects)) {
      seenProjects.add(project.id);
      let mesh = baseMeshes.get(project.id);
      if (!mesh) {
        const colorStr = project.color ?? fallbackColor(project.id);
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 2.0, 1.6),
          new THREE.MeshStandardMaterial({ color: colorStr, roughness: 0.6 })
        );
        const pos = placeOnGround(`base:${project.id}`);
        mesh.position.set(pos.x, 1.0, pos.z);
        baseGroup.add(mesh);
        baseMeshes.set(project.id, mesh);
      }
    }
    // Remove bases for projects no longer present.
    for (const [id, mesh] of baseMeshes) {
      if (!seenProjects.has(id)) {
        baseGroup.remove(mesh);
        baseMeshes.delete(id);
      }
    }

    // Workers
    const seenWorkers = new Set<string>();
    for (const worker of Object.values(state.workers)) {
      seenWorkers.add(worker.id);
      let entry = workerEntries.get(worker.id);
      if (!entry) {
        entry = createWorkerEntry(worker.id, worker.label ?? worker.id, baseMeshes.get(worker.projectId));
        unitsGroup.add(entry.group);
        workerEntries.set(worker.id, entry);
      }
      entry.label = worker.label ?? worker.id;
      entry.alive = worker.alive;
      entry.activity = worker.activity;
      entry.basePosition = baseMeshes.get(worker.projectId)?.position ?? entry.basePosition;
    }
    for (const [id, entry] of workerEntries) {
      if (!seenWorkers.has(id)) {
        unitsGroup.remove(entry.group);
        workerEntries.delete(id);
      }
    }
  }

  function dispose() {
    cancelAnimationFrame(raf);
    renderer.dispose();
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
  }

  function resize(w: number, h: number) {
    const a = w / h;
    cam.left = -12 * a; cam.right = 12 * a;
    cam.top = 12; cam.bottom = -12;
    cam.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return {
    dispose,
    resize,
    setOnFrame: (cb) => { onFrame = cb; },
    syncFromState,
  };
}

function positionIsoCamera(cam: THREE.OrthographicCamera, distance: number): void {
  const { azimuth, elevation } = ISO_CAMERA_ANGLE;
  const x = Math.cos(elevation) * Math.cos(azimuth) * distance;
  const y = Math.sin(elevation) * distance;
  const z = Math.cos(elevation) * Math.sin(azimuth) * distance;
  cam.position.set(x, y, z);
  cam.lookAt(0, 0.5, 0);
}

interface WorkerEntry {
  workerId: string;
  label: string;
  alive: boolean;
  activity: 'idle' | 'thinking' | 'tool_use' | 'streaming';
  group: THREE.Group;
  body: THREE.Mesh;
  basePosition: THREE.Vector3 | undefined;
  patchPosition: THREE.Vector3;
  phase: number;
}

function createWorkerEntry(
  workerId: string,
  label: string,
  base: THREE.Mesh | undefined
): WorkerEntry {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.5),
    new THREE.MeshStandardMaterial({ color: '#50e3c2', emissive: '#0e3a30', emissiveIntensity: 0.35 })
  );
  body.position.y = 0.5;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.35),
    new THREE.MeshStandardMaterial({ color: '#a4f4e3' })
  );
  head.position.y = 1.2;
  group.add(head);
  const seedPos = placeOnGround(`worker:${workerId}`);
  group.position.set(seedPos.x, 0, seedPos.z);
  return {
    workerId,
    label,
    alive: true,
    activity: 'idle',
    group,
    body,
    basePosition: base?.position,
    patchPosition: new THREE.Vector3(4.5, 0, 0),
    phase: hashFloat(workerId),
  };
}

function hashFloat(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function stepWorker(entry: WorkerEntry, _dt: number, now: number): void {
  const t = (now / 1000) + entry.phase * 4;
  const frozen = typeof window !== 'undefined' && (window as Window & { __RTC_FREEZE_MOTION?: boolean }).__RTC_FREEZE_MOTION === true;

  if (!frozen) {
    const target = pickTarget(entry, t);
    const dir = target.clone().sub(entry.group.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.05) {
      dir.normalize().multiplyScalar(0.018);
      entry.group.position.add(dir);
      entry.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
    entry.body.position.y = 0.5 + Math.sin(t * 6) * 0.04;
  } else {
    entry.body.position.y = 0.5;
  }
  entry.group.scale.setScalar(entry.alive ? 1 : 0.6);

  const mat = entry.body.material as THREE.MeshStandardMaterial;
  if (!frozen && (entry.activity === 'tool_use' || entry.activity === 'streaming')) {
    mat.emissiveIntensity = 0.6 + Math.sin(t * 8) * 0.2;
  } else {
    mat.emissiveIntensity = 0.35;
  }
}

function pickTarget(entry: WorkerEntry, t: number): THREE.Vector3 {
  const cycle = Math.floor(t * 0.8) % 2;
  if (entry.activity === 'tool_use') return entry.patchPosition;
  if (cycle === 0 && entry.basePosition) return entry.basePosition;
  return entry.patchPosition;
}
