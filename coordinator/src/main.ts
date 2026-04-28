import { startCoordinator } from './server.js';
import { COORDINATOR_HOST, COORDINATOR_PORT } from '@rtc/core/config-node';

async function main() {
  const handle = await startCoordinator({});
  // eslint-disable-next-line no-console
  console.log(`[rtc] coordinator on http://${COORDINATOR_HOST}:${handle.port} (configured ${COORDINATOR_PORT})`);

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      await handle.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[rtc] coordinator failed:', err);
  process.exit(1);
});
