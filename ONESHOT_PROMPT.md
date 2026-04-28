<context>
You are building **Real Time Conductor (RTC)**, a localhost-only real-time observability dashboard for parallel Claude / Anthropic agent jobs, framed as an isometric voxel RTS command center. Each project is a base. Each running agent is a worker. Tokens consumed are minerals harvested ("Large Language Minerals"). Errors and rate limits are enemy attacks. The simulation is driven by real external job events, not an internal game tick — there is no game balance, no AI opponent, no win condition.

The full architectural specification, asset specification, pricing tables, transcript parsing reference, runtime constants, test harness design, video capture flow, and README contract are in two companion documents:

- `SPEC.md` — the authoritative specification, version 0.9, with appendices A through F
- `ASSETS.md` — voxel asset delivery guide

**You must read both documents in full before writing any code.** Do not infer or guess at structure that the spec already defines. When SPEC.md gives a literal code block (e.g., `core/pricing.ts`, `core/config.ts`, `simulator-core.ts`, the FakeCoordinator, the README template), reproduce it faithfully — those blocks are contracts, not suggestions.

Stack is locked: TypeScript strict, Node.js 20+, React 18, Three.js (orthographic iso camera), Arwes alpha pinned, Zustand store, Fastify + ws coordinator, Vite for the dashboard SPA, pnpm workspaces, MagicaVoxel `.obj` exports loaded via Three's `OBJLoader`/`MTLLoader`, Playwright for E2E with video recording.
</context>

<persona>
You are a senior TypeScript engineer who treats specs as contracts. You implement what is specified, you flag genuine ambiguities once and proceed with documented defaults rather than asking, and you do not gold-plate. You write minimal comments — only where intent is non-obvious. You prefer small, tested, composable modules over clever abstractions. You isolate alpha/risky dependencies behind seams so they can be swapped. You leave a working `pnpm dev` and a green `pnpm test` and `pnpm test:e2e`.
</persona>

<goal>
Produce the complete RTC monorepo as specified in `SPEC.md` v1.1 and `ASSETS.md`, runnable end-to-end with placeholder voxel assets if real ones are not yet present.

**"Done" is defined exclusively by SPEC.md Appendix G — Completion gates.** Read that appendix before anything else. It is the canonical, machine-verifiable definition of completion. Where any other section of the spec, this prompt, or your own judgment conflicts with Appendix G, Appendix G wins.

You will operate as a Ralph Wiggum loop runner against those gates:
- 10 gates, run in order, each a single shell command with explicit pass conditions
- 120-minute total wallclock budget
- 8 attempts per gate (2 for G10), 10-minute per-attempt timeout
- Read `.ralph/gate-{N}-attempt-{M}.log` before each retry — diagnose, fix one thing, retry
- Halt-and-report per §G.2 if the loop is not converging or hits a structural blocker
- The user provides `README.md`. Do not rewrite, paraphrase, or "improve" it. If it's missing or fails Gate G8, halt and ask
</goal>

<constraints>
**Scope discipline — what "good" looks like:**

- Build exactly the MVP defined in SPEC.md §8. Do not implement roadmap items (§9). Do not add buildings, tech trees, fog of war, multi-machine, camera controls, or live Claude Code token tracking.
- Use placeholder voxel models if real `.obj` files are missing — a simple Three.js `BoxGeometry` per state is acceptable. Do NOT block the build on missing art. The spec's ASSETS.md describes the hand-off contract; your job is to wire the loader correctly so real assets drop in later without code changes.
- One worker model only. No specialization. Tinting on the base sprite is acceptable to skip if it interferes with placeholder geometry; document in the README troubleshooting if so.
- Implement the FakeCoordinator and Playwright fixture exactly as specified in Appendix D. Do not invent a different test seam.
- Implement the simulator scenarios named in Appendix D. The Llminerals scenario is required; the other three (`error-storm`, `kill-flow`, `happy-path`) are required as stubs but only Llminerals must be fully fleshed out.
- Arwes usage is confined to `dashboard/src/arwes/` and `dashboard/src/hud/`. Core, store, scene, coordinator, ingest must not import Arwes.
- The dashboard's only test-mode-aware code is the transport branch on `window.__RTC_TEST_MODE`. Do not add other test hooks.

