import * as THREE from 'three';
import { VOXLoader, VOXMesh } from 'three/examples/jsm/loaders/VOXLoader.js';
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
const PATCH_ARC_SPAN = Math.PI;
const DEFAULT_PATCH_ARC_CENTER = Math.PI / 4;
const MCP_RADIUS = 8.5;
const MCP_ARC_CENTER = -3 * Math.PI / 4; // opposite side from default patch arc
const MCP_ARC_SPAN = Math.PI / 2;
const ZOOM_EXTENT_MIN = 4;
const ZOOM_EXTENT_MAX = 30;
const ZOOM_EXTENT_DEFAULT = 14;
const ZOOM_STEP = 1.1;
/** Minimum distance between two project bases. Comfortable buffer so each
 *  project's patch fan (radius 5.5) and MCP ring (radius 8.5) sit cleanly
 *  apart with visual breathing room. */
const MIN_BASE_DISTANCE = 28;
const WALK_BOB_AMPLITUDE = 0.08;
const WALK_BOB_FREQ = 8; // rad/s
/** How far short of the work-site the worker stops, so they don't visually
 *  clip into the patch / MCP server while harvesting. */
const HARVEST_STOP_DISTANCE = 1.2;
/** Distance from a project base at which a carrying worker stops to throw
 *  its payload, well outside the 3.4-wide base footprint. */
const DEPOSIT_STOP_DISTANCE_BASE = 2.5;
/** Distance from a parent worker (subagent → parent deposit) — tighter since
 *  a worker has a small footprint. */
const DEPOSIT_STOP_DISTANCE_PARENT = 1.5;
const THROW_DURATION_MS = 600;
const THROW_ARC_HEIGHT = 1.6;
/** A worker's mineral patch sticks around this long after the worker's last
 *  event before it despawns (in wall-clock ms). Lets a worker go dark, get
 *  swept to alive=false, etc., without instantly losing the visual harvest
 *  zone. Ground markers already persist for project lifetime; this aligns
 *  the patch voxel's TTL with that intent. */
const PATCH_ACTIVITY_TTL_MS = 5 * 60 * 1000;
const WORKER_VOX_URL = '/assets/MechaTrooper.vox';

let workerTemplate: THREE.Object3D | null = null;
let workerTemplateLoading: Promise<THREE.Object3D | null> | null = null;

