import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_CONFIG_FILE, PROJECT_ID_ENV } from '@rtc/core/config-node';

export interface ProjectIdentity {
  id: string;
  name: string;
  cwd: string;
  color?: string;
}

export function resolveProjectIdentity(cwd: string = process.cwd()): ProjectIdentity {
  const env = process.env[PROJECT_ID_ENV];
  let id = env ?? path.basename(cwd);
  let name = id;
  let color: string | undefined;

  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      const obj = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { name?: string; color?: string };
      if (obj.name) name = obj.name;
      if (obj.color) color = obj.color;
    } catch {
      // ignore malformed config
    }
  }

  return color ? { id, name, cwd, color } : { id, name, cwd };
}

export function hostname(): string { return os.hostname(); }
