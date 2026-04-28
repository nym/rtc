import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ISO_CAMERA_ANGLE, placeOnGround, projectColor as fallbackColor, type WorldState } from '@rtc/core';

export interface WorkerProjection {
  workerId: string;
  label: string;
  alive: boolean;
  carrying: boolean;
  screenX: number;
  screenY: number;
}

export interface PatchProjection {
  workerId: string;
  label: string;
  screenX: number;
  screenY: number;
}

export interface FrameSnapshot {
  workers: WorkerProjection[];
  patches: PatchProjection[];
}

export interface ThreeApp {
  dispose: () => void;
  resize: (w: number, h: number) => void;
  setOnFrame: (cb: (snap: FrameSnapshot) => void) => void;
  syncFromState: (state: WorldState) => void;
}

const PATCH_RADIUS = 5.5;
const PATCH_ARC_START = -Math.PI / 4;
const PATCH_ARC_SPAN = Math.PI;
const WORKER_OBJ_URL = '/assets/MobileStorageBot.obj';
const WORKER_MTL_URL = '/assets/MobileStorageBot.mtl';

let workerTemplate: THREE.Object3D | null = null;
let workerTemplateLoading: Promise<THREE.Object3D | null> | null = null;

async function loadWorkerTemplate(): Promise<THREE.Object3D | null> {
  if (workerTemplate) return workerTemplate;
  if (workerTemplateLoading) return workerTemplateLoading;
  workerTemplateLoading = (async () => {
    try {
      const objHead = await fetch(WORKER_OBJ_URL, { method: 'HEAD' });
      if (!objHead.ok) return null;
      const objLoader = new OBJLoader();
      try {
        const mtlHead = await fetch(WORKER_MTL_URL, { method: 'HEAD' });
        if (mtlHead.ok) {
          const mtl = await new MTLLoader().loadAsync(WORKER_MTL_URL);
          mtl.preload();
          objLoader.setMaterials(mtl);
        }
      } catch {
        /* MTL is optional */
      }
      const obj = await objLoader.loadAsync(WORKER_OBJ_URL);
      // MagicaVoxel exports center the model in its volume; bottom may sit below y=0.
      // Recenter so the lowest voxel touches y=0.
      obj.updateMatrixWorld();
      const bbox = new THREE.Box3().setFromObject(obj);
      const sizeY = bbox.max.y - bbox.min.y;
      const target = 1.4; // world units tall, comparable to placeholder
      const scale = target / Math.max(sizeY, 0.001);
      obj.scale.setScalar(scale);
      obj.updateMatrixWorld();
      const scaled = new THREE.Box3().setFromObject(obj);
      obj.position.y -= scaled.min.y;
      obj.position.x -= (scaled.min.x + scaled.max.x) / 2;
      obj.position.z -= (scaled.min.z + scaled.max.z) / 2;
      workerTemplate = obj;
      return obj;
    } catch {
      return null;
    }
  })();
  return workerTemplateLoading;
}