async function loadWorkerTemplate(): Promise<THREE.Object3D | null> {
  if (workerTemplate) return workerTemplate;
  if (workerTemplateLoading) return workerTemplateLoading;
  workerTemplateLoading = (async () => {
    try {
      const head = await fetch(WORKER_VOX_URL, { method: 'HEAD' });
      if (!head.ok) return null;
      const loader = new VOXLoader();
      // VOXLoader has no loadAsync helper; wrap the callback API.
      const chunks = await new Promise<unknown[]>((resolve, reject) => {
        loader.load(
          WORKER_VOX_URL,
          (parsed) => resolve(parsed as unknown[]),
          undefined,
          (err) => reject(err),
        );
      });
      // A .vox file can contain multiple chunks (separate models in one
      // file); combine all chunks into one Group as the worker template.
      // VOXMesh isn't safely cloneable — its constructor expects a `chunk`
      // arg and Object3D.clone() does `new this.constructor()` with no
      // args, which throws on `chunk.data`. Wrap each as a plain Mesh
      // reusing the VOXMesh's geometry + material so the template can be
      // deep-cloned per worker via the standard path.
      const group = new THREE.Group();
      for (const chunk of chunks) {
        const vm = new VOXMesh(chunk as ConstructorParameters<typeof VOXMesh>[0]);
        const mesh = new THREE.Mesh(vm.geometry, vm.material);
        group.add(mesh);
      }
      // MagicaVoxel models are centered in their volume; bottom may sit
      // below y=0 and the model may not be on the x/z origin. Recenter so
      // the lowest voxel touches y=0 and the model is centered horizontally.
      group.updateMatrixWorld();
      const bbox = new THREE.Box3().setFromObject(group);
      const sizeY = Math.max(bbox.max.y - bbox.min.y, 0.001);
      const target = 1.4; // worker height in world units
      const scale = target / sizeY;
      group.scale.setScalar(scale);
      group.updateMatrixWorld();
      const scaled = new THREE.Box3().setFromObject(group);
      group.position.y -= scaled.min.y;
      group.position.x -= (scaled.min.x + scaled.max.x) / 2;
      group.position.z -= (scaled.min.z + scaled.max.z) / 2;
      workerTemplate = group;
      return group;
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

  let zoomExtent = ZOOM_EXTENT_DEFAULT;
  const camTarget = new THREE.Vector3(0, 0.5, 0);
  const cam = new THREE.OrthographicCamera(-14, 14, 14, -14, 0.1, 200);
  applyFrustum(cam, host.clientWidth || 1, host.clientHeight || 1, zoomExtent);
  positionIsoCamera(cam, 36, camTarget);
  cam.updateProjectionMatrix();

  // WASD camera pan: track held keys, integrate camTarget per frame.
  const keysHeld = new Set<string>();
  const onKeyDown = (ev: KeyboardEvent) => {
    if (['w', 'a', 's', 'd'].includes(ev.key.toLowerCase())) keysHeld.add(ev.key.toLowerCase());
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    keysHeld.delete(ev.key.toLowerCase());
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

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

  // Markers go below patches in the scene graph so they render under the
  // patch voxels (same y-plane, marker is flatter).
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const patchGroup = new THREE.Group();
  scene.add(patchGroup);
  const baseGroup = new THREE.Group();
  scene.add(baseGroup);
  const mcpGroup = new THREE.Group();
  scene.add(mcpGroup);
  const unitsGroup = new THREE.Group();
  scene.add(unitsGroup);
  const beamGroup = new THREE.Group();
  scene.add(beamGroup);
  const throwGroup = new THREE.Group();
  scene.add(throwGroup);

  const baseMeshes = new Map<string, THREE.Group>();
  const workerEntries = new Map<string, WorkerEntry>();
  const patchMeshes = new Map<string, { mesh: THREE.Mesh; label: string }>();
  const mcpMeshes = new Map<string, { mesh: THREE.Group; position: THREE.Vector3; label: string }>();
  /** Persistent ground markers — created on first patch sighting per worker,
   *  positioned wherever that worker's patch currently is, frozen when the
   *  worker leaves state, removed only when the project itself is removed. */
  const groundMarkers = new Map<string, { mesh: THREE.Mesh; projectId: string }>();

  const projectionVec = new THREE.Vector3();
  let onFrame: ((snap: FrameSnapshot) => void) | null = null;

  let lastTime = performance.now();
  let raf = 0;
  const _camForward = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const PAN_SPEED = 14; // world units per second
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (keysHeld.size > 0) {
      cam.getWorldDirection(_camForward);
      _camForward.y = 0;
      _camForward.normalize();
      _camRight.set(_camForward.z, 0, -_camForward.x);
      const step = PAN_SPEED * dt;
      let dx = 0, dz = 0;
      if (keysHeld.has('w')) dz += step;
      if (keysHeld.has('s')) dz -= step;
      if (keysHeld.has('d')) dx += step;
      if (keysHeld.has('a')) dx -= step;
      if (dx !== 0 || dz !== 0) {
        camTarget.addScaledVector(_camRight, dx);
        camTarget.addScaledVector(_camForward, dz);
        positionIsoCamera(cam, 36, camTarget);
      }
    }

    const wallClock = Date.now();
    const workers: WorkerProjection[] = [];
    for (const entry of workerEntries.values()) {
      stepWorker(entry, dt, now);
      // Re-evaluate the tint each frame so the sub-3s grace window flips to
      // red precisely when sustained idle is reached, not only on the next
      // state change. applyStatusTint short-circuits if the color is unchanged.
      applyStatusTint(entry, now);
      // Toggle this worker's patch visibility against the activity TTL each
      // frame, so a patch fades out without needing a state event to tick
      // syncFromState. Alive workers always show their patch; dead workers
      // keep theirs until 5 min past their last event.
      const patch = patchMeshes.get(entry.workerId);
      if (patch) {
        patch.mesh.visible = entry.alive || (wallClock - entry.lastEventAt <= PATCH_ACTIVITY_TTL_MS);
      }
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
      if (!entry.mesh.visible) continue;
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
        const pos = placeBaseAvoidingOthers(project.id, baseMeshes);
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
    // Clean up ground markers belonging to removed projects. Markers persist
    // for the lifetime of the project, not the worker that created them.
    for (const [markerKey, m] of groundMarkers) {
      if (!seenProjects.has(m.projectId)) {
        markerGroup.remove(m.mesh);
        groundMarkers.delete(markerKey);
      }
    }

    // MCP servers: rendered as off-base obelisks, fanned on the arc opposite the patches.
    const mcpByProject = new Map<string, string[]>();
    for (const s of Object.values(state.mcpServers)) {
      const list = mcpByProject.get(s.projectId) ?? [];
      list.push(s.id);
      mcpByProject.set(s.projectId, list);
    }
    const seenMcp = new Set<string>();
    for (const [projectId, ids] of mcpByProject) {
      ids.sort();
      const base = baseMeshes.get(projectId);
      if (!base) continue;
      const N = ids.length;
      for (let i = 0; i < N; i++) {
        const sid = ids[i]!;
        seenMcp.add(sid);
        const angle = MCP_ARC_CENTER - MCP_ARC_SPAN / 2 + MCP_ARC_SPAN * (i + 0.5) / N;
        const sx = base.position.x + Math.cos(angle) * MCP_RADIUS;
        const sz = base.position.z + Math.sin(angle) * MCP_RADIUS;
        const server = state.mcpServers[sid]!;
        let entry = mcpMeshes.get(sid);
        if (!entry) {
          const mesh = createMcpServer();
          mcpGroup.add(mesh);
          entry = { mesh, position: new THREE.Vector3(sx, 0, sz), label: server.name };
          mcpMeshes.set(sid, entry);
        }
        entry.mesh.position.set(sx, 0, sz);
        entry.position.set(sx, 0, sz);
        entry.label = server.name;
      }
    }
    for (const [sid, entry] of mcpMeshes) {
      if (!seenMcp.has(sid)) {
        mcpGroup.remove(entry.mesh);
        mcpMeshes.delete(sid);
      }
    }

    const seenWorkers = new Set<string>();
    for (const worker of Object.values(state.workers)) {
      seenWorkers.add(worker.id);
      let entry = workerEntries.get(worker.id);
      if (!entry) {
        entry = createWorkerEntry(worker.id, worker.label ?? worker.id, baseMeshes.get(worker.projectId));
        unitsGroup.add(entry.group);
        beamGroup.add(entry.beam);
        throwGroup.add(entry.thrownCarry);
        workerEntries.set(worker.id, entry);
      }
      entry.label = worker.label ?? worker.id;
      entry.alive = worker.alive;
      entry.errorCount = worker.errorCount;
      entry.lastEventAt = worker.lastEventAt;
      // Resolve which MCP server (if any) this worker targets when in mcp_call.
      // Pick deterministically by hashing workerId across the project's servers so
      // multi-server projects spread traffic visibly.
      const projectMcpIds = mcpByProject.get(worker.projectId) ?? [];
      if (projectMcpIds.length > 0) {
        const idx = (Math.abs(hashInt(worker.id)) % projectMcpIds.length);
        const server = mcpMeshes.get(projectMcpIds[idx]!);
        if (server) entry.mcpTargetPosition = server.position;
      } else {
        entry.mcpTargetPosition = undefined;
      }
      // Compute an idle loiter spot just outside the project's base so workers with
      // nothing to do don't pile up on top of the base or sit on a patch.
      const baseMesh = baseMeshes.get(worker.projectId);
      if (baseMesh) {
        const idleAngle = (hashInt(worker.id) % 1024) / 1024 * Math.PI * 2;
        const idleR = 3.4;
        entry.idlePosition.set(
          baseMesh.position.x + Math.cos(idleAngle) * idleR,
          0,
          baseMesh.position.z + Math.sin(idleAngle) * idleR,
        );
      }
      // Carrying flips when the worker leaves an active harvest pose (tool_use or
      // mcp_call) while close enough to the corresponding target.
      if (entry.alive) {
        if (entry.activity === 'tool_use' && worker.activity !== 'tool_use') {
          const dx = entry.group.position.x - entry.patchPosition.x;
          const dz = entry.group.position.z - entry.patchPosition.z;
          if (Math.sqrt(dx * dx + dz * dz) < 1.5) entry.carrying = true;
        } else if (entry.activity === 'mcp_call' && worker.activity !== 'mcp_call' && entry.mcpTargetPosition) {
          const dx = entry.group.position.x - entry.mcpTargetPosition.x;
          const dz = entry.group.position.z - entry.mcpTargetPosition.z;
          if (Math.sqrt(dx * dx + dz * dz) < 1.8) entry.carrying = true;
        }
      }
      // Track idle transitions for the sub-3s grace window.
      const wasIdle = entry.activity === 'idle';
      const nowIdle = worker.activity === 'idle';
      if (!wasIdle && nowIdle) entry.idleSince = performance.now();
      else if (wasIdle && !nowIdle) entry.idleSince = null;
      // Remember the worker's most recent real work site so sub-3s idle blips
      // keep the worker heading toward where it was pulling from.
      if (worker.activity === 'tool_use') entry.lastWorkTarget = 'patch';
      else if (worker.activity === 'mcp_call') entry.lastWorkTarget = 'mcp';
      entry.activity = worker.activity;
      entry.basePosition = baseMeshes.get(worker.projectId)?.position ?? entry.basePosition;
      applyStatusTint(entry, performance.now());
    }
    for (const [id, entry] of workerEntries) {
      if (!seenWorkers.has(id)) {
        unitsGroup.remove(entry.group);
        beamGroup.remove(entry.beam);
        throwGroup.remove(entry.thrownCarry);
        workerEntries.delete(id);
      }
    }
    // Resolve subagent → parent links once all worker entries exist this pass.
    for (const worker of Object.values(state.workers)) {
      const entry = workerEntries.get(worker.id);
      if (!entry) continue;
      entry.parentEntry = worker.parentWorkerId
        ? workerEntries.get(worker.parentWorkerId)
        : undefined;
    }

    // Patches: alive workers always get one; dead workers keep theirs for
    // PATCH_ACTIVITY_TTL_MS after their last event so a worker that goes
    // silent or gets swept to alive=false doesn't instantly lose the
    // associated harvest-zone visual. The animate loop also toggles
    // visibility on this same TTL so patches fade without needing a state
    // change to re-run syncFromState.
    const recentByProject = new Map<string, string[]>();
    const nowWallClock = Date.now();
    for (const w of Object.values(state.workers)) {
      if (!w.alive && nowWallClock - w.lastEventAt > PATCH_ACTIVITY_TTL_MS) continue;
      const list = recentByProject.get(w.projectId) ?? [];
      list.push(w.id);
      recentByProject.set(w.projectId, list);
    }
    const seenPatches = new Set<string>();
    for (const [projectId, ids] of recentByProject) {
      ids.sort();
      const base = baseMeshes.get(projectId);
      if (!base) continue;
      const project = state.projects[projectId];
      const arcCenter = project?.patchArcCenter ?? DEFAULT_PATCH_ARC_CENTER;
      const arcStart = arcCenter - PATCH_ARC_SPAN / 2;
      const N = ids.length;
      for (let i = 0; i < N; i++) {
        const wid = ids[i]!;
        seenPatches.add(wid);
        const angle = arcStart + PATCH_ARC_SPAN * (i + 0.5) / N;
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

        // Persistent ground marker — keyed by workerId, scoped to project.
        // Created on first sighting; position tracks the patch while the
        // worker is alive; frozen when the worker leaves state.workers;
        // removed only when the project itself disappears.
        let marker = groundMarkers.get(wid);
        if (!marker) {
          const markerMesh = createGroundMarker();
          markerGroup.add(markerMesh);
          marker = { mesh: markerMesh, projectId };
          groundMarkers.set(wid, marker);
        }
        marker.mesh.position.set(px, 0.02, pz);
      }
    }
    for (const [wid, entry] of patchMeshes) {
      if (!seenPatches.has(wid)) {
        patchGroup.remove(entry.mesh);
        patchMeshes.delete(wid);
      }
    }
  }

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    // deltaY > 0 = scroll down = zoom out; < 0 = zoom in.
    const factor = ev.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomExtent = Math.min(ZOOM_EXTENT_MAX, Math.max(ZOOM_EXTENT_MIN, zoomExtent * factor));
    applyFrustum(cam, host.clientWidth || 1, host.clientHeight || 1, zoomExtent);
  };
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  function dispose() {
    cancelAnimationFrame(raf);
    renderer.domElement.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    renderer.dispose();
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
  }

  function resize(w: number, h: number) {
    applyFrustum(cam, w, h, zoomExtent);
    renderer.setSize(w, h);
  }

  return {
    dispose,
    resize,
    setOnFrame: (cb) => { onFrame = cb; },
    syncFromState,
  };
}

/** Clamp the orthographic frustum so the base + fanned patches fit on any aspect ratio. */
function applyFrustum(cam: THREE.OrthographicCamera, w: number, h: number, extent: number): void {
  const a = (w || 1) / (h || 1);
  if (a >= 1) {
    cam.left = -extent * a;
    cam.right = extent * a;
    cam.top = extent;
    cam.bottom = -extent;
  } else {
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent / a;
    cam.bottom = -extent / a;
  }
  cam.updateProjectionMatrix();
}

function positionIsoCamera(cam: THREE.OrthographicCamera, distance: number, target: THREE.Vector3): void {
  const { azimuth, elevation } = ISO_CAMERA_ANGLE;
  const x = Math.cos(elevation) * Math.cos(azimuth) * distance;
  const y = Math.sin(elevation) * distance;
  const z = Math.cos(elevation) * Math.sin(azimuth) * distance;
  cam.position.set(target.x + x, target.y + y, target.z + z);
  cam.lookAt(target.x, target.y, target.z);
}

interface WorkerEntry {
  workerId: string;
  label: string;
  alive: boolean;
  activity: 'idle' | 'thinking' | 'tool_use' | 'mcp_call' | 'streaming';
  errorCount: number;
  group: THREE.Group;
  body: THREE.Mesh | THREE.Object3D;
  carry: THREE.Mesh;
  carrying: boolean;
  basePosition: THREE.Vector3 | undefined;
  patchPosition: THREE.Vector3;
  mcpTargetPosition: THREE.Vector3 | undefined;
  /** Where this worker loiters when sustained-idle — outside the base, deterministic. */
  idlePosition: THREE.Vector3;
  /** performance.now() of the most recent transition into idle, or null if not idle. */
  idleSince: number | null;
  /** Last "real" work site the worker pulled from, used as the fallback target during sub-3s idle blips. */
  lastWorkTarget: 'patch' | 'mcp';
  phase: number;
  usingTemplate: boolean;
  lastTintColor: number;
  /** Glowing status ring at the worker's feet (green/yellow/red). */
  statusRing: THREE.Mesh;
  /** Material reference for the ring so applyStatusTint can recolor it cheaply. */
  statusRingMaterial: THREE.MeshBasicMaterial;
  /** Blinking red orb above the worker; visible only when errorCount > 0. */
  errorLight: THREE.Mesh;
  /** Laser between the worker and its current work target, only visible while harvesting. */
  beam: THREE.Mesh;
  /** Wall-clock time of the worker's last event, mirrored from state.
   *  Used by the animate loop to toggle patch visibility based on the 5m
   *  activity TTL without waiting for the next state change. */
  lastEventAt: number;
  /** Throw state for the deposit-at-base/parent animation. */
  throwState: 'none' | 'throwing';
  throwStart: number;
  throwStartPos: THREE.Vector3;
  throwEndPos: THREE.Vector3;
  /** Scene-level voxel used for the parabolic throw arc — hidden by default. */
  thrownCarry: THREE.Mesh;
  /** If this worker is a subagent of another, the parent's WorkerEntry. Resolved in syncFromState. */
  parentEntry: WorkerEntry | undefined;
}

const SUSTAINED_IDLE_MS = 3000;

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

  // Glowing status ring at feet — primary at-a-glance status signal.
  const statusRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const statusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.85, 32),
    statusRingMaterial,
  );
  statusRing.rotation.x = -Math.PI / 2;
  statusRing.position.y = 0.04;
  group.add(statusRing);

  // Blinking red error indicator above the worker.
  const errorLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  errorLight.position.y = 2.4;
  errorLight.visible = false;
  group.add(errorLight);

  // Laser beam mesh — one per worker, parented to scene-level beamGroup later.
  // Cylinder with origin at one end so we can scale-y to reach a target.
  const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  beam.visible = false;

  // Scene-level "thrown" payload mesh — used for the deposit-arc animation.
  // Identical look to the local carry voxel; lives in throwGroup so its world
  // position is independent of the worker's local frame.
  const thrownCarry = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({
      color: '#d1c4ff',
      emissive: '#7e57c2',
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.95,
    }),
  );
  thrownCarry.visible = false;

  // Spawn the worker at the same base-relative loiter spot the idle logic
  // uses, so workers always appear just outside their own base.
  const idleAngle = (hashInt(workerId) % 1024) / 1024 * Math.PI * 2;
  const idleR = 3.4;
  const spawnX = (base?.position.x ?? 0) + Math.cos(idleAngle) * idleR;
  const spawnZ = (base?.position.z ?? 0) + Math.sin(idleAngle) * idleR;
  group.position.set(spawnX, 0, spawnZ);
  return {
    workerId,
    label,
    alive: true,
    activity: 'idle',
    errorCount: 0,
    group,
    body,
    carry,
    carrying: false,
    basePosition: base?.position,
    patchPosition: new THREE.Vector3(PATCH_RADIUS, 0, 0),
    mcpTargetPosition: undefined,
    idlePosition: new THREE.Vector3(spawnX, 0, spawnZ),
    idleSince: performance.now(),
    lastWorkTarget: 'patch',
    phase: hashFloat(workerId),
    usingTemplate,
    lastTintColor: -1,
    statusRing,
    statusRingMaterial,
    errorLight,
    beam,
    lastEventAt: Date.now(),
    throwState: 'none',
    throwStart: 0,
    throwStartPos: new THREE.Vector3(),
    throwEndPos: new THREE.Vector3(),
    thrownCarry,
    parentEntry: undefined,
  };
}

