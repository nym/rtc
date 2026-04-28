import { create } from 'zustand';
import {
  initialWorldState,
  reduce,
  type DashboardEvent,
  type WorldState,
  type ServerMessage,
} from '@rtc/core';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface ToastEntry {
  eventId: string;
  workerId: string;
  message: string;
  ts: number;
}

interface State {
  world: WorldState;
  connection: ConnectionState;
  selectedWorkerId: string | null;
  pendingKill: string | null;
  toasts: ToastEntry[];
  soundMuted: boolean;
  applyMessage: (msg: ServerMessage) => void;
  applySnapshot: (state: WorldState) => void;
  applyEvent: (event: DashboardEvent) => void;
  setConnection: (state: ConnectionState) => void;
  selectWorker: (id: string | null) => void;
  setPendingKill: (id: string | null) => void;
  dismissToast: (eventId: string) => void;
  toggleSound: () => void;
}

export const useStore = create<State>((set) => ({
  world: initialWorldState(),
  connection: 'connecting',
  selectedWorkerId: null,
  pendingKill: null,
  toasts: [],
  soundMuted: true,
  applyMessage: (msg) => set((s) => {
    if (msg.type === 'snapshot') return { world: msg.state };
    if (msg.type === 'event') return reduceState(s, msg.event);
    if (msg.type === 'command_result') return s;
    return s;
  }),
  applySnapshot: (state) => set(() => ({ world: state })),
  applyEvent: (event) => set((s) => reduceState(s, event)),
  setConnection: (state) => set(() => ({ connection: state })),
  selectWorker: (id) => set(() => ({ selectedWorkerId: id })),
  setPendingKill: (id) => set(() => ({ pendingKill: id })),
  dismissToast: (eventId) => set((s) => ({ toasts: s.toasts.filter((t) => t.eventId !== eventId) })),
  toggleSound: () => set((s) => ({ soundMuted: !s.soundMuted })),
}));

function reduceState(s: State, event: DashboardEvent): Partial<State> {
  const world = reduce(s.world, event);
  if (event.kind === 'worker.errored') {
    const toasts = [
      ...s.toasts,
      {
        eventId: event.eventId,
        workerId: event.workerId,
        message: event.message,
        ts: event.t,
      },
    ].slice(-10);
    return { world, toasts };
  }
  return { world };
}
