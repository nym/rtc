# Real Time Conductor — Spec v1.1 (Ralph-Wiggum-Loop Ready)

> Status: **Locked. Gap-filled. Testable. Documented. Loop-verifiable.** Companion docs: `README.md` (user-authored, see Appendix F), `ASSETS.md` (artist-facing voxel modelling guide).

## Changelog
- **v1.1** — README authorship clarified: user provides `README.md`, agent does not author it. Gate G8 updated to check `## Project goals` and `## Quick start` headings, no unfilled markers, ≥80 lines, demo reference. Appendix F.2 rewritten as "agent must not rewrite the user's README." Halt-and-report condition for missing/unfit README replaces the original-prompt condition.
- **v1.0** — Added Appendix G (completion gates): 10 machine-verifiable gates for the Ralph Wiggum loop, each a single shell command with explicit pass conditions; 120-minute total budget, 8 attempts per gate (G10 capped at 2), 10-minute per-attempt timeout, `.ralph/` logging contract, halt-and-report list. Replaced loose pass criteria in §8 and ONESHOT_PROMPT.md with a pointer to Appendix G.
- **v0.9** — Added Appendix E (video demo capture): Playwright `record-video` always-on, output to `demos/`, dedicated `demo-recording` project that produces a shareable MP4 of the Llminerals scenario. Added Appendix F (README contract): the README the agent must write at the repo root, including the original product brief and step-by-step usage instructions.
- **v0.8** — Added Appendix D (test harness): a `simulate/` package for scenario playback against the coordinator, an `Llminerals Demo` scenario showing 5 workers harvesting, a Playwright E2E setup against Vite, and a "fake coordinator" mode for hermetic browser tests that don't need a Node server.
- **v0.7** — Filled three pre-build gaps via appendices: A (current pricing table, dated), B (Claude Code transcript format with parsing notes), C (concrete runtime constants — port, paths, env vars).
- **v0.6** — Renderer swap: PixiJS → **Three.js**. Voxel pipeline: MagicaVoxel → `.obj` export (not `.vox` runtime). Animation: per-state alternation. Camera: orthographic iso. Asset spec rewritten for voxels.
- **v0.5** — Lock release of v0.4 (folded). Name → Real Time Conductor.
- **v0.4** — React + Arwes + PixiJS stack.
- **v0.3** — Iso 128×64, freeform plane, 4-direction animations.
- **v0.2** — Full kill, transcript on Stop, bidirectional WS.
- **v0.1** — Initial draft.

---

## 1. Vision

A real-time observability dashboard, framed as a sci-fi RTS command center, for parallel Claude / Anthropic agent jobs. Each project is a base. Each running agent is a worker. Tokens consumed are minerals harvested. Errors and rate limits are enemy attacks.

Intended use: leave it open on a second monitor while multiple agentic jobs run across multiple projects, and at a glance see what's happening, what's stuck, what's costing money.

The simulation is driven by **real external job events**, not by an internal game tick. There is no game balance, no AI opponent, no win condition.

The aesthetic: **sci-fi command HUD via Arwes, framing a 3D voxel scene rendered with Three.js at an orthographic isometric camera angle.**

---

## 2. Goals & Non-goals

### Goals (MVP)
- Visualize 1–N concurrent projects ("bases").
- Visualize 1–N workers per project, with live activity and lifecycle.
- Real-time updates from real Claude Code sessions and instrumented SDK scripts.
- Per-worker, per-project, and global totals for tokens and USD.
- Token tracking from Claude Code via transcript parsing on `Stop`.
- Voxel scene rendered live in Three.js with orthographic iso camera.
- Sci-fi HUD via Arwes (frames, animated text, muted-by-default sound).
- Display errors with context.
- Interactive: kill running workers from the dashboard.
- Persist event history to disk for replay / post-mortem.

### Non-goals (MVP)
- Multi-user / shared dashboards. Single user, single machine.
- Cloud deployment. Strictly localhost.
- Authentication / authorization.
- Real pathfinding. Workers tween between fixed anchor points.
- AI opponents, combat, win/lose conditions.
- Buildings, production queues, tech tree (roadmap).
- Fog of war (roadmap).
- Mobile / responsive.
- Live token tracking *during* a Claude Code session.
- Subprocess-level cancellation of workers sharing a PID.
- SSR. Pure client app.
- Skeletal/bone animation. Voxel poses are swapped meshes, not rigged.
- Camera controls (pan, zoom, rotate). Fixed orthographic iso.
- Multi-LOD or distance-based culling. Localhost dashboard, scene fits on screen.

---

## 3. Architecture

```
┌──────────────────────┐                            ┌────────────────────┐
│ Claude Code session  │ ─POST /events───────────► │                    │
│ (hooks → curl)       │ ◄── SIGTERM / SIGKILL ─── │   Coordinator      │
└──────────────────────┘                            │   - HTTP in        │
                                                    │   - WS bidirectional│
┌──────────────────────┐                            │   - JSONL log      │
│ Custom SDK script    │ ─POST /events───────────► │   - PID registry   │
│ (instrumented client)│ ◄── SIGTERM / SIGKILL ─── │   - kill executor  │
└──────────────────────┘                            └─────────┬──────────┘
                                                              │ WS /stream
                                                       events │ ▼ commands
                                                    ┌────────────────────┐
                                                    │   Dashboard        │
                                                    │   ─────────────    │
                                                    │   React shell      │
                                                    │    ├ Arwes HUD     │ (HTML/CSS/SVG)
                                                    │    └ Three canvas  │ (3D voxel scene)
                                                    │   shared store     │
                                                    └────────────────────┘
```

Three flows:
1. Workers → coordinator (`POST /events`).
2. Coordinator → dashboards (snapshot, events, command results over WS).
3. Dashboard → coordinator → workers (`worker.kill` commands).

Internal dashboard structure: a React app where Arwes components render the HUD as DOM, and a Three.js canvas renders the 3D voxel scene at an orthographic isometric angle. Both layers subscribe to a shared store fed by the same pure reducer from `core/`.

---

## 4. Repo layout

```
.
├── core/                          # pure domain (renderer-agnostic)
│   ├── events.ts
│   ├── commands.ts
│   ├── state.ts
│   ├── reduce.ts
│   ├── pricing.ts
│   ├── world.ts                   # 3D world coords + iso camera helpers
│   └── index.ts
├── coordinator/
│   ├── server.ts                  # Fastify + ws (bidirectional)
│   ├── jsonl.ts
│   ├── pid-registry.ts
│   └── index.ts
├── ingest-claude-code/
│   ├── on-session-start.ts
│   ├── on-pretooluse.ts
│   ├── on-posttooluse.ts
│   ├── on-stop.ts                 # transcript → tokens.consumed
│   └── README.md
├── ingest-sdk/
│   ├── index.ts
│   ├── transport.ts
│   └── package.json
├── dashboard/
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/assets/             # see ASSETS.md
│   └── src/
│       ├── main.tsx               # React root, Arwes providers
│       ├── App.tsx
│       ├── transport.ts           # WS client
│       ├── store.ts               # Zustand, fed by reducer
│       ├── arwes/
│       │   ├── theme.ts           # palette tokens (single source of truth)
│       │   ├── providers.tsx      # AnimatorGeneral, Bleeps, Theme
│       │   └── bleeps.ts          # intro / click / error / kill
│       ├── hud/                   # Arwes-driven HTML chrome
│       │   ├── TopBar.tsx
│       │   ├── ErrorToasts.tsx
│       │   ├── WorkerPopover.tsx  # canvas-to-DOM positioned
│       │   ├── KillConfirm.tsx
│       │   └── ConnectionBadge.tsx
│       └── scene/                 # Three.js scene
│           ├── ThreeCanvas.tsx    # React mount/unmount wrapper
│           ├── three-app.ts       # renderer, scene, camera, loop
│           ├── camera.ts          # orthographic iso setup
│           ├── lighting.ts        # 3-point voxel lighting
│           ├── ground.ts          # the iso "plane" (floor)
│           ├── asset-loader.ts    # OBJ/MTL loading + caching
│           ├── base.ts            # Project visual (voxel building)
│           ├── worker.ts          # Worker visual + state-mesh swapping
│           ├── mineral-patch.ts
│           └── selection.ts       # raycaster click handling
└── SPEC.md
```

The dashboard is a single Vite-built SPA. Coordinator can serve it on the same port, or `vite dev` runs separately during development.

---

## 5. Domain model (canonical)

### 5.1 Events

```typescript
type WorkerSource = 'claude-code' | 'sdk-script';
type WorkerActivity = 'idle' | 'thinking' | 'tool_use' | 'streaming';

interface Base { t: number; eventId: string; }

type DashboardEvent =
  | (Base & { kind: 'project.upserted';
              project: { id: string; name: string; cwd?: string; color?: string } })
  | (Base & { kind: 'worker.spawned';
              projectId: string; workerId: string; source: WorkerSource;
              pid?: number; hostname?: string; label?: string })
  | (Base & { kind: 'worker.activity';
              workerId: string; activity: WorkerActivity; detail?: string })
  | (Base & { kind: 'tokens.consumed';
              workerId: string; model: string;
              inputTokens: number; outputTokens: number;
              cacheReadTokens?: number; cacheWriteTokens?: number;
              usd: number })
  | (Base & { kind: 'task.completed';
              workerId: string; taskName?: string })
  | (Base & { kind: 'worker.errored';
              workerId: string; message: string; recoverable: boolean })
  | (Base & { kind: 'worker.despawned';
              workerId: string; reason: 'completed' | 'killed' | 'crashed' });
```

### 5.2 World state

```typescript
interface Project { id; name; cwd?; color?; createdAt; }
interface Worker  { id; projectId; source; pid?; hostname?; label?;
                    spawnedAt; lastEventAt; alive; activity;
                    inputTokens; outputTokens;
                    cacheReadTokens; cacheWriteTokens; usd;
                    tasksCompleted; errorCount; lastError?; }
interface Totals  { inputTokens; outputTokens; usd; tasksCompleted;
                    workersAlive; workersTotal; }
interface WorldState { projects; workers; totals; revision; }
```