function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function hashFloat(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

const _stepDir = new THREE.Vector3();
const _beamUp = new THREE.Vector3(0, 1, 0);
const _beamDir = new THREE.Vector3();
function stepWorker(entry: WorkerEntry, _dt: number, now: number): void {
  const t = (now / 1000) + entry.phase * 4;
  const frozen = typeof window !== 'undefined' && (window as Window & { __RTC_FREEZE_MOTION?: boolean }).__RTC_FREEZE_MOTION === true;

  // Determine whether the worker is harvesting at a work site this frame —
  // i.e. its activity is an active extract pose AND it's at the corresponding
  // target without the carry already in hand. Used to drive both the
  // stop-short-of-target behavior and the laser beam.
  const isHarvesting = entry.alive && !entry.carrying && (
    (entry.activity === 'tool_use') ||
    (entry.activity === 'mcp_call' && !!entry.mcpTargetPosition)
  );
  const harvestTarget: THREE.Vector3 | null =
    entry.activity === 'tool_use' ? entry.patchPosition
    : entry.activity === 'mcp_call' ? (entry.mcpTargetPosition ?? null)
    : null;
  const distToHarvest = harvestTarget
    ? Math.hypot(entry.group.position.x - harvestTarget.x, entry.group.position.z - harvestTarget.z)
    : Infinity;
  const atWorkSite = isHarvesting && distToHarvest <= HARVEST_STOP_DISTANCE;

  // Determine whether the worker is at the deposit target with a payload to
  // throw. depositTarget moves with the parent worker for subagents, so we
  // re-read it each frame.
  const depositTarget = entry.carrying ? depositTargetFor(entry) : undefined;
  const distToDeposit = depositTarget
    ? Math.hypot(entry.group.position.x - depositTarget.x, entry.group.position.z - depositTarget.z)
    : Infinity;
  const atDeposit = !!depositTarget && distToDeposit <= depositStopDistanceFor(entry);

  // Kick off a throw when first reaching the deposit zone with a payload.
  if (atDeposit && entry.throwState === 'none' && entry.alive) {
    entry.throwState = 'throwing';
    entry.throwStart = now;
    entry.throwStartPos.set(
      entry.group.position.x,
      entry.group.position.y + 1.4,
      entry.group.position.z,
    );
    // Aim slightly above the deposit target so the arc reads as "into" the
    // structure rather than into the ground.
    const targetY = entry.parentEntry ? 1.4 : 2.5;
    entry.throwEndPos.set(depositTarget!.x, targetY, depositTarget!.z);
    entry.thrownCarry.position.copy(entry.throwStartPos);
    entry.thrownCarry.visible = true;
  }

  // Suppress walking whenever the worker is mid-throw or at the harvest site.
  const stationary = atWorkSite || entry.throwState === 'throwing';

  if (!frozen) {
    const target = pickTarget(entry, now);
    _stepDir.copy(target).sub(entry.group.position);
    _stepDir.y = 0;
    const dist = _stepDir.length();
    const moving = dist > 0.05 && !stationary;
    if (moving) {
      _stepDir.normalize().multiplyScalar(0.024);
      entry.group.position.add(_stepDir);
      entry.group.rotation.y = Math.atan2(_stepDir.x, _stepDir.z);
      entry.group.position.y = Math.sin(t * WALK_BOB_FREQ) * WALK_BOB_AMPLITUDE;
    } else if (entry.group.position.y !== 0) {
      // Settle to the ground when not moving so idle workers don't levitate.
      entry.group.position.y = 0;
    }
    // While stopped at a work or deposit site, face the target so the beam /
    // throw read as "aimed."
    const facingTarget = atWorkSite ? harvestTarget : (entry.throwState === 'throwing' ? depositTarget : null);
    if (facingTarget) {
      const fx = facingTarget.x - entry.group.position.x;
      const fz = facingTarget.z - entry.group.position.z;
      if (fx * fx + fz * fz > 1e-6) entry.group.rotation.y = Math.atan2(fx, fz);
    }
  }

  // Animate the throw arc each frame; on landing, hide the thrown voxel and
  // mark the carry as delivered.
  if (entry.throwState === 'throwing') {
    const p = Math.min(1, (now - entry.throwStart) / THROW_DURATION_MS);
    const sx = entry.throwStartPos.x, sy = entry.throwStartPos.y, sz = entry.throwStartPos.z;
    const ex = entry.throwEndPos.x,   ey = entry.throwEndPos.y,   ez = entry.throwEndPos.z;
    entry.thrownCarry.position.set(
      sx + (ex - sx) * p,
      sy + (ey - sy) * p + Math.sin(Math.PI * p) * THROW_ARC_HEIGHT,
      sz + (ez - sz) * p,
    );
    entry.thrownCarry.rotation.y = t * 4;
    if (p >= 1) {
      entry.thrownCarry.visible = false;
      entry.throwState = 'none';
      entry.carrying = false;
    }
  }

  // Local-on-worker carry voxel: visible while traveling with payload, hidden
  // during the throw arc (the scene-level thrownCarry takes over).
  entry.carry.visible = entry.carrying && entry.alive && entry.throwState !== 'throwing';
  if (entry.carry.visible && !frozen) {
    entry.carry.position.y = 1.9 + Math.sin(t * 5) * 0.1;
    entry.carry.rotation.y = t * 1.5;
  }

  // Beam: from worker chest to harvest target, only while at the work site.
  if (atWorkSite && harvestTarget && entry.alive) {
    const sourceY = 1.4;
    const targetY = harvestTarget === entry.patchPosition ? 0.6 : 1.9;
    _beamDir.set(
      harvestTarget.x - entry.group.position.x,
      targetY - sourceY,
      harvestTarget.z - entry.group.position.z,
    );
    const len = _beamDir.length();
    entry.beam.position.set(entry.group.position.x, entry.group.position.y + sourceY, entry.group.position.z);
    entry.beam.scale.set(1, len, 1);
    _beamDir.normalize();
    entry.beam.quaternion.setFromUnitVectors(_beamUp, _beamDir);
    entry.beam.visible = true;
  } else {
    entry.beam.visible = false;
  }

  // Status ring: subtle radial pulse so the glow reads as "alive."
  const ringPulse = 1 + Math.sin(t * 3) * 0.08;
  entry.statusRing.scale.set(ringPulse, 1, ringPulse);

  // Error indicator: blink while errorCount > 0 and worker alive.
  if (entry.errorCount > 0 && entry.alive) {
    entry.errorLight.visible = Math.sin(now / 1000 * 6) > 0;
  } else {
    entry.errorLight.visible = false;
  }

  entry.group.scale.setScalar(entry.alive ? 1 : 0.6);
}

/**
 * Find a placement for a new base that respects MIN_BASE_DISTANCE. Starts at
 * the deterministic seed from placeOnGround, then iteratively pushes away
 * from any too-close existing base. Existing bases never move — only the
 * newcomer relocates — so previously placed projects stay put.
 */
function placeBaseAvoidingOthers(
  projectId: string,
  existing: Map<string, THREE.Group>,
): { x: number; z: number } {
  const seed = placeOnGround(`base:${projectId}`);
  let x = seed.x;
  let z = seed.z;
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (const [otherId, otherMesh] of existing) {
      if (otherId === projectId) continue;
      const dx = x - otherMesh.position.x;
      const dz = z - otherMesh.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 0.001) {
        // Coincident with another base; nudge to a deterministic side based on id.
        const a = (hashInt(projectId) % 360) * Math.PI / 180;
        x += Math.cos(a) * MIN_BASE_DISTANCE;
        z += Math.sin(a) * MIN_BASE_DISTANCE;
        moved = true;
      } else if (d < MIN_BASE_DISTANCE) {
        const push = MIN_BASE_DISTANCE - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

/** Where a carrying worker walks to deposit. Subagents deliver to their parent
 *  worker's current position; everyone else delivers to their project base. */
function depositTargetFor(entry: WorkerEntry): THREE.Vector3 | undefined {
  if (entry.parentEntry) return entry.parentEntry.group.position;
  return entry.basePosition;
}

function depositStopDistanceFor(entry: WorkerEntry): number {
  return entry.parentEntry ? DEPOSIT_STOP_DISTANCE_PARENT : DEPOSIT_STOP_DISTANCE_BASE;
}

function pickTarget(entry: WorkerEntry, now: number): THREE.Vector3 {
  if (entry.carrying) {
    const dep = depositTargetFor(entry);
    if (dep) return dep;
  }
  if (entry.activity === 'mcp_call' && entry.mcpTargetPosition) return entry.mcpTargetPosition;
  if (entry.activity === 'idle') {
    // Sustained idle (>= 3s): walk out to the loiter spot.
    if (entry.idleSince !== null && now - entry.idleSince >= SUSTAINED_IDLE_MS) {
      return entry.idlePosition;
    }
    // Sub-3s idle (between work cycles): keep heading toward the last work site
    // so motion reads as continuous rather than flickering toward the loiter spot.
    if (entry.lastWorkTarget === 'mcp' && entry.mcpTargetPosition) return entry.mcpTargetPosition;
    return entry.patchPosition;
  }
  return entry.patchPosition;
}

const STATUS_GREEN = 0x34d399;
const STATUS_YELLOW = 0xfbbf24;
const STATUS_RED = 0xef4444;

function statusColorFor(entry: WorkerEntry, now: number): number {
  if (!entry.alive) return STATUS_RED;
  const a = entry.activity;
  if (a === 'tool_use' || a === 'mcp_call') return STATUS_GREEN;
  if (a === 'thinking' || a === 'streaming' || entry.errorCount > 0) return STATUS_YELLOW;
  // a === 'idle' — only show red after the sustained-idle threshold so brief
  // between-task idle blips don't flicker the tint.
  if (entry.idleSince !== null && now - entry.idleSince >= SUSTAINED_IDLE_MS) return STATUS_RED;
  return STATUS_YELLOW;
}

function applyStatusTint(entry: WorkerEntry, now: number): void {
  const color = statusColorFor(entry, now);
  if (entry.lastTintColor === color) return;
  entry.lastTintColor = color;
  entry.statusRingMaterial.color.setHex(color);
  entry.body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => setEmissive(m, color));
    else if (mat) setEmissive(mat, color);
  });
}

function setEmissive(material: THREE.Material, color: number): void {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.emissive) return;
  m.emissive.setHex(color);
  m.emissiveIntensity = 0.55;
}

function createGroundMarker(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: '#3a2563',
    roughness: 0.9,
    metalness: 0.0,
    emissive: '#1c0f3a',
    emissiveIntensity: 0.3,
  });
  // Slightly larger than the patch footprint (0.9) so the patch sits
  // visibly on top of it.
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function createMcpServer(): THREE.Group {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#1c2332', roughness: 0.7, metalness: 0.2 });
  const cyan = new THREE.MeshStandardMaterial({ color: '#3df0c4', emissive: '#1bd6a8', emissiveIntensity: 1.4 });
  const hull = new THREE.MeshStandardMaterial({ color: '#3a4a64', roughness: 0.55, metalness: 0.35 });

  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), dark);
  pad.position.y = 0.1;
  group.add(pad);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), hull);
  trunk.position.y = 1.0;
  group.add(trunk);

  // Antenna dish
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), hull);
  dish.position.y = 1.95;
  dish.rotation.x = -Math.PI / 4;
  group.add(dish);

  // Glowing emitter
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), cyan);
  beacon.position.y = 2.2;
  group.add(beacon);

  return group;
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