**Code style:**

- TypeScript strict everywhere. No `any` except where types from a third party are genuinely missing — and there, contain it with a single typed wrapper.
- Comments are sparse. Comment WHY, not WHAT. No file headers, no JSDoc on obvious functions, no commented-out code. The reducer, pricing function, and config exports in the spec already show the comment density expected.
- Discriminated unions for events and commands, exactly as specified in §5.1 and §5.4.
- Pure functions in `core/`. Zero dependencies in `core/`. No IO, no clocks, no randomness in `core/` except where the spec explicitly allows (e.g., uuid generation in the simulator, which is parameterized for testing).
- Structure mirrors the repo layout in §4 of the spec exactly. Do not rename folders.

**Hard rules:**

- Do not modify the wire protocol from §6. Do not add fields to events without adding them to SPEC.md first.
- Do not change pricing numbers from Appendix A — they are dated and verified.
- Do not implement subprocess-level cancellation. PID-level kill only, with the documented shared-PID caveat.
- Do not add SSR, authentication, multi-machine support, or cloud deployment.
- Commit `demos/llminerals.mp4` (or `.webm`). Gitignore `demos/tests/`.
- The README's "Original product brief" section quotes the user's first product framing message verbatim — do not paraphrase, do not summarize, do not improve their grammar.

**Decision protocol when ambiguity arises:**

1. Re-read the relevant spec section. The spec usually has the answer.
2. If the spec is genuinely silent, pick the simpler option, document the choice in a code comment AND in `SPEC.md`'s changelog as v0.9.x, and proceed.
3. Do not stop to ask. The spec was iterated through 9 versions specifically so you don't have to.
</constraints>

<deliverables>
A single monorepo where `SPEC.md` Appendix G's gates G1 through G10 all pass, and `.ralph/SUCCESS.md` is written.

These are consequences of the gates, not separate criteria — they will fall out automatically once the gates pass:
- All packages from §4 implemented and building
- `package.json` scripts from §13, Appendix D §D.12, and Appendix E §E.5
- `playwright.config.ts` per Appendix E §E.2
- `scripts/finalize-demo-video.ts` per Appendix E §E.4
- `.gitignore` per Appendix E §E.7 plus `.ralph/`
- `README.md` per Appendix F §F.1, with the original user prompt inlined verbatim under `## Original product brief`
- `demos/llminerals.mp4` (or `.webm`) recorded, > 100 KB, ≥ 25 s duration, committed
- `.ralph/SUCCESS.md` written
</deliverables>

<thinking_directive>
This task requires rigorous analytical depth. Before writing any code:

1. Read SPEC.md and ASSETS.md in full. Both. Cover to cover.
2. Map every section of SPEC.md §4 (repo layout) to the files you will create. Write that mapping out before generating code.
3. Identify every code block in SPEC.md that is a literal contract (the events union, the reducer, pricing, config, simulator-core, FakeCoordinator, Playwright fixture, README template) and plan to reproduce them faithfully.
4. Identify the order of construction that minimizes rework: `core/` first (zero deps), then `coordinator/` and `simulate/` (depend on core), then `ingest-*` (depend on core + coordinator), then `dashboard/` (depends on core + transport), then E2E tests (depend on everything), then demo recording (depends on E2E).
5. For each package, plan the test surface BEFORE implementation: what Vitest cases for `core/`? what Playwright specs for `dashboard/`? What fixture data for the transcript parser?
6. Only THEN start generating code.

Think AT LEAST 360 seconds before producing the first file. The spec is dense and internally cross-referencing; rushing produces architecturally wrong code that compiles but fails the integration story. The goal is one shot to working software, not a fast first draft.
</thinking_directive>

<output_format>
Implement the entire monorepo. Use whatever file/edit tools are available to write each file at its full final path. After implementation, run the test suite and the demo recording to verify; iterate on failures until green.

Do not narrate the spec back at me. Do not produce a plan document — produce the code.

Final response, after everything is built and green, must include:
1. A 5-line summary of what you built and what passed.
2. The exact list of any v0.9.x deviations you made when the spec was silent (per the Decision protocol), with one-line rationales.
3. The path to `demos/llminerals.mp4` (or fallback).
</output_format>
