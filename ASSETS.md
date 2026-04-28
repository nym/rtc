# Asset List — Real Time Conductor (Voxel Edition)

A standalone artist's reference. You don't need to read SPEC.md to deliver these — everything you need is here.

---

## TL;DR

You're modelling in **MagicaVoxel** and exporting to **.obj** (which produces `.obj` + `.mtl` + a `.png` palette automatically).

**Total deliverable for MVP:**

- 1 worker character × 4 poses = **4 .vox source files + 4 .obj exports**
- 1 base / command center = **1 .vox + 1 .obj**
- 1 mineral patch = **1 .vox + 1 .obj**
- 4 small UI icons (SVG, drawn separately, not voxel)
- *(Optional)* 1 ground texture (PNG)

That's it. No directional variants — Three.js rotates the model at runtime to face movement. No frame sheets — meshes swap based on worker state.

---

## Conventions (read once, apply everywhere)

### Coordinate system & scale

The Three.js scene treats **1 voxel = 1 world unit / 16** by convention. So a 16×16×16 voxel character is 1 world unit tall, which sits nicely on a 1×1 ground tile. Don't worry about absolute size — the runtime rescales to consistent world units. The thing that matters is **relative scale**: a worker should look smaller than its base, and a mineral patch should be smaller than a worker.

Suggested character bounding box: **about 12×16×12 voxels** (X, Y/up, Z). Buildings: 24×32×24 or so. Mineral patches: 12×8×12.

### Origin (very important)

In MagicaVoxel, set the origin so the **bottom-center of your model sits at world origin (0,0,0)**. The model's "feet" / "footprint base" should be at `y=0`. Any voxels below that in the editor will appear sunken into the ground.

How to do this in MagicaVoxel: model with the bottom layer of voxels touching the bottom of the volume, and the model centered on the X/Z axes. The exporter writes coordinates relative to the volume's corner; the runtime offsets accordingly so center-bottom lands on the entity's world position.

### Facing

Model your worker **facing toward +Z** (forward, away from the camera in the default editor orientation). The runtime rotates the mesh on its Y-axis to track movement. If you model facing the wrong direction, all your workers will moonwalk — easy fix at the end (rotate 180° in MagicaVoxel and re-export), but easier still to get right first time.

### Export from MagicaVoxel

Use `Export > obj`. This produces three files for each model:
- `model.obj` — geometry
- `model.mtl` — material references
- `model.png` — 256×1 palette image

Ship all three. The runtime loads them as a set.

### Material caveat

MagicaVoxel's per-voxel material settings (emissive, roughness, metalness) do **not** survive `.obj` export. You're effectively shipping flat-colored voxel meshes. Lighting in the scene compensates — there's a 3-point voxel-friendly light rig set up in the renderer. Don't waste time fiddling with emissive in the editor; it won't show up.

If you need glow effects (e.g., glowing eyes on a worker), flag those voxels as a distinct color and we'll attach a Three.js point light or post-processing bloom at runtime. Tell us which colors are "magic" and we wire it up.

---

## Asset 1 — Worker (4 poses)

The only animated entity. Animation is achieved by **swapping meshes**, not by rigging. Two of the poses (`walk-A`, `walk-B`) get alternated rapidly to create a walk cycle illusion.

| File (source) | File (export) | Pose description |
|---------------|---------------|------------------|
| `worker-idle.vox` | `worker-idle.obj` + `.mtl` + `.png` | Standing relaxed, arms at sides |
| `worker-walk-a.vox` | `worker-walk-a.obj` + `.mtl` + `.png` | Mid-step: left foot forward, right arm forward |
| `worker-walk-b.vox` | `worker-walk-b.obj` + `.mtl` + `.png` | Mid-step: right foot forward, left arm forward |
| `worker-work.vox` | `worker-work.obj` + `.mtl` + `.png` | Working pose: hammering, mining, swinging — pick one verb and stick with it |

### Modelling tips

- Keep the character **chunky and readable from above-and-side** — that's the iso camera angle. Detail on top of the head and shoulders is more visible than detail on the front of the chest.
- Strong silhouette matters more than detail. A worker that reads as a shape from 30° elevation is better than a finely-detailed one that reads as a blob.
- Color contrast against the ground matters. Don't make the worker the same color family as the background.
- The two walk poses should be **mirror-ish but not identical**. Just alternate which leg is forward and which arm swings forward; that's enough to read as walking.

### Pose framing

All four poses must have:
- The same overall scale.
- The same origin (bottom-center at 0,0,0).
- The same facing direction (+Z).

If pose dimensions vary slightly (e.g., the work pose has a raised arm so the bounding box is taller), that's fine — the renderer doesn't care about exact bounds. What matters is the feet stay on the ground.

---

## Asset 2 — Base / Command Center

| File | Notes |
|------|-------|
| `base-default.vox` → `base-default.obj` + `.mtl` + `.png` | Single static model |

