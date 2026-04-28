import {
  COORDINATOR_WS,
} from '@rtc/core/config';
import type { ClientMessage, ServerMessage, DashboardCommand } from '@rtc/core';
import { useStore } from './store.js';

declare global {
  interface Window {
    __RTC_TEST_MODE?: boolean;
    __rtcIngest?: (event: unknown) => void;
    __rtcForceDisconnect?: () => void;
    __rtcReconnect?: () => void;
    __rtcSendCommand?: (command: DashboardCommand) => void;
  }
}

export type Transport = {
  sendCommand: (command: DashboardCommand) => void;
  disconnect: () => void;
};

export function connect(): Transport {
  if (typeof window !== 'undefined' && window.__RTC_TEST_MODE) {
    return connectFake();
  }
  return connectReal();
}

function connectReal(): Transport {
  const store = useStore.getState();
  let ws: WebSocket | null = null;
  let attempts = 0;
  let stopped = false;

  const open = () => {
    store.setConnection('connecting');
    ws = new WebSocket(COORDINATOR_WS);
    ws.addEventListener('open', () => {
      attempts = 0;
      useStore.getState().setConnection('connected');
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        useStore.getState().applyMessage(msg);
      } catch { /* ignore malformed */ }
    });
    ws.addEventListener('close', () => {
      useStore.getState().setConnection('disconnected');
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
      attempts += 1;
      setTimeout(() => { if (!stopped) open(); }, delay);
    });
    ws.addEventListener('error', () => {
      try { ws?.close(); } catch { /* ignore */ }
    });
  };

  open();

  return {
    sendCommand(command) {
      if (!ws || ws.readyState !== ws.OPEN) return;
      const msg: ClientMessage = { type: 'command', command };
      ws.send(JSON.stringify(msg));
    },
    disconnect() {
      stopped = true;
      try { ws?.close(); } catch { /* ignore */ }
    },
  };
}

/**
 * Fake transport for tests. Wires up window.__rtcIngest and forced
 * disconnect/reconnect hooks so tests can drive state directly.
 */
function connectFake(): Transport {
  const store = useStore.getState();
  let connected = true;

  const ingest = (eventLike: unknown) => {
    const event = eventLike as { kind?: string };
    if (!event || typeof event.kind !== 'string') return;
    if (!connected) return;
    useStore.getState().applyEvent(eventLike as never);
  };

  store.setConnection('connected');
  window.__rtcIngest = ingest;
  window.__rtcForceDisconnect = () => {
    connected = false;
    useStore.getState().setConnection('disconnected');
  };
  window.__rtcReconnect = () => {
    connected = true;
    useStore.getState().setConnection('connected');
    // The "snapshot" semantic is preserved because we never tossed local state.
  };

  return {
    sendCommand: (command) => {
      // For tests, surface kill commands by dispatching a despawn so the UI clears.
      if (command.kind === 'worker.kill') {
        useStore.getState().applyEvent({
          kind: 'worker.despawned',
          t: Date.now(),
          eventId: `kill-${command.commandId}`,
          workerId: command.workerId,
          reason: 'killed',
        });
      }
    },
    disconnect: () => {
      window.__rtcIngest = undefined;
      window.__rtcForceDisconnect = undefined;
      window.__rtcReconnect = undefined;
    },
  };
}
