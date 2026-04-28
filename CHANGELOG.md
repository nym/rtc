# Changelog

## v0.2.0 — Living scene

The "Llminerals Outpost" demo now actually shows the harvest loop the spec
describes: each worker walks out to its own dedicated mineral patch, mines,
carries a glowing voxel back to a multi-tier space-factory base, and drops it
off before heading out for the next run.

### Visuals
- **Worker model.** Workers now render `dashboard/public/assets/MobileStorageBot.obj`
  via `OBJLoader` + `MTLLoader`. The asset trio (`.obj`/`.mtl`/`.png`) ships in
  the repo. Placeholder `BoxGeometry` is the fallback when the file is missing.
- **Space-factory base.** Procedural composite mesh: dark footprint pad, hull
  with 12 emissive cyan window panes, central tower with 4 panes, antenna mast
  topped with a glowing yellow beacon, four corner pylons with caps. Roughly
  3.4 × 3.6 × 3.4 world units (≈3× the v0.1 placeholder cube).
- **Fanned mineral patches.** Each alive worker owns one patch, placed
  deterministically on the camera-facing 180° arc:
  `θ_i = -π/4 + π·(i + 0.5)/N`, radius **5.5 world units**. No patch ever sits
  behind the base out of view.
- **Mineral haul.** When a worker's `tool_use → idle` transition fires *while
  it's at the patch* (within 1.5 units), it picks up a glowing purple voxel and
  walks home; the carry releases once it's within 1 unit of the base. Hit-target
  divs expose `data-carrying="true|false"` for assertions.
- **Wider camera frustum** (`±14`, distance 36) to keep the larger base and
  fanned patches in frame.

### Behavior
- **Position-gated carry.** Activity transitions don't blindly mark a worker as
  carrying — the worker has to actually reach the patch first. Without this, a
  fast event stream (≪ patch travel time) would ratchet workers back to base
  before they ever left.
- **Test-mode freeze split.** `__RTC_FREEZE_MOTION` is now a separate, opt-in
  flag from `__RTC_TEST_MODE`. Stable-position E2E specs set it; the demo
  recording and motion specs leave motion on.

### Demo
- Recording cadence rewritten so each worker runs an async cycle in parallel,
  staggered by 350 ms: 600 ms thinking → 4.2 s harvesting (≥ travel time at
  0.024 u/frame) → idle/walk-home for 4 s. Now ~2-3 full cycles per worker in
  the 32-second window.

### Gates (Appendix G additions)
G6's required-spec list grew from 4 to 7:
| Spec | Assertion |
|---|---|
| `motion.spec.ts` | Worker hit-target horizontal screen position drifts > 8 px during a harvest cycle |
| `mineral-patches.spec.ts` | N alive workers ↔ N `mineral-patch-{label}` hit-targets at distinct screen positions; despawn decrements |
| `harvest-haul.spec.ts` | `data-carrying` flips `false → true` after `tool_use → idle` at the patch, then `true → false` after walking home |

### Spec changelog
- **v1.4** — Patch arc + radius constraint; MobileStorageBot worker visual; space-factory base.
- **v1.3** — Mineral-haul VFX promoted from roadmap to MVP.
- **v1.2** — Per-worker mineral patches.

## v0.1.0 — Initial build

All 10 Appendix G gates green from a fresh clone:
- core (events / reducer / pricing / world / config)
- coordinator (Fastify + ws + JSONL + PID registry + kill executor)
- ingest-claude-code (4 hook scripts + transcript parser)
- ingest-sdk (instrumentedAnthropic wrapper)
- simulate (simulator-core + 4 scenarios)
- dashboard (Vite + React + Three.js + Zustand)
- 30 Vitest cases, 4 Playwright specs, demo recording with ffmpeg→webm fallback

See `.ralph/SUCCESS.md` for the original gate-passing report.
