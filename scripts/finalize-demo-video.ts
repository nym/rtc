import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEMOS = path.resolve('demos');
const SOURCE_DIR = path.join(DEMOS, 'tests');
const TARGET = path.join(DEMOS, 'llminerals.mp4');

function findLatestWebm(): string {
  const matches: { p: string; mtime: number }[] = [];
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`No tests output directory at ${SOURCE_DIR}`);
  }
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
  if (!matches[0]) throw new Error(`No .webm found under ${SOURCE_DIR}`);
  return matches[0].p;
}

function ensureDemosDir() {
  fs.mkdirSync(DEMOS, { recursive: true });
}

function main() {
  ensureDemosDir();
  const src = findLatestWebm();
  // eslint-disable-next-line no-console
  console.log(`[finalize-demo-video] source: ${src}`);

  let haveFfmpeg = false;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    haveFfmpeg = true;
  } catch {
    haveFfmpeg = false;
  }

  if (haveFfmpeg) {
    try {
      execSync(
        `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${TARGET}"`,
        { stdio: 'inherit' }
      );
      // eslint-disable-next-line no-console
      console.log(`[finalize-demo-video] wrote ${TARGET}`);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[finalize-demo-video] ffmpeg failed; falling back to webm', (err as Error).message);
    }
  }

  const fallback = TARGET.replace(/\.mp4$/, '.webm');
  fs.copyFileSync(src, fallback);
  // eslint-disable-next-line no-console
  console.warn(`[finalize-demo-video] ffmpeg unavailable — saved as ${fallback}`);
}

main();
