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

Five workers — Alpha, Bravo, Charlie, Delta, Echo — harvesting tokens from a
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
   project's spend is visible at a glance; the global total is impossible to
   miss.
3. **What's gone wrong?** Errors and rate limits surface as toasts in the
   sci-fi HUD, attached to the worker that produced them. Recoverable
   issues read as raids; unrecoverable ones read as deaths.
4. **What do I want to stop?** Click a worker, click Kill — the underlying
   process gets `SIGTERM` and the dashboard shows it die. No SSH, no
   `pkill`, no terminal-switching.

The core design constraints follow from those goals:

- **Localhost only.** This is a tool you run on your own machine alongside
  the agents themselves, not a hosted service.
- **Driven by real events, not simulation.** The dashboard is observability,
  not a game. Workers move because real API calls are happening, not because
  a tick clock fired.
- **Two integration paths.** Claude Code sessions plug in via hook scripts.
  Custom scripts using the Anthropic SDK plug in via a thin wrapper around
  `messages.create()`. Both produce the same dashboard.
- **Sci-fi RTS aesthetic, not a literal game.** Bases, workers, mineral
  patches, fog of war — these are framing devices that make telemetry
  legible and pleasant to leave open on a second monitor. There is no win
  condition, no opponent, no balance.

The full architectural specification, including event schemas, wire protocol,
voxel asset contract, test harness design, and completion gates, lives in
[`SPEC.md`](SPEC.md). The voxel artist hand-off lives in
[`ASSETS.md`](ASSETS.md). This README covers usage; the spec covers reasoning.

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
  together — see [`SPEC.md`](SPEC.md) §5.4 for the caveat.

---

## Quick start

### 1. Install

Requires Node.js 20+, pnpm 8+, and (optionally) ffmpeg for MP4 demo recordings.

```bash
git clone <repo-url> real-time-conductor
cd real-time-conductor
pnpm install
pnpm exec playwright install chromium
```

### 2. Run the demo (no real Claude jobs needed)

```bash
# Terminal 1
pnpm dev:coordinator

# Terminal 2
pnpm dev:dashboard

# Terminal 3
pnpm simulate:demo
```

Open http://127.0.0.1:5173 and watch five workers harvest. Stop with Ctrl-C.

### 3. Use it with real Claude jobs

#### Option A — Claude Code sessions

Add to `~/.claude/settings.json` (or per-project `.claude/settings.json`):

```json
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
```

Each Claude Code session you start now appears as a worker. Token totals are
emitted on session end (when the `Stop` hook fires).

> **Caveat:** dashboard shows `0 tokens` for a Claude Code worker until its
> session completes. This is a known MVP limitation; live token streaming is
> on the roadmap. See [`SPEC.md`](SPEC.md) §7.3.

#### Option B — Instrumented SDK scripts

Replace your `Anthropic` import with `instrumentedAnthropic`:

```typescript
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
```

Lifecycle and per-call token usage stream to the coordinator immediately. The
process responds to `SIGTERM` from the dashboard's Kill button cleanly.

---

## Project layout

```
core/                  Pure domain. Events, state, reducer, pricing, config.
coordinator/           Localhost Node server. HTTP + WS + JSONL log + kill executor.
ingest-claude-code/    Hook scripts wired into Claude Code's settings.json.
ingest-sdk/            Wrapper around @anthropic-ai/sdk with telemetry.
dashboard/             React + Arwes HUD + Three.js voxel scene. Vite SPA.
simulate/              Scenario CLI for demos and tests.
demos/                 Recorded demo videos (committed).
SPEC.md                Architecture and design decisions.
ASSETS.md              Voxel art delivery guide.
```

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

```json
{ "name": "my-cool-project", "color": "#7e57c2" }
```

---

## Testing

```bash
pnpm test            # vitest unit tests
pnpm test:e2e        # Playwright E2E (headless), records video to demos/tests/
pnpm test:e2e:ui     # Playwright UI mode for debugging
pnpm test:all        # both
```

E2E tests use a `FakeCoordinator` injected via `window.__RTC_TEST_MODE` —
no real Node server, no port juggling, deterministic. The single exception
is the kill-flow test, which spawns a real coordinator and a dummy worker
process to verify SIGTERM end-to-end. See [`SPEC.md`](SPEC.md) Appendix D.

### Recording the demo video

```bash
pnpm demo:record     # runs the demo-recording Playwright project,
                     # produces demos/llminerals.mp4 (or .webm if ffmpeg missing)
pnpm demo:open       # opens it in your default player
```

---

## Troubleshooting

**Workers don't appear when I start a Claude Code session.**
Check `~/.claude/settings.json` paths are absolute and the hook scripts are
executable. Verify with `claude /hooks` from inside Claude Code.

**Token total shows zero for Claude Code workers.**
Tokens are aggregated and emitted on session end (Stop hook). MVP limitation;
see roadmap in [`SPEC.md`](SPEC.md) §9.

**Killing one worker terminates several at once.**
You're running multiple agents in one process; they share a PID. Run each
agent as its own process to enable independent kills. See [`SPEC.md`](SPEC.md)
§5.4.

**`pnpm demo:record` produces a `.webm`, not `.mp4`.**
ffmpeg is not installed. Either install ffmpeg, or accept the webm — the
finalise script falls back automatically.

**Dashboard shows "reconnecting".**
The coordinator isn't running on `RTC_PORT` (default 7777). Check Terminal
1 is up; restart with `pnpm dev:coordinator` if needed. State persists in
the JSONL log so no events are lost.

**Voxel models float or sink into the ground.**
The model's origin is wrong. In MagicaVoxel, position the model so its
bottom voxels touch the very bottom of the editor volume. See
[`ASSETS.md`](ASSETS.md) "Origin (very important)".

---

## Status

**MVP**, version-tagged in releases. See [`SPEC.md`](SPEC.md) §8 for the
definition of done and §9 for the roadmap. This is a personal dev tool, not
production software — Arwes is on an alpha API, the kill executor only handles
single-PID workers, and Claude Code token tracking is end-of-session only.

## License

MIT.
