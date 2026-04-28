import type { DashboardCommand } from './commands.js';
import type { DashboardEvent } from './events.js';
import type { WorldState } from './state.js';

export type ServerMessage =
  | { type: 'snapshot'; state: WorldState; serverTime: number }
  | { type: 'event'; event: DashboardEvent }
  | { type: 'command_result'; commandId: string; ok: boolean; error?: string };

export type ClientMessage = { type: 'command'; command: DashboardCommand };
