import { runLlminerals } from './scenarios/llminerals.js';
import { runErrorStorm } from './scenarios/error-storm.js';
import { runKillFlow } from './scenarios/kill-flow.js';
import { runHappyPath } from './scenarios/happy-path.js';
import { httpSink } from './transport.js';

export { runLlminerals } from './scenarios/llminerals.js';
export { runErrorStorm } from './scenarios/error-storm.js';
export { runKillFlow } from './scenarios/kill-flow.js';
export { runHappyPath } from './scenarios/happy-path.js';
export * from './simulator-core.js';
export { httpSink, fakeSink } from './transport.js';

interface CliArgs {
  positional: string[];
  duration?: number;
  target?: string;
  speed?: number;
  seed?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--duration')      out.duration = Number(argv[++i]);
    else if (a === '--target')   out.target = argv[++i];
    else if (a === '--speed')    out.speed = Number(argv[++i]);
    else if (a === '--seed')     out.seed = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      help();
      process.exit(0);
    }
    else if (!a.startsWith('--')) out.positional.push(a);
  }
  return out;
}

function help() {
  // eslint-disable-next-line no-console
  console.log(`Usage: simulate <scenario> [options]

Scenarios:
  llminerals     5-worker harvest demo (default)
  error-storm    Rapid recoverable errors
  kill-flow      Spawn workers and wait for kills
  happy-path     Single completed worker

Options:
  --duration <min>     Stop after N minutes (default: forever)
  --target <url>       Coordinator URL (default: http://127.0.0.1:7777)
  --speed <n>          Time multiplier (default: 1.0)
  --seed <n>           Deterministic UUID seed (testing)
`);
}

async function runCli() {
  const args = parseArgs(process.argv);
  const scenario = args.positional[0] ?? 'llminerals';
  const sink = httpSink(args.target);

  switch (scenario) {
    case 'llminerals':
      await runLlminerals({
        sink,
        ...(args.duration !== undefined ? { durationMin: args.duration } : {}),
        ...(args.speed !== undefined ? { speed: args.speed } : {}),
        ...(args.seed !== undefined ? { uuidSeed: args.seed } : {}),
      });
      break;
    case 'error-storm':
      await runErrorStorm({ sink, ...(args.seed !== undefined ? { uuidSeed: args.seed } : {}) });
      break;
    case 'kill-flow':
      await runKillFlow({
        sink,
        ...(args.duration !== undefined ? { durationMin: args.duration } : {}),
        ...(args.seed !== undefined ? { uuidSeed: args.seed } : {}),
      });
      break;
    case 'happy-path':
      await runHappyPath({ sink, ...(args.seed !== undefined ? { uuidSeed: args.seed } : {}) });
      break;
    default:
      // eslint-disable-next-line no-console
      console.error(`unknown scenario: ${scenario}`);
      process.exit(1);
  }
}

const isCli = (() => {
  try {
    if (typeof process === 'undefined') return false;
    const arg = process.argv[1] ?? '';
    return /\bsimulate\/(src|dist)\/index\.(t|j)s$/.test(arg);
  } catch { return false; }
})();

if (isCli) {
  runCli().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[rtc:simulate] failed:', err);
    process.exit(1);
  });
}