export async function createThreeApp(host: HTMLDivElement): Promise<ThreeApp> {
  await loadWorkerTemplate(); // best-effort; null fallback to placeholder

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050a14');
  scene.fog = new THREE.Fog('#050a14', 28, 70);

  const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
  const cam = new THREE.OrthographicCamera(-14 * aspect, 14 * aspect, 14, -14, 0.1, 200);
  positionIsoCamera(cam, 36);
  cam.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.classList.add('three-canvas');

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(8, 14, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ad8ff, 0.4);
  fill.position.set(-6, 8, -6);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x223344, 0.55));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#0d1a2c', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(80, 40, 0x1a3050, 0x0a1828);
  grid.position.y = 0.01;
  scene.add(grid);

  const patchGroup = new THREE.Group();
  scene.add(patchGroup);
  const baseGroup = new THREE.Group();
  scene.add(baseGroup);
  const unitsGroup = new THREE.Group();
  scene.add(unitsGroup);

  const baseMeshes = new Map<string, THREE.Group>();
  const workerEntries = new Map<string, WorkerEntry>();
  const patchMeshes = new Map<string, { mesh: THREE.Mesh; label: string }>();

  const projectionVec = new THREE.Vector3();
  let onFrame: ((snap: FrameSnapshot) => void) | null = null;

  let lastTime = performance.now();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const workers: WorkerProjection[] = [];
    for (const entry of workerEntries.values()) {
      stepWorker(entry, dt, now);
      projectionVec.copy(entry.group.position);
      projectionVec.y += 1.4;
      projectionVec.project(cam);
      const sx = (projectionVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      const sy = (-projectionVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      workers.push({
        workerId: entry.workerId,
        label: entry.label,
        alive: entry.alive,
        carrying: entry.carrying,
        screenX: sx,
        screenY: sy,
      });
    }

    const patches: PatchProjection[] = [];
    for (const [workerId, entry] of patchMeshes) {
      projectionVec.copy(entry.mesh.position);
      projectionVec.y += 0.4;
      projectionVec.project(cam);
      const sx = (projectionVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      const sy = (-projectionVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      patches.push({ workerId, label: entry.label, screenX: sx, screenY: sy });
    }

    if (onFrame) onFrame({ workers, patches });
    renderer.render(scene, cam);
  };
  animate();

  function syncFromState(state: WorldState) {
    const seenProjects = new Set<string>();
    for (const project of Object.values(state.projects)) {
      seenProjects.add(project.id);
      let mesh = baseMeshes.get(project.id);
      if (!mesh) {
        const colorStr = project.color ?? fallbackColor(project.id);
        mesh = createSpaceFactory(colorStr);
        const pos = placeOnGround(`base:${project.id}`);
        mesh.position.set(pos.x, 0, pos.z);
        baseGroup.add(mesh);
        baseMeshes.set(project.id, mesh);
      }
    }
    for (const [id, mesh] of baseMeshes) {
      if (!seenProjects.has(id)) {
        baseGroup.remove(mesh);
        baseMeshes.delete(id);
      }
    }

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
      if (entry.activity === 'tool_use' && worker.activity !== 'tool_use' && worker.alive) {
        entry.carrying = true;
      }
      entry.activity = worker.activity;
      entry.basePosition = baseMeshes.get(worker.projectId)?.position ?? entry.basePosition;
    }
    for (const [id, entry] of workerEntries) {
      if (!seenWorkers.has(id)) {
        unitsGroup.remove(entry.group);
        workerEntries.delete(id);
      }
    }

    // Patches: 1:1 with alive workers per project, fanned across the camera-facing arc.
    const aliveByProject = new Map<string, string[]>();
    for (const w of Object.values(state.workers)) {
      if (!w.alive) continue;
      const list = aliveByProject.get(w.projectId) ?? [];
      list.push(w.id);
      aliveByProject.set(w.projectId, list);
    }
    const seenPatches = new Set<string>();
    for (const [projectId, ids] of aliveByProject) {
      ids.sort();
      const base = baseMeshes.get(projectId);
      if (!base) continue;
      const N = ids.length;
      for (let i = 0; i < N; i++) {
        const wid = ids[i]!;
        seenPatches.add(wid);
        const angle = PATCH_ARC_START + PATCH_ARC_SPAN * (i + 0.5) / N;
        const px = base.position.x + Math.cos(angle) * PATCH_RADIUS;
        const pz = base.position.z + Math.sin(angle) * PATCH_RADIUS;
        let entry = patchMeshes.get(wid);
        if (!entry) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.6, 0.9),
            new THREE.MeshStandardMaterial({ color: '#7e57c2', emissive: '#311b92', emissiveIntensity: 0.6 })
          );
          patchGroup.add(mesh);
          const label = state.workers[wid]?.label ?? wid;
          entry = { mesh, label };
          patchMeshes.set(wid, entry);
        }
        entry.label = state.workers[wid]?.label ?? wid;
        entry.mesh.position.set(px, 0.3, pz);
        const we = workerEntries.get(wid);
        if (we) we.patchPosition.set(px, 0, pz);
      }
    }
    for (const [wid, entry] of patchMeshes) {
      if (!seenPatches.has(wid)) {
        patchGroup.remove(entry.mesh);
        patchMeshes.delete(wid);
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
    cam.left = -14 * a; cam.right = 14 * a;
    cam.top = 14; cam.bottom = -14;
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
  body: THREE.Mesh | THREE.Object3D;
  carry: THREE.Mesh;
  carrying: boolean;
  basePosition: THREE.Vector3 | undefined;
  patchPosition: THREE.Vector3;
  phase: number;
  usingTemplate: boolean;
}

function createWorkerEntry(
  workerId: string,
  label: string,
  base: THREE.Group | undefined
): WorkerEntry {
  const group = new THREE.Group();
  let body: THREE.Mesh | THREE.Object3D;
  let usingTemplate = false;

  if (workerTemplate) {
    const clone = workerTemplate.clone(true);
    // re-clone materials so per-worker tinting works without leaking
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = (child as THREE.Mesh).material;
        if (Array.isArray(m)) (child as THREE.Mesh).material = m.map((x) => x.clone());
        else if (m) (child as THREE.Mesh).material = m.clone();
      }
    });
    group.add(clone);
    body = clone;
    usingTemplate = true;
  } else {
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.0, 0.5),
      new THREE.MeshStandardMaterial({ color: '#50e3c2', emissive: '#0e3a30', emissiveIntensity: 0.35 })
    );
    placeholder.position.y = 0.5;
    group.add(placeholder);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: '#a4f4e3' })
    );
    head.position.y = 1.2;
    group.add(head);
    body = placeholder;
  }

  const carry = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({
      color: '#d1c4ff',
      emissive: '#7e57c2',
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.95,
    })
  );
  carry.position.y = 1.9;
  carry.visible = false;
  group.add(carry);

  const seedPos = placeOnGround(`worker:${workerId}`);
  group.position.set(seedPos.x, 0, seedPos.z);
  return {
    workerId,
    label,
    alive: true,
    activity: 'idle',
    group,
    body,
    carry,
    carrying: false,
    basePosition: base?.position,
    patchPosition: new THREE.Vector3(PATCH_RADIUS, 0, 0),
    phase: hashFloat(workerId),
    usingTemplate,
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
    const target = pickTarget(entry);
    const dir = target.clone().sub(entry.group.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.05) {
      dir.normalize().multiplyScalar(0.024);
      entry.group.position.add(dir);
      entry.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
    if (!entry.usingTemplate && (entry.body as THREE.Mesh).position) {
      (entry.body as THREE.Mesh).position.y = 0.5 + Math.sin(t * 6) * 0.04;
    }

    if (entry.carrying && entry.basePosition) {
      const dx = entry.group.position.x - entry.basePosition.x;
      const dz = entry.group.position.z - entry.basePosition.z;
      if (Math.sqrt(dx * dx + dz * dz) < 1.0) entry.carrying = false;
    }
  }

  entry.carry.visible = entry.carrying && entry.alive;
  if (entry.carry.visible && !frozen) {
    entry.carry.position.y = 1.9 + Math.sin(t * 5) * 0.1;
    entry.carry.rotation.y = t * 1.5;
  }

  entry.group.scale.setScalar(entry.alive ? 1 : 0.6);
}