`revision` is a monotonic counter — cheap "did anything change?" check for the renderer.

### 5.3 Reducer

Pure `(state, event) → state`. Idempotent. No IO. Lives in `core/reduce.ts`.

### 5.4 Commands

```typescript
interface CommandBase { commandId: string; }
type DashboardCommand =
  | (CommandBase & { kind: 'worker.kill'; workerId: string });
```

**Kill semantics:** SIGTERM → 5s grace → SIGKILL. Localhost only. Shared-PID workers terminate together (caveat documented).

---

## 6. Wire protocol

```typescript
type ServerMessage =
  | { type: 'snapshot'; state: WorldState; serverTime: number }
  | { type: 'event'; event: DashboardEvent }
  | { type: 'command_result'; commandId: string; ok: boolean; error?: string };

type ClientMessage =
  | { type: 'command'; command: DashboardCommand };
```

`POST /events` accepts a single event or array. `GET /healthz` returns `200 ok`. WS at `ws://localhost:<port>/stream`. Persistence: `~/.orchestrator-dashboard/events.jsonl`, replay on coordinator startup, 100MB rotation.

---

## 7. Components

### 7.1 `core/`

Pure TypeScript, zero deps. The world is now genuinely 3D, so `world.ts` exposes:

```typescript
// World coordinate system: X right, Y up, Z forward.
// Iso "look" comes from camera angle, not coordinate transformation.
export interface WorldVec3 { x: number; y: number; z: number; }

export const ISO_CAMERA_ANGLE = {
  // Classic RTS iso: camera looks down/forward at ~30° elevation,
  // 45° rotation around Y.
  azimuth: Math.PI / 4,    // 45°
  elevation: Math.PI / 6,  // 30°
};

// Helper: place N entities deterministically by id hash on the ground plane.
export function placeOnGround(id: string, count: number): WorldVec3 { ... }
```

The dashboard imports these; the coordinator does not.

### 7.2 `coordinator/`

Single Node process (Fastify + `ws`). Maintains in-memory `WorldState`, JSONL log, PID registry, kill executor. Localhost-only for MVP.

### 7.3 `ingest-claude-code/`

Hook scripts referenced from `~/.claude/settings.json` or per-project `.claude/settings.json`.

- `on-session-start` → `project.upserted` + `worker.spawned` (with `pid: getppid()`).
- `on-pretooluse` → `worker.activity` (`tool_use`, tool name in `detail`).
- `on-posttooluse` → `worker.activity` (`thinking`).
- `on-stop` → reads `transcript_path`, aggregates token usage from all assistant messages, computes USD via `core/pricing.ts`, emits one `tokens.consumed` then `worker.despawned`.

UX caveat: dashboard shows `0 tokens` for Claude Code workers until session ends.

### 7.4 `ingest-sdk/`

`instrumentedAnthropic({ projectId, workerId, ... })` wrapper around `@anthropic-ai/sdk`.

- Emits `worker.spawned` with `pid: process.pid`, `hostname: os.hostname()`.
- Emits `worker.activity` and `tokens.consumed` per `messages.create()` call.
- SIGTERM handler emits `worker.despawned { reason: 'killed' }` and exits within 4s.
- `process.exit` without prior SIGTERM → `worker.despawned { reason: 'completed' }`.

### 7.5 `dashboard/`

React SPA with two cooperating layers.

**Arwes HUD layer (DOM):**