Suggested size: **24×32×24 voxels** (about 1.5–2× a worker's height). Should read as a "command center" — could be a small fortress, sci-fi compound, comms tower, anything that says "this is the project's home base."

**Color tinting:** the runtime can apply a per-project color tint at render time, so each project's base appears in a different color. Model with neutral tones (greys, off-whites) plus clear lighting/shading and the tint will look good. If you'd rather hand-color the base in a specific palette, that's fine — tinting will be skipped and project names show in a banner instead.

---

## Asset 3 — Mineral Patch

| File | Notes |
|------|-------|
| `mineral-patch.vox` → `mineral-patch.obj` + `.mtl` + `.png` | Static |

Suggested size: **12×8×12 voxels** (low and squat, smaller than a worker). Should read as "valuable energy being harvested" — crystal cluster, ore vein, glowing pile. This represents tokens being consumed.

Bright saturated colors here are good — it's the visual hot-spot that workers walk toward.

---

## Asset 4 — UI Icons (SVG, not voxel)

Drawn separately as flat SVG. These appear in tiny popovers and the HUD, not on the canvas.

| File | Size | Purpose |
|------|------|---------|
| `kill.svg` | 24×24 | Kill button (red-ish) |
| `thinking.svg` | 16×16 | Worker is reasoning |
| `tool-use.svg` | 16×16 | Worker is invoking a tool |
| `streaming.svg` | 16×16 | Worker is generating output |

Simple line-art is fine.

---

## Asset 5 — Ground texture (optional)

| File | Size | Notes |
|------|------|-------|
| `ground-default.png` | 1024×1024, tileable | Optional |

The ground is a flat plane at `y=0`. If you skip this, the renderer uses a flat theme color (grid optional). If you provide one, it tiles across the plane.

Subtle is better — this is wallpaper, not the focus.

---

## Directory structure to deliver in

```
dashboard/public/assets/
├── workers/
│   ├── worker-idle.obj
│   ├── worker-idle.mtl
│   ├── worker-idle.png
│   ├── worker-walk-a.obj
│   ├── worker-walk-a.mtl
│   ├── worker-walk-a.png
│   ├── worker-walk-b.obj
│   ├── worker-walk-b.mtl
│   ├── worker-walk-b.png
│   ├── worker-work.obj
│   ├── worker-work.mtl
│   └── worker-work.png
├── bases/
│   ├── base-default.obj
│   ├── base-default.mtl
│   └── base-default.png
├── patches/
│   ├── mineral-patch.obj
│   ├── mineral-patch.mtl
│   └── mineral-patch.png
├── ground/
│   └── ground-default.png            (optional)
├── ui/
│   ├── kill.svg
│   ├── thinking.svg
│   ├── tool-use.svg
│   └── streaming.svg
└── source/                            (optional, for your reference)
    ├── worker-idle.vox
    ├── worker-walk-a.vox
    ├── worker-walk-b.vox
    ├── worker-work.vox
    ├── base-default.vox
    └── mineral-patch.vox
```

The runtime loads the `.obj`/`.mtl`/`.png` triplets. The `.vox` files in `source/` are for your future editing only — they don't need to be present at runtime, but it's good practice to keep them in the repo so the next iteration is one MagicaVoxel session away.

---

## Delivery checklist

- [ ] `worker-idle.{obj,mtl,png}`
- [ ] `worker-walk-a.{obj,mtl,png}`
- [ ] `worker-walk-b.{obj,mtl,png}`
- [ ] `worker-work.{obj,mtl,png}`
- [ ] `base-default.{obj,mtl,png}`
- [ ] `mineral-patch.{obj,mtl,png}`
- [ ] `kill.svg`, `thinking.svg`, `tool-use.svg`, `streaming.svg`
- [ ] *(optional)* `ground-default.png`
- [ ] *(optional)* `source/*.vox` originals committed alongside

When done, drop the whole `assets/` folder over and the renderer will pick it up.

---

## Things to double-check before handing off

1. **Origin**. The most common bug: model origin is not at bottom-center, so workers float or sink into the ground when placed. Easiest test: in MagicaVoxel, position your model so its bottom voxels touch the very bottom of the editor volume and the model is centered on X and Z.
2. **Facing direction**. Worker should face **+Z** in MagicaVoxel's default editor view. If they moonwalk in the dashboard, rotate 180° and re-export.
3. **Consistent scale across worker poses**. All four worker poses must be the same size relative to each other. If `idle` is 12 voxels tall and `walk-A` is 14 voxels tall (because the leg is mid-stride), the worker will visibly jump on every state swap. Match base heights.
4. **Pose continuity**. `walk-A` and `walk-B` should look like two frames of the same character mid-walk, not like two different characters. Easiest way: model `walk-A` first, save a copy as `walk-B`, then move just the limbs.
5. **`.obj`/`.mtl`/`.png` always shipped together as a set**. Missing one breaks the load. The `.mtl` references the `.png` by relative filename, so don't rename the PNG without also editing the `.mtl`.