function pickTarget(entry: WorkerEntry): THREE.Vector3 {
  if (entry.carrying && entry.basePosition) return entry.basePosition;
  return entry.patchPosition;
}

function createSpaceFactory(colorStr: string): THREE.Group {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: colorStr, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1c2332', roughness: 0.7, metalness: 0.2 });
  const win = new THREE.MeshStandardMaterial({ color: '#a4f4e3', emissive: '#3df0c4', emissiveIntensity: 1.0 });
  const tip = new THREE.MeshStandardMaterial({ color: '#ffce5b', emissive: '#ffce5b', emissiveIntensity: 1.4 });

  // Footprint pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 3.4), dark);
  pad.position.y = 0.15;
  group.add(pad);

  // Mid-block (the factory body)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), hull);
  body.position.y = 0.3 + 0.8;
  group.add(body);

  // Window strip — 4 small panes per long side
  for (let s = 0; s < 4; s++) {
    const angle = (s * Math.PI) / 2;
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.06), win);
      w.position.set(
        Math.sin(angle) * 1.31 + i * 0.55 * Math.cos(angle),
        1.05,
        Math.cos(angle) * 1.31 - i * 0.55 * Math.sin(angle)
      );
      w.rotation.y = angle;
      group.add(w);
    }
  }

  // Tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), hull);
  tower.position.y = 0.3 + 1.6 + 0.7;
  group.add(tower);

  // Tower windows
  for (let s = 0; s < 4; s++) {
    const angle = (s * Math.PI) / 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.05), win);
    w.position.set(Math.sin(angle) * 0.61, 0.3 + 1.6 + 0.7, Math.cos(angle) * 0.61);
    w.rotation.y = angle;
    group.add(w);
  }

  // Antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 8), dark);
  mast.position.y = 0.3 + 1.6 + 1.4 + 0.5;
  group.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), tip);
  beacon.position.y = 0.3 + 1.6 + 1.4 + 1.05;
  group.add(beacon);

  // Corner pylons
  for (let i = 0; i < 4; i++) {
    const ax = i % 2 === 0 ? 1.5 : -1.5;
    const az = i < 2 ? 1.5 : -1.5;
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), dark);
    pyl.position.set(ax, 0.3 + 0.7, az);
    group.add(pyl);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), tip);
    cap.position.set(ax, 0.3 + 1.4 + 0.05, az);
    group.add(cap);
  }

  return group;
}
