import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { DashboardEvent } from '@rtc/core';
import { JSONL_MAX_BACKUPS, JSONL_MAX_BYTES } from '@rtc/core/config-node';

export class JsonlLog {
  private appendStream: fsSync.WriteStream | null = null;

  constructor(private filePath: string) {}

  async ensureDir() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async open() {
    await this.ensureDir();
    this.appendStream = fsSync.createWriteStream(this.filePath, { flags: 'a' });
  }

  async append(event: DashboardEvent): Promise<void> {
    if (!this.appendStream) await this.open();
    await this.maybeRotate();
    await new Promise<void>((resolve, reject) => {
      this.appendStream!.write(JSON.stringify(event) + '\n', (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  private async maybeRotate(): Promise<void> {
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size < JSONL_MAX_BYTES) return;
    } catch {
      return;
    }
    await this.close();
    for (let i = JSONL_MAX_BACKUPS - 1; i >= 1; i--) {
      const src = `${this.filePath}.${i}`;
      const dst = `${this.filePath}.${i + 1}`;
      try { await fs.rename(src, dst); } catch { /* ignore */ }
    }
    try { await fs.rename(this.filePath, `${this.filePath}.1`); } catch { /* ignore */ }
    await this.open();
  }

  async *replay(): AsyncIterable<DashboardEvent> {
    if (!fsSync.existsSync(this.filePath)) return;
    const stream = fsSync.createReadStream(this.filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj.kind === 'string') yield obj as DashboardEvent;
      } catch {
        // ignore malformed line
      }
    }
  }

  async close(): Promise<void> {
    if (!this.appendStream) return;
    await new Promise<void>((resolve) => {
      this.appendStream!.end(() => resolve());
    });
    this.appendStream = null;
  }
}
