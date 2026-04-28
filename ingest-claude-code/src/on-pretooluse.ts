import { resolveProjectIdentity } from './identity.js';
import { makeEventId, postEvents } from './post.js';
import { readStdinJson } from './read-stdin.js';
import type { DashboardEvent } from '@rtc/core';

interface PreToolUseHook {
  session_id?: string;
  tool_name?: string;
  agent_id?: string;
  cwd?: string;
}

/** Parses "mcp__servername__toolname" → "servername", or null for non-MCP tools. */
function mcpServerOf(toolName: string | undefined): string | null {
  if (!toolName || !toolName.startsWith('mcp__')) return null;
  const rest = toolName.slice('mcp__'.length);
  const sep = rest.indexOf('__');
  return sep > 0 ? rest.slice(0, sep) : rest || null;
}

async function main() {
  const hook = (await readStdinJson<PreToolUseHook>()) ?? {};
  // When inside a subagent call, agent_id identifies the subagent worker;
  // otherwise the parent session is the worker.
  const workerId = hook.agent_id ?? hook.session_id ?? `cc-${process.ppid}`;
  const mcpServer = mcpServerOf(hook.tool_name);

  const events: DashboardEvent[] = [{
    kind: 'worker.activity',
    t: Date.now(), eventId: makeEventId('act'),
    workerId, activity: mcpServer ? 'mcp_call' : 'tool_use',
    detail: hook.tool_name,
  }];

  if (mcpServer) {
    const project = resolveProjectIdentity(hook.cwd);
    events.push({
      kind: 'mcp.server.upserted',
      t: Date.now(), eventId: makeEventId('mcp'),
      server: {
        id: `${project.id}:${mcpServer}`,
        name: mcpServer,
        projectId: project.id,
      },
    });
  }

  await postEvents(events);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] on-pretooluse error:', err);
});