- `<TopBar>` — totals, server connection badge. Built from `<Animator>`, `<FrameSVGOctagon>` / `<FrameSVGCorners>`, `<Text>`.
- `<ErrorToasts>` — bottom-right queue, slides via `<Animator>`, click to dismiss, plays `error` bleep.
- `<WorkerPopover>` — opens when a worker is clicked in the canvas. Positioned via 3D-to-screen projection (Three's `vector.project(camera)` → CSS pixels). Shows label, activity, tokens, USD, **Kill** button.
- `<KillConfirm>` — Arwes-styled confirmation. `Shift+click` skips. `Delete` key kills selected worker.

**Three.js scene layer (canvas):**

- `<ThreeCanvas>` — thin React component. Mounts a Three.js `WebGLRenderer` to a ref'd `<div>` in `useEffect`, runs the render loop, tears down on unmount.
- **Camera:** `OrthographicCamera`. View frustum sized so visible world ≈ `[-10, 10]` on each axis at default zoom. Positioned at iso angle (azimuth π/4, elevation π/6), looking at origin. No user controls in MVP.
- **Lighting:** classic 3-point voxel lighting — a key directional light for the dominant face shading, a fill light at lower intensity for shadow softening, a low rim/ambient. Calibrate so MagicaVoxel's bright palette reads cleanly without blowing out.
- **Ground:** large flat plane at `y=0`. Material: subtle grid texture or solid theme color. Receives shadows.
- **Layers as `THREE.Group`:** `groundGroup`, `structuresGroup`, `unitsGroup`, `fxGroup`. All children share the same scene; groups are organizational. Render order is depth-buffer-driven, no manual z-sorting needed (Three.js handles it).
- **Asset loader:** loads `.obj` + `.mtl` + texture PNG from `public/assets/`. Caches loaded geometry and materials so each worker shares one instanced mesh per state. Build a `Map<assetId, { idle, walkA, walkB, work }>` of per-state meshes.
- **Worker visual (`worker.ts`):**
  - Each Worker has a `THREE.Group` containing exactly one currently-visible mesh (the active state mesh).
  - Position is a 3D world coord, tweened linearly between `(base.position)` and `(patch.position)`.
  - Y-axis rotation tracks movement direction (atan2 of velocity).
  - State machine selects which mesh to show:

| Worker state                  | Mesh swap |
|-------------------------------|-----------|
| moving (target ≠ position)    | alternate `walk-A` ↔ `walk-B` every ~250ms |
| `activity: 'idle'` (still)    | `idle` |
| `activity: 'thinking'`        | `idle` |
| `activity: 'tool_use'`        | `work` |
| `activity: 'streaming'`       | `work` |
| `alive: false`                | (group fades out via opacity over 5min) |

  - The "alternation" is what creates the illusion of motion — two slightly-different walk poses cycling at 4Hz reads as walking even with zero rigging.

- **Selection:** `THREE.Raycaster` from camera through mouse position. Hit nearest worker mesh. Emit `select(workerId)` to the store. Selection ring drawn as a `THREE.RingGeometry` placed at the worker's feet, color-pulsed via theme primary.

**Shared store:**

- Zustand. Holds `WorldState`, `selection`, `connectionStatus`, `errorToastQueue`.
- Reducer is the pure function from `core/`. Transport calls `store.applyEvent(event)`.
- React HUD subscribes via Zustand selectors. Three scene reads via `store.getState()` each frame — no React rerender pressure.

**Arwes providers (mounted at `<App>`):**

```tsx
<AnimatorGeneralProvider duration={{ enter: 0.2, exit: 0.2 }}>
  <BleepsProvider bleeps={bleeps}>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </BleepsProvider>
</AnimatorGeneralProvider>
```

**Theming:** `dashboard/src/arwes/theme.ts` is the single source of truth. Exports raw color tokens (primary, secondary, text, error). Both Arwes (via theme prop) and Three (selection rings, error flashes, ground tint) import from it.

**Bleeps (sound):** muted by default in MVP, user can unmute via a HUD toggle. Mappings:
- `intro` — plays once on connection
- `click` — UI button presses
- `error` — `worker.errored` events
- `kill` — successful kill confirmation

---

## 8. MVP scope (Milestone 1)

**Definition of done:**

1. Coordinator runs locally, accepts events, persists JSONL, serves bidirectional WS, executes kill commands.
2. Both adapters work (Claude Code + SDK).
3. Dashboard:
   - React shell with Arwes providers and theme loaded.
   - Arwes-styled top bar with live totals (USD, tokens, workers).
   - Three.js canvas mounted, rendering iso scene.
   - 1+ base (voxel building) on the ground plane with project name visible.
   - 1+ animated worker (voxel character) per base. State swaps idle ↔ walk-A/walk-B ↔ work correctly. Y-rotation tracks movement.
   - Click worker → Arwes popover anchored at worker's screen position → Kill button → confirm → process dies → worker despawns and fades over 5min.
   - Errors appear as Arwes-animated toasts.
   - Bleeps wired but muted; toggle unmutes.
4. Restarting dashboard rebuilds state from snapshot.
5. Restarting coordinator rebuilds state and PID registry from JSONL.

**Out of MVP:** mineral-haul VFX, multiple patches per base, base placement UI, build queues, tech tree, "enemy" mechanics, live Claude Code token tracking, subprocess cancellation, camera controls, minimap, character variety beyond one worker model.

---

## 9. Roadmap (post-MVP, unordered)

- **Live Claude Code token tracking** via PostToolUse-delta transcript reads.
- **Subprocess-level cancellation** for multi-agent-in-one-process scripts.
- **Buildings / agent specialization** with distinct voxel models.
- **Production queues** as build-progress bars.
- **Tech tree / model upgrades** as base "tech level" model swaps.
- **Enemy attacks** — rate-limit raids, cost overrun alarms, with voxel "raider" units.
- **Fog of war** — collapse inactive projects.
- **Replay mode** — scrub through JSONL.
- **More commands** — `worker.pause`, `task.retry`, `project.archive`.
- **Camera controls** — pan, zoom, optional rotate to other iso angles.
- **Multi-machine** — non-loopback bind, bearer auth, remote kill agents.
- **Pricing fetch** — auto-update model→cost table.
- **Minimap.**
- **Mineral-haul animation** — workers carry visible voxel "minerals" between patch and base.
- **Bone animation** — if a Blender pipeline gets added later, swap per-state meshes for skinned meshes with proper walk cycles.

---

## 10. Implementation defaults (formerly open questions)

These are documented as defaults rather than questions. Revisit during implementation if pain demands.

- **Project identity:** explicit `ORCHESTRATOR_PROJECT_ID` env var → fallback to `basename($PWD)` → optional `.orchestrator.json` for `name`/`color`.
- **Multi-machine:** localhost-only. Migration path noted in roadmap.
- **Map layout:** deterministic placement keyed by `projectId` hash. User-draggable in v2.
- **Cost calculation:** hardcoded TS table in `core/pricing.ts` with `LAST_UPDATED` comment.
- **Coordinator lifecycle:** `pnpm coordinator` script. `launchd`/`systemd --user` recipes documented later.
- **Idle worker visual lifetime:** greyed via reduced material opacity for 5 minutes after despawn, then group removed from scene; underlying state retained for totals.
- **Kill confirm UX:** popover confirmation; `Shift+click` skips; `Delete` key kills selected worker.
- **JSONL rotation:** 100MB rotate, keep 7 archives.

---

## 11. Out of scope

- Specific voxel art (you provide).
- Build/deploy pipeline beyond Vite scaffold.
- Test coverage targets.
- Performance budgets.
- Accessibility.

---

## 12. Asset specification

See `ASSETS.md` for the artist-facing version. Summary: 4 worker poses (`idle`, `walk-A`, `walk-B`, `work`) + 1 base + 1 mineral patch + 4 UI SVGs, all exported as `.obj`/`.mtl`/`.png` from MagicaVoxel.

---

## 13. Stack & build

**Languages:** TypeScript (strict), Node.js 20+, React 18.

**Core libs:**
- `three` — 3D renderer.
- `three`'s built-in `OBJLoader` and `MTLLoader` (in `three/examples/jsm/loaders/`).
- `@arwes/react` (alpha, pinned exact version) + Arwes peer deps.
- `zustand` — store.
- `fastify` + `ws` — coordinator.
- `@anthropic-ai/sdk` — peer dep of `ingest-sdk`.

**Build:**
- **Vite** for dashboard SPA.
- **tsx** or **tsup** for coordinator and ingest scripts.
- **pnpm workspaces** to share `core/` across packages.

**Suggested scripts:**
- `pnpm dev:coordinator` — coordinator with file-watch.
- `pnpm dev:dashboard` — Vite dev server.
- `pnpm dev` — both in parallel via `concurrently`.
- `pnpm build` — production build of all packages.

---

## 14. Risk register

**R1 — Arwes alpha API instability.** Pinned to `v1.0.0-alpha.23`. *Mitigation:* Arwes usage isolated to `dashboard/src/arwes/` and `dashboard/src/hud/`. Core, store, scene Arwes-free.

**R2 — Sparse Arwes release cadence.** Last public alpha tag Aug 2023; `next` branch sees more activity. *Mitigation:* fall back to `next` if blockers hit; ultimate fallback is reimplementing the chrome with plain CSS.

**R3 — Three.js voxel performance.** 3D rendering is heavier than 2D sprite rendering. For dozens of workers at iso angle this is not a concern; for hundreds it might be. *Mitigation:* shared geometry/materials per state via the asset loader (instancing-friendly). Optimize only if profiling shows pain.

**R4 — Animation ceiling without Blender.** MagicaVoxel-only means per-state mesh swapping, not skeletal animation. The 4-pose alternation reads as motion but won't be charming. *Mitigation:* documented as expected look; Blender pipeline on roadmap if a smoother feel is wanted later.

**R5 — Theme/palette coordination.** Arwes themes drive HUD; Three scene needs same palette for selection rings, error flashes, ground tint. *Mitigation:* `dashboard/src/arwes/theme.ts` is single source of truth, exports raw tokens both layers consume.

**R6 — `.obj` material fidelity from MagicaVoxel.** MagicaVoxel `.obj` export bakes the palette to a 256×1 PNG via `.mtl`. Most material features (emissive, roughness) don't survive. *Mitigation:* compose lighting carefully in Three (R3-style 3-point setup) so flat materials still read well. Emissive effects (e.g., glowing worker eyes) become Three-side post-processing or attached lights, not material properties.

---

## Appendix A — Pricing table (current, dated)

This is the canonical source for `core/pricing.ts`. Verified from Anthropic's pricing documentation and corroborated by current third-party trackers (April 2026).

```typescript
// core/pricing.ts
//
// LAST_UPDATED: 2026-04-28
// Source: https://platform.claude.com/docs/en/about-claude/pricing
//
// All values: USD per 1,000,000 tokens.
// Cache reads: 10% of base input rate (90% discount).
// Cache writes: 125% of base input rate (5-min TTL) — confirm at update time.
//
// All current-generation models maintain a 5x output:input ratio.

export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens (cache read). */
  cacheRead: number;
  /** USD per 1M cache-write tokens. */
  cacheWrite: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // Current generation
  'claude-opus-4-7':            { input: 5,    output: 25,   cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-6':            { input: 5,    output: 25,   cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-sonnet-4-6':          { input: 3,    output: 15,   cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-5':          { input: 3,    output: 15,   cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5':           { input: 1,    output: 5,    cacheRead: 0.10, cacheWrite: 1.25 },

  // Legacy (still callable)
  'claude-opus-4-1':            { input: 15,   output: 75,   cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-3-5':           { input: 0.80, output: 4,    cacheRead: 0.08, cacheWrite: 1.00 },
  // claude-haiku-3 retired 2026-04-19; do not include for new work.
};

/**
 * Compute USD cost for a single API response's usage block.
 * Unknown models default to Sonnet pricing and log a warning.
 */
export function computeCost(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }
): number {
  // Strip date suffix if present, e.g. "claude-haiku-4-5-20251001" → "claude-haiku-4-5".
  const stripped = model.replace(/-\d{8}$/, '');
  const p = PRICING[stripped] ?? PRICING['claude-sonnet-4-6'];

  const inTok    = usage.input_tokens             ?? 0;
  const outTok   = usage.output_tokens            ?? 0;
  const cacheW   = usage.cache_creation_input_tokens ?? 0;
  const cacheR   = usage.cache_read_input_tokens     ?? 0;

  return (
    (inTok  * p.input      / 1_000_000) +
    (outTok * p.output     / 1_000_000) +
    (cacheW * p.cacheWrite / 1_000_000) +
    (cacheR * p.cacheRead  / 1_000_000)
  );
}
```

**Rules of the road for the implementer:**

1. Do not use 1-hour TTL cache pricing in MVP. Default to 5-minute TTL writes only (the figures above).
2. Long-context surcharges (>200K tokens on Opus 4.7 / 4.6 / Sonnet 4.6) are flat-rate, no surcharge — already reflected.
3. The `inference_geo: us` 1.1× multiplier is **not** applied. Document this as a known v2 enhancement.
4. Fast Mode (6× premium on Opus 4.6) is research-preview only and excluded.
5. `cache_creation_input_tokens` from the SDK is the cache-write count. `cache_read_input_tokens` is the cache-hit count. Don't confuse them.

---

## Appendix B — Claude Code transcript format (parsing reference)

`on-stop.ts` reads the file at `transcript_path` (provided by Claude Code on stdin via the Stop hook payload) and aggregates token usage to emit a single `tokens.consumed` event before `worker.despawned`.

### Hook input (Stop event, on stdin)

```json
{
  "session_id": "eb5b0174-0555-4601-804e-672d68069c89",
  "transcript_path": "/Users/me/.claude/projects/-Users-me-projects-foo/eb5b0174-0555-4601-804e-672d68069c89.jsonl",
  "cwd": "/Users/me/projects/foo",
  "hook_event_name": "Stop",
  "stop_hook_active": false
}
```

### Transcript file structure

JSONL — one JSON object per line. Order is roughly chronological. Multiple line types appear; the implementer should iterate by line, parse each as JSON, and **dispatch on the `type` field**.

**Line types observed in the wild:**

- `summary` — sometimes appears as the first line. Has `{ type, summary, leafUuid }`. Skip for token aggregation.
- `user` — user turn. Has `{ type, message: { role: "user", content: ... }, ... }`. Skip for token aggregation.
- `assistant` — assistant turn. **This is where token usage lives.** Shape:
  ```json
  {
    "type": "assistant",
    "message": {
      "id": "msg_01...",
      "role": "assistant",
      "model": "claude-sonnet-4-5-20250929",
      "content": [ /* content blocks */ ],
      "stop_reason": "...",
      "usage": {
        "input_tokens": 1234,
        "output_tokens": 567,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 8901
      }
    },
    "uuid": "...",
    "timestamp": "..."
  }
  ```
- Other types (`tool_use`, `tool_result`, system messages) may appear in some Claude Code versions. **Tolerate unknown types by ignoring them.** Never fail the whole parse on an unknown line.

### Aggregation algorithm for `on-stop.ts`

```typescript
interface UsageTotals {
  model: string | null;          // last assistant model seen
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

async function aggregate(transcriptPath: string): Promise<UsageTotals> {
  const totals: UsageTotals = {
    model: null, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0,
  };

  const stream = readline.createInterface({
    input: fs.createReadStream(transcriptPath),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    if (!line.trim()) continue;
    let obj: any;
    try { obj = JSON.parse(line); }
    catch { continue; }                      // skip malformed lines

    if (obj?.type !== 'assistant') continue;
    const u = obj.message?.usage;
    if (!u) continue;

    totals.model = obj.message?.model ?? totals.model;
    totals.inputTokens     += u.input_tokens ?? 0;
    totals.outputTokens    += u.output_tokens ?? 0;
    totals.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    totals.cacheWriteTokens+= u.cache_creation_input_tokens ?? 0;
  }

  return totals;
}
```

The result is fed into `computeCost` from Appendix A and emitted as one `tokens.consumed` event.

### Caveats

1. **Resumed sessions append to the same transcript.** A Stop hook on a resumed session aggregates the *entire* transcript, so the dashboard would double-count if we naively re-emit. *Mitigation:* track a high-water mark per `session_id` (in `~/.orchestrator-dashboard/transcript-marks.json`) of bytes already parsed; on next Stop, parse from that offset. MVP can skip this if you commit to "one session per claude invocation" — flag in README.
2. **Mid-compaction transcripts** (PreCompact event) may truncate. Stop fires after compact completes; the aggregated count is still accurate post-compact, but bytes parsed change. The high-water mark approach above breaks across compactions. *Mitigation:* on each Stop, recompute from the start and emit a *correction* event (`tokens.consumed` with a delta from previously-emitted). For MVP, accept potential over-count and document it.
3. **Per-turn model changes.** Claude Code may switch models mid-session (e.g., user runs `/model`). Aggregation collapses everything into the last-seen model, which is wrong for cost calculation. *Mitigation:* aggregate per-model:

   ```typescript
   const byModel: Record<string, UsageTotals> = {};
   // ... per assistant line, accumulate into byModel[obj.message.model]
   // Then emit one tokens.consumed per model.
   ```
   Recommended for MVP — it's only a few extra lines.

---

## Appendix C — Runtime constants

The implementer should encode these in a single `core/config.ts` so they're discoverable.

```typescript
// core/config.ts

/** TCP port the coordinator listens on (HTTP + WS). Override via env. */
export const COORDINATOR_PORT = Number(process.env.RTC_PORT ?? 7777);

/** Coordinator host. Localhost only for MVP. */
export const COORDINATOR_HOST = process.env.RTC_HOST ?? '127.0.0.1';

/** Convenience URLs. */
export const COORDINATOR_HTTP = `http://${COORDINATOR_HOST}:${COORDINATOR_PORT}`;
export const COORDINATOR_WS   = `ws://${COORDINATOR_HOST}:${COORDINATOR_PORT}/stream`;

/** Where the JSONL event log and supporting state live. */
export const STATE_DIR        = process.env.RTC_STATE_DIR
                              ?? path.join(os.homedir(), '.orchestrator-dashboard');
export const EVENTS_JSONL     = path.join(STATE_DIR, 'events.jsonl');
export const TRANSCRIPT_MARKS = path.join(STATE_DIR, 'transcript-marks.json');

/** JSONL rotation. */
export const JSONL_MAX_BYTES   = 100 * 1024 * 1024;  // 100 MB
export const JSONL_MAX_BACKUPS = 7;

/** Kill timing. */
export const KILL_GRACE_MS = 5_000;  // SIGTERM → SIGKILL

/** Worker visual lifetime after despawn. */
export const WORKER_FADE_MS = 5 * 60 * 1000;  // 5 min greyed before removal

/** Project identity resolution. */
export const PROJECT_ID_ENV = 'ORCHESTRATOR_PROJECT_ID';
export const PROJECT_CONFIG_FILE = '.orchestrator.json';  // optional, in cwd
```

### Env vars the implementer should respect

| Variable | Purpose | Default |
|---|---|---|
| `RTC_PORT` | Coordinator TCP port | `7777` |
| `RTC_HOST` | Coordinator bind address | `127.0.0.1` |
| `RTC_STATE_DIR` | Where JSONL and marks live | `~/.orchestrator-dashboard` |
| `ORCHESTRATOR_PROJECT_ID` | Explicit project id (else `basename($PWD)`) | unset |

### Optional `.orchestrator.json` (per-project, in cwd)

```json
{
  "name": "my-cool-project",
  "color": "#7e57c2"
}
```

If absent, project name = `basename($PWD)` and color = deterministic hash of `projectId`.

### Coordinator startup behavior

1. Ensure `STATE_DIR` exists.
2. If `EVENTS_JSONL` exists, replay it through `reduce()` to rebuild `WorldState` and PID registry.
3. Open the file in append mode for new events.
4. Bind HTTP + WS on `COORDINATOR_HOST:COORDINATOR_PORT`.
5. Begin accepting connections.

### Dashboard startup behavior

1. Connect to `COORDINATOR_WS`.
2. On open, server sends `{ type: 'snapshot', state, serverTime }`.
3. Apply snapshot to local store (replace, don't merge).
4. Subscribe to subsequent `event` and `command_result` messages.
5. On disconnect, retry with exponential backoff (1s, 2s, 4s, capped at 30s). Show a "reconnecting" badge until reconnected; on reconnect, the next snapshot replaces local state again — no special diff logic needed.

---

## Appendix D — Test harness

### D.0 Two distinct concerns

| Concern | Tool | Audience | Lifetime |
|---|---|---|---|
| **Scenario simulation** | `simulate/` package, custom CLI | Humans watching the dashboard | Runs forever, paced for visual demo |
| **E2E correctness tests** | Playwright + Vitest | CI | Runs in seconds, asserts on outcomes |

Both share the same event-emitting primitives (a `simulator-core` library) so a scenario can be reused as a Playwright fixture.

### D.1 New repo additions

```
.
├── simulate/                         # scenario runner CLI (visible demo)
│   ├── src/
│   │   ├── index.ts                  # CLI entry: `pnpm simulate llminerals`
│   │   ├── simulator-core.ts         # event emission primitives (shared)
│   │   ├── transport.ts              # POSTs to coordinator, or feeds fake-coordinator in-process
│   │   └── scenarios/
│   │       ├── llminerals.ts         # the 5-worker demo described below
│   │       ├── error-storm.ts        # rapid worker.errored events
│   │       ├── kill-flow.ts          # spawns then waits for kill commands
│   │       └── happy-path.ts         # 1 project, 1 worker, completes cleanly
│   └── package.json
├── coordinator/
│   └── src/
│       └── fake.ts                   # in-process FakeCoordinator: same API, no socket
└── dashboard/
    └── e2e/                          # Playwright tests
        ├── playwright.config.ts
        ├── fixtures/
        │   └── coordinator-fixture.ts # spawns FakeCoordinator + Vite preview
        ├── llminerals.spec.ts
        ├── kill-flow.spec.ts
        ├── error-toast.spec.ts
        └── reconnect.spec.ts
```

### D.2 `simulator-core` — shared event emission primitives

Lives in `simulate/src/simulator-core.ts`. Used by both the scenario CLI and Playwright fixtures. Pure event generation — knows nothing about HTTP or sockets.

```typescript
// simulate/src/simulator-core.ts
import type { DashboardEvent } from '@rtc/core';

export type EventSink = (e: DashboardEvent) => void | Promise<void>;

export interface SimContext {
  sink: EventSink;
  now: () => number;          // injectable clock for deterministic tests
  uuid: () => string;         // injectable uuid for deterministic tests
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function makeContext(sink: EventSink, opts?: {
  fixedTime?: number; uuidSeed?: number;
}): SimContext {
  let t = opts?.fixedTime ?? Date.now();
  let u = opts?.uuidSeed ?? 0;
  return {
    sink,
    now: () => (opts?.fixedTime !== undefined ? t++ : Date.now()),
    uuid: opts?.uuidSeed !== undefined
      ? () => `det-${u++}`
      : () => crypto.randomUUID(),
  };
}

// --- Event helpers (each emits exactly one event) ---

export const upsertProject = (ctx: SimContext, p: { id: string; name: string; color?: string }) =>
  ctx.sink({
    kind: 'project.upserted',
    t: ctx.now(), eventId: ctx.uuid(),
    project: p,
  });

export const spawnWorker = (
  ctx: SimContext,
  args: { projectId: string; workerId: string; label?: string; pid?: number }
) => ctx.sink({
  kind: 'worker.spawned',
  t: ctx.now(), eventId: ctx.uuid(),
  source: 'sdk-script',
  hostname: 'simulator',
  ...args,
});

export const setActivity = (
  ctx: SimContext,
  workerId: string,
  activity: 'idle' | 'thinking' | 'tool_use' | 'streaming',
  detail?: string,
) => ctx.sink({
  kind: 'worker.activity',
  t: ctx.now(), eventId: ctx.uuid(),
  workerId, activity, detail,
});

export const consumeTokens = (
  ctx: SimContext,
  args: {
    workerId: string; model?: string;
    inputTokens: number; outputTokens: number;
    cacheReadTokens?: number; cacheWriteTokens?: number;
    usd: number;
  }
) => ctx.sink({
  kind: 'tokens.consumed',
  t: ctx.now(), eventId: ctx.uuid(),
  model: 'claude-sonnet-4-6',
  ...args,
});

export const completeTask = (ctx: SimContext, workerId: string, taskName?: string) =>
  ctx.sink({
    kind: 'task.completed',
    t: ctx.now(), eventId: ctx.uuid(),
    workerId, taskName,
  });

export const errorWorker = (
  ctx: SimContext,
  args: { workerId: string; message: string; recoverable?: boolean }
) => ctx.sink({
  kind: 'worker.errored',
  t: ctx.now(), eventId: ctx.uuid(),
  recoverable: args.recoverable ?? true,
  ...args,
});

export const despawnWorker = (
  ctx: SimContext,
  args: { workerId: string; reason?: 'completed' | 'killed' | 'crashed' }
) => ctx.sink({
  kind: 'worker.despawned',
  t: ctx.now(), eventId: ctx.uuid(),
  reason: args.reason ?? 'completed',
  ...args,
});

// --- Higher-level patterns ---

/**
 * One full "harvest run" for a worker: thinking → tool_use → tokens → task completed.
 * Paced for visual readability.
 */
export async function harvestOnce(ctx: SimContext, workerId: string, opts?: {
  thinkMs?: number; workMs?: number; tokens?: number;
}) {
  const thinkMs = opts?.thinkMs ?? 800;
  const workMs  = opts?.workMs  ?? 1200;
  const out     = opts?.tokens  ?? 250;

  await setActivity(ctx, workerId, 'thinking');
  await sleep(thinkMs);

  await setActivity(ctx, workerId, 'tool_use', 'harvest_minerals');
  await sleep(workMs);

  await consumeTokens(ctx, {
    workerId,
    inputTokens: out * 4,
    outputTokens: out,
    usd: (out * 4 * 3 + out * 15) / 1_000_000,   // sonnet-4.6 pricing
  });
  await completeTask(ctx, workerId, 'harvest');
  await setActivity(ctx, workerId, 'idle');
}
```

### D.3 The Llminerals demo scenario

The flagship visible scenario. **One project, five workers, harvesting on overlapping cycles.** Designed to look alive and chaotic without being random — every worker pulse is deterministic given the seed.

```typescript
// simulate/src/scenarios/llminerals.ts
import { makeContext, upsertProject, spawnWorker, harvestOnce, errorWorker, despawnWorker } from '../simulator-core';
import type { EventSink } from '../simulator-core';

export interface LlmineralsOpts {
  /** Emit events to this sink (HTTP poster, fake coordinator, etc). */
  sink: EventSink;
  /** Stop after this many minutes. Default: run forever. */
  durationMin?: number;
  /** Add a deterministic UUID seed for tests. */
  uuidSeed?: number;
  /** Add a fixed start time for tests. */
  fixedTime?: number;
}

export async function runLlminerals(opts: LlmineralsOpts): Promise<void> {
  const ctx = makeContext(opts.sink, {
    fixedTime: opts.fixedTime,
    uuidSeed:  opts.uuidSeed,
  });
  const projectId = 'demo-llminerals';

  await upsertProject(ctx, {
    id: projectId,
    name: 'Llminerals Outpost',
    color: '#7e57c2',
  });

  // 5 workers with distinct labels and different paces.
  const workers = [
    { id: 'w-alpha',   label: 'Alpha',   thinkMs: 600,  workMs: 1200, tokens: 320, errorEvery: 0  },
    { id: 'w-bravo',   label: 'Bravo',   thinkMs: 800,  workMs:  900, tokens: 180, errorEvery: 0  },
    { id: 'w-charlie', label: 'Charlie', thinkMs: 1100, workMs: 1400, tokens: 410, errorEvery: 7  },
    { id: 'w-delta',   label: 'Delta',   thinkMs: 500,  workMs:  700, tokens: 120, errorEvery: 0  },
    { id: 'w-echo',    label: 'Echo',    thinkMs: 1300, workMs: 1800, tokens: 600, errorEvery: 13 },
  ];

  // Spawn all five.
  for (const [i, w] of workers.entries()) {
    await spawnWorker(ctx, {
      projectId, workerId: w.id, label: w.label,
      pid: 90000 + i,            // synthetic pids for kill testing
    });
  }

  // Stagger initial start so their cycles aren't lockstep.
  const staggers = [0, 200, 400, 600, 800];

  const stopAt = opts.durationMin
    ? ctx.now() + opts.durationMin * 60_000
    : Number.POSITIVE_INFINITY;

  // Each worker runs its own harvest loop concurrently.
  await Promise.all(workers.map(async (w, i) => {
    await new Promise(r => setTimeout(r, staggers[i]));

    let runs = 0;
    while (ctx.now() < stopAt) {
      runs++;

      // Occasional non-fatal error.
      if (w.errorEvery && runs % w.errorEvery === 0) {
        await errorWorker(ctx, {
          workerId: w.id,
          message: `Rate limit while harvesting (run #${runs})`,
          recoverable: true,
        });
      }

      await harvestOnce(ctx, w.id, {
        thinkMs: w.thinkMs,
        workMs:  w.workMs,
        tokens:  w.tokens,
      });
    }

    await despawnWorker(ctx, { workerId: w.id, reason: 'completed' });
  }));
}
```

### D.4 Two ways to run a scenario

The `sink` abstraction lets the same scenario drive either a real coordinator or an in-process fake:

```typescript
// simulate/src/transport.ts

import { COORDINATOR_HTTP } from '@rtc/core/config';

/** POST events to a running coordinator. Used by the CLI. */
export const httpSink = (url = COORDINATOR_HTTP) => async (e: DashboardEvent) => {
  await fetch(`${url}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(e),
  });
};

/** Drive an in-process FakeCoordinator. Used by Playwright fixtures. */
export const fakeSink = (fake: FakeCoordinator) => (e: DashboardEvent) => {
  fake.ingest(e);  // synchronous, broadcasts to fake's WS clients
};
```

### D.5 The CLI

```
$ pnpm simulate --help

Usage: simulate <scenario> [options]

Scenarios:
  llminerals     5-worker harvest demo (default)
  error-storm    Rapid recoverable errors
  kill-flow      Spawn workers and wait for kills
  happy-path     Single completed worker

Options:
  --duration <min>     Stop after N minutes (default: forever)
  --target <url>       Coordinator URL (default: http://127.0.0.1:7777)
  --speed <n>          Time multiplier (default: 1.0; 2.0 = twice as fast)
  --seed <n>           Deterministic UUID seed (testing)
```

```typescript
// simulate/src/index.ts
import { runLlminerals } from './scenarios/llminerals';
import { httpSink } from './transport';

const args = parseArgs(process.argv);
const scenario = args.positional[0] ?? 'llminerals';
const sink = httpSink(args.target);

switch (scenario) {
  case 'llminerals':  await runLlminerals({ sink, durationMin: args.duration }); break;
  case 'error-storm': /* ... */ break;
  case 'kill-flow':   /* ... */ break;
  case 'happy-path':  /* ... */ break;
  default: console.error(`unknown scenario: ${scenario}`); process.exit(1);
}
```

Typical workflow:

```sh
# Terminal 1: coordinator
pnpm dev:coordinator

# Terminal 2: dashboard
pnpm dev:dashboard

# Terminal 3: drive the demo
pnpm simulate llminerals
```

### D.6 FakeCoordinator (for hermetic tests)

A real-coordinator-shaped object with no socket, no HTTP, no JSONL. Lives in `coordinator/src/fake.ts`. Used by Playwright fixtures and unit tests.

```typescript
// coordinator/src/fake.ts
import type { DashboardEvent, WorldState } from '@rtc/core';
import { reduce, initialWorldState } from '@rtc/core';

export class FakeCoordinator {
  private state: WorldState = initialWorldState();
  private listeners = new Set<(msg: any) => void>();

  ingest(e: DashboardEvent) {
    this.state = reduce(this.state, e);
    for (const l of this.listeners) l({ type: 'event', event: e });
  }

  /** Mimic the WS subscribe API the dashboard expects. */
  subscribe(onMessage: (msg: any) => void) {
    this.listeners.add(onMessage);
    onMessage({ type: 'snapshot', state: this.state, serverTime: Date.now() });
    return () => this.listeners.delete(onMessage);
  }

  /** Inspect for assertions. */
  get currentState() { return this.state; }
}
```

The dashboard's `transport.ts` is structured so `connectToCoordinator(url)` can be replaced in tests with `connectToFake(fakeCoordinator)`. Both produce a `Subscription` of the same shape.

### D.7 Playwright setup

```
dashboard/e2e/playwright.config.ts
```

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm vite preview --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

### D.8 Coordinator fixture

The fixture is the bridge between Playwright and the simulator. **Two flavors** depending on what's being tested:

**Flavor 1 — `realCoordinator` fixture.** Spawns a real coordinator process on a free port, dashboard connects to it. Use this for tests that need to verify the kill-process flow end-to-end.

**Flavor 2 — `fakeCoordinator` fixture.** Injects a FakeCoordinator into the dashboard via a known global hook (e.g., `window.__rtcConnect = (url) => makeFakeConnection(fake)`). Faster, deterministic, no port juggling. Use this for everything except kill tests.

```typescript
// dashboard/e2e/fixtures/coordinator-fixture.ts
import { test as base } from '@playwright/test';
import { FakeCoordinator } from '@rtc/coordinator/fake';

type Fixtures = { fake: FakeCoordinator };

export const test = base.extend<Fixtures>({
  fake: async ({ page }, use) => {
    const fake = new FakeCoordinator();

    // Inject a hook before any app code runs.
    await page.addInitScript(() => {
      (window as any).__RTC_TEST_MODE = true;
    });

    // Expose the fake's ingest function to the page.
    await page.exposeFunction('__rtcIngest', (e: any) => fake.ingest(e));
    await page.exposeBinding('__rtcSubscribe', async ({ page }, cb) => {
      return fake.subscribe(cb);
    });

    await use(fake);
  },
});

export { expect } from '@playwright/test';
```

For this to work, the dashboard's `transport.ts` checks `window.__RTC_TEST_MODE` and, if set, routes `connectToCoordinator` to a thin shim that calls `__rtcSubscribe` instead of opening a WebSocket. **This shim is the only test-mode-aware code in the dashboard** — keep it that way.

### D.9 Example tests

#### Llminerals demo: 5 workers visible after spawn

```typescript
// dashboard/e2e/llminerals.spec.ts
import { test, expect } from './fixtures/coordinator-fixture';
import { runLlminerals } from '@rtc/simulate/scenarios/llminerals';
import { fakeSink } from '@rtc/simulate/transport';

test('llminerals scenario shows 5 workers harvesting', async ({ page, fake }) => {
  await page.goto('/');

  // Run the scenario for a short window with deterministic seed.
  const scenarioPromise = runLlminerals({
    sink: fakeSink(fake),
    durationMin: 0.05,        // 3 seconds
    uuidSeed: 42,
  });

  // The HUD should show the project name within 2 seconds.
  await expect(page.getByText('Llminerals Outpost')).toBeVisible({ timeout: 2_000 });

  // The HUD top bar reports 5 workers alive.
  await expect(page.getByTestId('workers-alive-count')).toHaveText('5');

  // Token counter increments above zero.
  await expect.poll(
    async () => Number(await page.getByTestId('total-tokens').textContent() ?? '0'),
    { timeout: 5_000 }
  ).toBeGreaterThan(0);

  // Selecting a worker opens the popover.
  await page.getByTestId('worker-Alpha').click();
  await expect(page.getByRole('dialog', { name: /Alpha/ })).toBeVisible();

  await scenarioPromise;
});
```

#### Kill flow

```typescript
// dashboard/e2e/kill-flow.spec.ts
test('clicking kill on a worker removes it from the alive count', async ({ page, fake }) => {
  await page.goto('/');

  // Spawn one worker via the fake.
  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p',
    project: { id: 'p1', name: 'Test Project' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 1, eventId: 'w',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script',
    pid: 99999, label: 'Solo',
  });

  await expect(page.getByTestId('workers-alive-count')).toHaveText('1');

  // Click → confirm.
  await page.getByTestId('worker-Solo').click();
  await page.getByRole('button', { name: /kill/i }).click();
  await page.getByRole('button', { name: /confirm/i }).click();

  // Dashboard sends worker.kill via subscribe channel; fake simulates the despawn.
  // (We assert by simulating the command result + despawn that a real coordinator would.)
  await fake.ingest({
    kind: 'worker.despawned', t: 100, eventId: 'd',
    workerId: 'w1', reason: 'killed',
  });

  await expect(page.getByTestId('workers-alive-count')).toHaveText('0');
});
```

#### Error toast renders and dismisses

```typescript
test('worker.errored shows a toast that dismisses on click', async ({ page, fake }) => {
  await page.goto('/');

  await fake.ingest({
    kind: 'project.upserted', t: 0, eventId: 'p1',
    project: { id: 'p1', name: 'Test' },
  });
  await fake.ingest({
    kind: 'worker.spawned', t: 1, eventId: 's1',
    projectId: 'p1', workerId: 'w1', source: 'sdk-script',
  });
  await fake.ingest({
    kind: 'worker.errored', t: 2, eventId: 'e1',
    workerId: 'w1', message: 'API rate limit', recoverable: true,
  });

  const toast = page.getByText('API rate limit');
  await expect(toast).toBeVisible();
  await toast.click();
  await expect(toast).not.toBeVisible();
});
```

#### Snapshot replay on reconnect

```typescript
test('reconnect resyncs state from snapshot', async ({ page, fake }) => {
  await page.goto('/');

  await fake.ingest({ kind: 'project.upserted', t: 0, eventId: 'p',
                       project: { id: 'p1', name: 'A' } });
  await fake.ingest({ kind: 'worker.spawned', t: 1, eventId: 'w',
                       projectId: 'p1', workerId: 'w1', source: 'sdk-script' });

  // Force a disconnect.
  await page.evaluate(() => (window as any).__rtcForceDisconnect?.());

  // Reconnect; snapshot must contain the worker.
  await page.evaluate(() => (window as any).__rtcReconnect?.());

  await expect(page.getByTestId('workers-alive-count')).toHaveText('1');
});
```

### D.10 What gets tested at which layer

| Concern | Test layer | Rationale |
|---|---|---|
| Reducer correctness | Vitest in `core/` | Pure, fast, no browser. |
| Transcript parser | Vitest in `ingest-claude-code/` | Fixture JSONL files, no Claude Code needed. |
| Pricing calculator | Vitest in `core/` | Stable input/output expectations. |
| Wire protocol | Vitest in `coordinator/` | Spin up real coordinator on random port. |
| HUD rendering, totals | Playwright + FakeCoordinator | Fast, deterministic. |
| Selection / kill confirm UX | Playwright + FakeCoordinator | DOM interaction. |
| Reconnect / snapshot replay | Playwright + FakeCoordinator | Full client-side state machine. |
| **Real kill (SIGTERM/SIGKILL)** | Playwright + real coordinator + a dummy worker process | The one test that needs the real thing. |
| Voxel rendering correctness | None (visual; relies on artist eyeballing) | Out of MVP scope. Optional pixel-snapshot in v2. |

### D.11 Required `data-testid` attributes

For Playwright stability, the dashboard must expose these test ids. Add to the spec as a hard contract:

| Element | `data-testid` |
|---|---|
| Top-bar workers-alive count | `workers-alive-count` |
| Top-bar workers-total count | `workers-total-count` |
| Top-bar total tokens | `total-tokens` |
| Top-bar total USD | `total-usd` |
| Connection status badge | `connection-status` |
| Worker hit-target (canvas overlay) | `worker-{label}` |
| Project name display | `project-name-{projectId}` |
| Error toast item | `error-toast-{eventId}` |
| Kill button in popover | `kill-button` |
| Kill confirm modal confirm | `kill-confirm` |
| Sound toggle | `sound-toggle` |

Worker hit-targets need a minor trick: since the visible "worker" lives on a Three.js canvas, the dashboard places an invisible absolutely-positioned `<div>` at each worker's projected screen coordinates each frame, with `data-testid="worker-{label}"` and `pointer-events: auto`. Clicking it triggers the same selection logic as a canvas raycast. This is also a perfectly reasonable production technique — it gives accessibility for free.

### D.12 Suggested scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "simulate":        "tsx simulate/src/index.ts",
    "simulate:demo":   "tsx simulate/src/index.ts llminerals --duration 60",
    "test":            "vitest run",
    "test:e2e":        "playwright test --config dashboard/e2e/playwright.config.ts",
    "test:e2e:ui":     "playwright test --ui --config dashboard/e2e/playwright.config.ts",
    "test:all":        "pnpm test && pnpm test:e2e"
  }
}
```

### D.13 The "show me 5 workers harvesting" one-liner

After the build is up:

```sh
# Terminal 1
pnpm dev:coordinator

# Terminal 2
pnpm dev:dashboard

# Terminal 3 — sit back and watch
pnpm simulate:demo
```

The dashboard window shows the Llminerals Outpost base, five voxel workers shuttling between the base and the mineral patch, USD ticking up, and the occasional rate-limit error toast from Charlie or Echo. That's the demo.

---

## Appendix E — Video demo capture

E2E behavior must be **automatically recorded as video** and the artifacts committed (or at least always available) under `demos/` at the repo root.

### E.1 Two video outputs

| Type | Location | Purpose | When recorded |
|---|---|---|---|
| **Per-test webm** | `demos/tests/<test-name>/video.webm` | Debug aid + CI artifact | Every Playwright run |
| **Demo MP4** | `demos/llminerals.mp4` | Shareable artifact, README hero | Dedicated `demo-recording` Playwright project, on demand |

The per-test webms are byproducts of running tests. The MP4 is the deliberate product — the thing you'd embed in the README or share with a stakeholder.

### E.2 Updated Playwright config

```typescript
// dashboard/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const DEMOS_DIR = path.resolve(__dirname, '../../demos');

export default defineConfig({
  testDir: './',
  timeout: 60_000,
  outputDir: path.join(DEMOS_DIR, 'tests'),    // per-test artifacts go here

  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    video: {
      mode: 'on',                              // always record, not retain-on-failure
      size: { width: 1440, height: 900 },
    },
  },

  projects: [
    {
      name: 'e2e',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'demo-recording',
      testMatch: /llminerals\.demo\.ts/,        // separate filename pattern
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm vite preview --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

Two important deltas from v0.8: `outputDir` is redirected to `demos/tests/`, and `video.mode` is `'on'` so every test produces a webm regardless of pass/fail. The `demo-recording` project is named separately so you can run it on its own.

### E.3 The demo-recording test

This is **not a test in the assertion sense** — it's a recording wrapper. It runs the Llminerals scenario for ~30 seconds, lets Playwright record video automatically, then post-processes the resulting webm into `demos/llminerals.mp4`.

```typescript
// dashboard/e2e/llminerals.demo.ts
import { test } from './fixtures/coordinator-fixture';
import { runLlminerals } from '@rtc/simulate/scenarios/llminerals';
import { fakeSink } from '@rtc/simulate/transport';

// Single-test file. Plays the scenario for the camera.
test('record llminerals demo', async ({ page, fake }, testInfo) => {
  // Force a single, predictable artifact path.
  testInfo.setTimeout(90_000);

  await page.goto('/');

  // Wait for the dashboard to be ready (canvas mounted, theme applied).
  await page.waitForSelector('[data-testid="connection-status"][data-state="connected"]');

  // Run the scenario.
  await runLlminerals({
    sink: fakeSink(fake),
    durationMin: 0.5,           // 30 seconds — long enough to see cycles
    uuidSeed: 1,                // deterministic
  });

  // Hold final frame for 2 seconds so the video has a clean ending.
  await page.waitForTimeout(2_000);
});
```

### E.4 Post-processing the MP4

Playwright records webm; for sharing you typically want MP4. A small script handles the rename and conversion.

```typescript
// scripts/finalize-demo-video.ts
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEMOS = path.resolve('demos');
const SOURCE_DIR = path.join(DEMOS, 'tests');
const TARGET = path.join(DEMOS, 'llminerals.mp4');

// Find the most recent webm under the demo-recording project's directory.
function findLatestWebm(): string {
  const matches: { p: string; mtime: number }[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith('.webm')) {
        matches.push({ p, mtime: fs.statSync(p).mtimeMs });
      }
    }
  };
  walk(SOURCE_DIR);
  matches.sort((a, b) => b.mtime - a.mtime);
  if (!matches[0]) throw new Error('No .webm found under ' + SOURCE_DIR);
  return matches[0].p;
}

const src = findLatestWebm();
console.log(`Converting ${src} → ${TARGET}`);

// Requires ffmpeg on PATH. Falls back to copying the webm if ffmpeg missing.
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  execSync(
    `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${TARGET}"`,
    { stdio: 'inherit' }
  );
  console.log(`✓ ${TARGET}`);
} catch {
  const fallback = TARGET.replace(/\.mp4$/, '.webm');
  fs.copyFileSync(src, fallback);
  console.warn(`ffmpeg not available — saved as ${fallback} instead`);
}
```

If `ffmpeg` is missing the script gracefully degrades to a `.webm` in the demos directory — never breaks the build. README documents installing ffmpeg as an optional dependency.

### E.5 npm scripts

```json
{
  "scripts": {
    "test:e2e":           "playwright test --project=e2e --config dashboard/e2e/playwright.config.ts",
    "test:e2e:ui":        "playwright test --project=e2e --ui --config dashboard/e2e/playwright.config.ts",
    "demo:record":        "playwright test --project=demo-recording --config dashboard/e2e/playwright.config.ts && tsx scripts/finalize-demo-video.ts",
    "demo:open":          "open demos/llminerals.mp4 || xdg-open demos/llminerals.mp4"
  }
}
```

### E.6 `demos/` directory layout

```
demos/
├── llminerals.mp4              ← the shareable artifact (or .webm fallback)
├── README.md                   ← brief: what each video shows + how to regenerate
├── tests/                      ← per-test webms from `pnpm test:e2e`
│   ├── llminerals-spec-ts-...  ← e.g. video.webm + trace.zip if failed
│   ├── kill-flow-spec-ts-...
│   └── ...
└── .gitkeep
```

### E.7 Repo policy on commits

The `.gitignore` should be:

```
demos/tests/                    # ignore the per-test artifacts churn
!demos/tests/.gitkeep
demos/llminerals.mp4            # do NOT ignore this — commit it
```

Wait — the user wants demos saved to the repo. Override that. **Commit `demos/llminerals.mp4` (or `.webm`).** Keep `demos/tests/` ignored to avoid churn from every test run.

```
# .gitignore
demos/tests/**
!demos/tests/.gitkeep
```

### E.8 Recording in CI

A GitHub Actions step that re-records the demo and uploads as an artifact (and optionally commits back to main):

```yaml
# .github/workflows/demo.yml (sketch)
- run: pnpm install
- run: pnpm build
- run: pnpm exec playwright install chromium --with-deps
- run: sudo apt-get install -y ffmpeg
- run: pnpm demo:record
- uses: actions/upload-artifact@v4
  with:
    name: llminerals-demo
    path: demos/llminerals.mp4
```

Auto-commit-on-main is intentionally not specified — leave that to taste.

---

## Appendix F — README contract

The agent must produce `README.md` at the repo root with the structure below. This is a hard contract, not a suggestion. The `<<< INSERT >>>` markers are filled in by the agent from the surrounding context.

### F.1 Required sections, in order

```markdown
# Real Time Conductor

[![Demo](demos/llminerals.mp4)](demos/llminerals.mp4)

> Real-time observability dashboard for parallel Claude / Anthropic agent jobs,
> framed as an isometric voxel RTS command center.

A localhost dev tool that visualises live Claude Code sessions and instrumented
SDK scripts as workers on a 3D voxel map, harvesting "Large Language Minerals"
(tokens) from mineral patches into project bases. Sci-fi HUD via Arwes; voxel
scene via Three.js.

---

## Demo

![Llminerals demo](demos/llminerals.mp4)

Five workers (Alpha, Bravo, Charlie, Delta, Echo) harvesting tokens from a
single project base. Charlie and Echo periodically hit recoverable rate-limit
errors which appear as toasts. Regenerate with `pnpm demo:record`.

---

## Project goals

Real Time Conductor is a personal dev tool for anyone running multiple
Anthropic agent jobs in parallel and wanting visibility into them at a glance.
The premise is straightforward: instead of squinting at logs and tab-switching
between terminals, you watch your agents work on a single isometric voxel map
that updates in real time.

The dashboard exists to answer four questions without you ever having to ask
them:

1. **What's running right now?** Every active agent appears as a worker on
   the map, attached to its project's base. If a worker is on screen, it is
   alive; if it isn't, it isn't.
2. **What is it costing me?** Tokens consumed appear as "Large Language
   Minerals" being harvested, with running USD totals in the HUD. Each
   project's spend is visible at a glance.
3. **What's gone wrong?** Errors and rate limits surface as toasts in the
   sci-fi HUD, attached to the worker that produced them.
4. **What do I want to stop?** Click a worker, click Kill — the underlying
   process gets `SIGTERM` and the dashboard shows it die.

The core design constraints follow from those goals:

- **Localhost only.** This is a tool you run on your own machine.
- **Driven by real events, not simulation.** The dashboard is observability,
  not a game.
- **Two integration paths.** Claude Code sessions plug in via hook scripts.
  Custom scripts using the Anthropic SDK plug in via a thin wrapper.
- **Sci-fi RTS aesthetic, not a literal game.** Bases, workers, mineral
  patches — these are framing devices that make telemetry legible. There is
  no win condition, no opponent, no balance.

The full architectural specification lives in `SPEC.md`. The voxel artist
hand-off lives in `ASSETS.md`. This README covers usage; the spec covers
reasoning.

---

## What it does

- Runs as a localhost-only dashboard you leave open on a second monitor.
- Each **project** (e.g., a Claude Code workspace) appears as a voxel **base**.
- Each running **agent** (a Claude Code session, or an instrumented SDK script)
  appears as a **worker** that walks between the base and a mineral patch.
- Token consumption updates **USD totals** in the HUD in real time.
- **Errors** appear as Arwes-styled toasts. **Rate limits** read as raids.
- Click any worker to see its details. Click **Kill** to send `SIGTERM` to its
  process. Multi-agent-in-one-process scripts share a PID and terminate
  together — see `SPEC.md` §5.4 for the caveat.

---

## Quick start

### 1. Install

Requires Node.js 20+, pnpm 8+, and (optionally) ffmpeg for MP4 demo
recordings.

​```bash
git clone <repo-url> real-time-conductor
cd real-time-conductor
pnpm install
pnpm exec playwright install chromium
​```

### 2. Run the demo (no real Claude jobs needed)

​```bash
# Terminal 1
pnpm dev:coordinator

# Terminal 2
pnpm dev:dashboard

# Terminal 3
pnpm simulate:demo
​```

Open http://127.0.0.1:5173 and watch five workers harvest. Stop with Ctrl-C.

### 3. Use it with real Claude jobs

#### Option A — Claude Code sessions

Add to `~/.claude/settings.json` (or per-project `.claude/settings.json`):

​```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command",
      "command": "tsx /absolute/path/to/repo/ingest-claude-code/src/on-session-start.ts" }] }],
    "PreToolUse":   [{ "hooks": [{ "type": "command",
      "command": "tsx /absolute/path/to/repo/ingest-claude-code/src/on-pretooluse.ts" }] }],
    "PostToolUse":  [{ "hooks": [{ "type": "command",
      "command": "tsx /absolute/path/to/repo/ingest-claude-code/src/on-posttooluse.ts" }] }],
    "Stop":         [{ "hooks": [{ "type": "command",
      "command": "tsx /absolute/path/to/repo/ingest-claude-code/src/on-stop.ts" }] }]
  }
}
​```

Each Claude Code session you start now appears as a worker. Token totals are
emitted on session end (when the `Stop` hook fires).

> **Caveat:** dashboard shows `0 tokens` for a Claude Code worker until its
> session completes. This is a known MVP limitation; live token streaming is
> on the roadmap. See `SPEC.md` §7.3.

#### Option B — Instrumented SDK scripts

Replace your `Anthropic` import with `instrumentedAnthropic`:

​```typescript
import { instrumentedAnthropic } from '@rtc/ingest-sdk';

const client = instrumentedAnthropic({
  projectId: process.env.ORCHESTRATOR_PROJECT_ID ?? 'my-project',
  workerId:  `worker-${process.pid}`,
  workerLabel: 'Doc summariser',
});

const reply = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});
​```

Lifecycle and per-call token usage stream to the coordinator immediately. The
process responds to `SIGTERM` from the dashboard's Kill button cleanly.

---

## Project layout

​```
core/                  Pure domain. Events, state, reducer, pricing, config.
coordinator/           Localhost Node server. HTTP + WS + JSONL log + kill executor.
ingest-claude-code/    Hook scripts wired into Claude Code's settings.json.
ingest-sdk/            Wrapper around @anthropic-ai/sdk with telemetry.
dashboard/             React + Arwes HUD + Three.js voxel scene. Vite SPA.
simulate/              Scenario CLI for demos and tests.
demos/                 Recorded demo videos (committed).
SPEC.md                Architecture and design decisions.
ASSETS.md              Voxel art delivery guide.
​```

---

## Configuration

Defaults work out of the box. Override via env vars:

| Variable | Purpose | Default |
|---|---|---|
| `RTC_PORT` | Coordinator TCP port | `7777` |
| `RTC_HOST` | Coordinator bind address | `127.0.0.1` |
| `RTC_STATE_DIR` | Where the JSONL log lives | `~/.orchestrator-dashboard` |
| `ORCHESTRATOR_PROJECT_ID` | Override project id resolution | `basename($PWD)` |

Per-project overrides via optional `.orchestrator.json` in the project root:

​```json
{ "name": "my-cool-project", "color": "#7e57c2" }
​```

---

## Testing

​```bash
pnpm test            # vitest unit tests
pnpm test:e2e        # Playwright E2E (headless), records video to demos/tests/
pnpm test:e2e:ui     # Playwright UI mode for debugging
pnpm test:all        # both
​```

E2E tests use a `FakeCoordinator` injected via `window.__RTC_TEST_MODE` —
no real Node server, no port juggling, deterministic. The single exception
is the kill-flow test, which spawns a real coordinator and a dummy worker
process to verify SIGTERM end-to-end. See `SPEC.md` Appendix D.

### Recording the demo video

​```bash
pnpm demo:record     # runs the demo-recording Playwright project,
                     # produces demos/llminerals.mp4 (or .webm if ffmpeg missing)
pnpm demo:open       # opens it in your default player
​```

---

## Troubleshooting

**Workers don't appear when I start a Claude Code session**
Check `~/.claude/settings.json` paths are absolute and the hook scripts are
executable. Verify with `claude /hooks` from inside Claude Code.

**Token total shows zero for Claude Code workers**
Tokens are aggregated and emitted on session end (Stop hook). MVP limitation.

**Killing one worker terminates several at once**
You're running multiple agents in one process; they share a PID. Run each
agent as its own process to enable independent kills. See `SPEC.md` §5.4.

**`pnpm demo:record` produces a `.webm`, not `.mp4`**
ffmpeg is not installed. Either install ffmpeg, or accept the webm — the
finalise script falls back automatically.

**Dashboard shows "reconnecting"**
The coordinator isn't running on `RTC_PORT` (default 7777). Check Terminal
1 is up; restart with `pnpm dev:coordinator` if needed. State persists in
the JSONL log so no events are lost.

**Voxel models float or sink into the ground**
The model's origin is wrong. In MagicaVoxel, position the model so its
bottom voxels touch the very bottom of the editor volume. See `ASSETS.md`
"Origin (very important)".

---

## Status

**MVP**, version-tagged in releases. See `SPEC.md` §8 for the definition of
done and §9 for the roadmap. This is a personal dev tool, not production
software — Arwes is on an alpha API, the kill executor only handles
single-PID workers, and Claude Code token tracking is end-of-session only.

## License

[Choose one — MIT typical for dev tools.]
```

### F.2 README authorship

The user provides the canonical `README.md` for the repo. The agent **must not** rewrite, paraphrase, or "improve" it. If the user's `README.md` is missing fields the gates check for (project goals heading, demo reference, no unfilled markers), halt-and-report per Appendix G §G.2 — do not invent content.

### F.3 The README is part of the build deliverable

Add to MVP §8 definition of done:

> 7. `README.md` exists at the repo root, satisfies Gate G8 (heading
>    `## Project goals`, heading `## Quick start`, no unfilled placeholder
>    markers, ≥ 80 lines, references `demos/llminerals.{mp4,webm}`), and
>    references `SPEC.md` and `ASSETS.md` for deeper details.
> 8. `demos/` directory exists with at least the recorded `llminerals.mp4`
>    (or `.webm`) committed.
> 9. **All gates in Appendix G pass.** Appendix G is the canonical, machine-
>    verifiable definition of "done" for loop runners. Where §8 narrative
>    criteria conflict with Appendix G commands, Appendix G wins.

---

## Appendix G — Completion gates (Ralph Wiggum loop contract)

This appendix is the **canonical, machine-verifiable definition of "done"** for an iterative loop runner. Every gate is a single shell command with an explicit exit-code and content contract. No subjective criteria. No "looks good." If all gates pass in order, the build is done.

### G.0 Loop protocol

**Budgets:**
- **Total wallclock**: 120 minutes from first gate attempt
- **Attempts per gate**: 8 (default), 2 for G10
- **Per-attempt timeout**: 10 minutes — kill the attempt and count it as failed if exceeded

**Algorithm:**

```
for gate in G1..G10:
  attempts = 0
  while attempts < gate.max_attempts:
    if total_wallclock > 120min: HALT_AND_REPORT
    attempts++
    log_path = .ralph/gate-{gate.n}-attempt-{attempts}.log
    run gate.command, redirect stdout+stderr to log_path,
        kill after 10min, capture exit code
    if exit_code == 0 AND gate.assertions_pass:
      break  # success, move to next gate
    else:
      read log_path, diagnose, apply ONE fix, continue
  if attempts == gate.max_attempts:
    HALT_AND_REPORT
```

**Critical rule — read before retrying:** Before each retry attempt, the agent **must** read the most recent failure log under `.ralph/` and diagnose. Blind retry is forbidden — the loop converges only when each attempt corrects something specific. If the diagnosis yields no actionable fix, treat that as halt-and-report rather than burn an attempt.

**One fix per attempt.** Don't bundle multiple speculative changes into one attempt. Loops thrash when failures stack.

### G.1 The gates

#### Gate G1 — install

```sh
pnpm install --frozen-lockfile
```

**Pass:** exit 0. Lockfile committed and consistent.

#### Gate G2 — typecheck and build

```sh
pnpm -r build
```

**Pass:** exit 0. Every package in the workspace produces its build output. `tsc --noEmit` strictness violations count as failures.

#### Gate G3 — unit tests

```sh
pnpm test -- --reporter=verbose
```

**Pass:** exit 0 AND all four minimum suites present:

| Suite | Location | Minimum cases |
|---|---|---|
| reducer | `core/__tests__/reduce.test.ts` | ≥ 10 |
| pricing | `core/__tests__/pricing.test.ts` | ≥ 4 |
| transcript parser | `ingest-claude-code/__tests__/transcript.test.ts` | ≥ 6 |
| wire protocol | `coordinator/__tests__/wire.test.ts` | ≥ 5 |

**Total minimum: 25 vitest cases.** Anti-vacuous-test rule: each case must contain at least one `expect` and exercise distinct branches. Trivial duplicates count as one.

#### Gate G4 — coordinator healthcheck

```sh
( pnpm dev:coordinator & ) ; sleep 3 ; \
  curl -fsS http://127.0.0.1:7777/healthz ; rc=$? ; \
  pkill -f 'dev:coordinator' ; exit $rc
```

**Pass:** exit 0 AND response body is `ok` (or contains `"ok"`).

#### Gate G5 — dashboard build serves

```sh
pnpm --filter @rtc/dashboard build && \
( pnpm --filter @rtc/dashboard preview --port 5173 & ) ; sleep 3 ; \
  curl -fsSI http://127.0.0.1:5173 ; rc=$? ; \
  pkill -f 'vite preview' ; exit $rc
```

**Pass:** exit 0 AND HTTP 200 in response headers.

#### Gate G6 — E2E tests

```sh
pnpm test:e2e
```

**Pass:** exit 0 AND all four required specs present and passing:

| Spec | Required assertion |
|---|---|
| `llminerals.spec.ts` | 5 worker hit-targets visible, USD ticks above 0 |
| `kill-flow.spec.ts` | Kill confirm → despawn → workers-alive decrements |
| `error-toast.spec.ts` | `worker.errored` produces visible toast, dismissible |
| `reconnect.spec.ts` | Forced disconnect + reconnect resyncs from snapshot |

Per-test webm videos exist under `demos/tests/` after this gate runs.

#### Gate G7 — demo recording

```sh
pnpm demo:record
```

**Pass:** exit 0 AND `demos/llminerals.mp4` OR `demos/llminerals.webm` exists AND:

```sh
file_path=$(ls -1 demos/llminerals.mp4 demos/llminerals.webm 2>/dev/null | head -n1)
[ -n "$file_path" ] || exit 1
size=$(wc -c < "$file_path")
[ "$size" -gt 102400 ] || exit 1   # > 100 KB
# duration check (requires ffprobe; if missing, accept size check alone)
if command -v ffprobe >/dev/null; then
  dur=$(ffprobe -v error -show_entries format=duration \
                -of default=nw=1:nk=1 "$file_path")
  awk -v d="$dur" 'BEGIN { exit !(d >= 25) }' || exit 1
fi
```

**Pass:** size > 100 KB, duration ≥ 25 s (or duration unverifiable due to missing ffprobe and size > 100 KB).

#### Gate G8 — README contract

```sh
test -f README.md && \
  grep -q "^## Project goals" README.md && \
  ! grep -q "<<< INSERT VERBATIM ORIGINAL USER PROMPT HERE >>>" README.md && \
  ! grep -q "<<<" README.md && \
  [ "$(wc -l < README.md)" -ge 80 ] && \
  grep -qE 'demos/llminerals\.(mp4|webm)' README.md && \
  grep -q "^## Quick start" README.md
```

**Pass:** exit 0. Specifically:
- `README.md` exists.
- Contains heading `## Project goals` (the substance section).
- Contains heading `## Quick start` (the usage section).
- Does **not** contain any unfilled placeholder markers (`<<<...>>>`).
- Is at least 80 lines long (vacuous-README guard).
- References `demos/llminerals.mp4` or `.webm`.
- References `demos/llminerals.mp4` or `.webm`.

#### Gate G9 — git tracking policy

```sh
git ls-files --error-unmatch demos/llminerals.mp4 2>/dev/null || \
  git ls-files --error-unmatch demos/llminerals.webm
git check-ignore -q demos/tests/anything 2>/dev/null
```

**Pass:** demo file is tracked AND `demos/tests/` is ignored. Both subcommands exit 0.

#### Gate G10 — clean-checkout smoke (capped at 2 attempts)

```sh
tmpdir=$(mktemp -d) && \
  git clone --depth 1 file://$(pwd) "$tmpdir/rtc" && \
  cd "$tmpdir/rtc" && \
  pnpm install --frozen-lockfile && \
  pnpm -r build && \
  pnpm test && \
  pnpm test:e2e && \
  pnpm demo:record
```

**Pass:** exit 0. All four sub-commands succeed in a fresh clone in `/tmp`. **This gate has a hard cap of 2 attempts** — clean-checkout reproduction either works or it doesn't; 8 retries indicates structural issues, not transient failure.

### G.2 Halt-and-report conditions

The loop **stops** (does not retry, does not consume attempts) and reports the situation to the user when any of the following are true:

- **Port conflict**: 7777 or 5173 already bound by another process and cannot be freed.
- **Toolchain version**: Node.js < 20 OR pnpm < 8 OR git missing.
- **Disk space**: < 1 GB free in repo root or `/tmp`.
- **Network unavailable** during `pnpm install` (Gate G1) — retry once after 30s, then halt.
- **README missing or unfit**: the user provides `README.md`. If it is absent at the start of the loop, or fails Gate G8's checks (no `## Project goals` heading, contains unfilled placeholder markers, references missing demo path, etc.), the agent **must halt and ask the user to provide a corrected README** — do not author, paraphrase, or rewrite README content. This is the single content-level halt condition.
- **Same gate failing for the same reason 3 times in a row**: the loop is not converging. Halt rather than thrash.

When halting, write a single-page report to `.ralph/HALT.md` with:
- The gate that halted
- The reason (one of the above categories)
- The last attempt's stderr (last 50 lines)
- Suggested user action

### G.3 `.ralph/` directory contract

```
.ralph/
├── gate-1-attempt-1.log
├── gate-1-attempt-2.log
├── ...
├── gate-7-attempt-1.log
├── HALT.md            ← written only on halt
└── SUCCESS.md         ← written when all gates pass
```

`.ralph/` is gitignored. The agent reads from it before each retry; the user reads from it if the loop halts. `SUCCESS.md` contains the wallclock time, total attempts across all gates, and the final demo file path.

### G.4 What this protects against

The gate list specifically defends against these failure modes that have killed prior agentic builds:

| Failure mode | Defended by |
|---|---|
| Tests pass but are vacuous | G3 minimum-case counts per suite |
| "Works on my machine," not in fresh clone | G10 |
| Demo video is 0-byte or 1-second clip | G7 size + duration check |
| README has the placeholder marker still in it | G8 explicit grep against marker |
| Demo not committed | G9 git-ls-files check |
| Loop retries forever on a structural bug | 120 min budget, halt-and-report |
| Blind retries thrash without diagnosis | "Read log before retry" rule, one-fix-per-attempt |
| Hung process (e.g., dev server didn't exit) | 10-min per-attempt timeout |
| README invented or rewritten by agent | Halt-and-report on missing/unfit user-provided README; F.2 forbids agent authorship |

### G.5 Reporting

On success, write `.ralph/SUCCESS.md`:

```markdown
# RTC build complete

- Total wallclock: 47m 12s
- Total gate attempts: 14 / 80 (avg 1.4 per gate)
- Demo: demos/llminerals.mp4 (1.8 MB, 32s)

All 10 gates passed. README.md, demos/, and tests are in place.
Run `pnpm dev` to use the dashboard.
```

On halt, write `.ralph/HALT.md` per §G.2.
