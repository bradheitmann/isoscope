/* Production API implementation and Vite settings, with test-owned durable stores. */
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import baseline from '../../vite.config';
import { createApiHandler } from '../../server/api';
const store = process.env.ISO_BATTERY_STORE_DIR;
if (!store) throw new Error('ISO_BATTERY_STORE_DIR is required');
const handler = createApiHandler({
  annotationsPath: resolve('examples/annotations.json'),
  localAnnotationsPath: resolve(store, 'annotations.local.json'),
  telemetryDbPath: resolve(store, 'telemetry.db'),
  uploadDir: resolve(store, 'uploads'),
});
export default defineConfig({
  ...baseline,
  plugins: [{
    name: 'battery-isolated-api',
    configureServer(server) {
      server.middlewares.use(handler);
      server.httpServer?.once('listening', () => {
        const address = server.httpServer!.address();
        if (address && typeof address !== 'string') console.log(`ISO_BATTERY_PORT=${address.port}`);
      });
    },
  }],
});
