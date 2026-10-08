import { defineConfig, type Plugin } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./server/api.ts";

const root = dirname(fileURLToPath(import.meta.url));

/* Per-module annotation write-back + upload + wide-event telemetry. The app is otherwise a
   static read of the spec; these endpoints (server/api.ts) are the one place a user's own
   annotations persist durably and share via the git-tracked JSON. A pure static host has no
   such endpoint — the client detects that and falls back to localStorage + export. */
function annotationsApi(): Plugin {
  const handler = createApiHandler({
    annotationsPath: resolve(root, "examples/annotations.json"),
    uploadDir: resolve(root, "public/media/uploads"),
    telemetryDbPath: resolve(root, "examples/telemetry.db"),
  });
  return {
    name: "isoscope-annotations-api",
    configureServer(s) { s.middlewares.use(handler); },
    configurePreviewServer(s) { s.middlewares.use(handler); },
  };
}

export default defineConfig({
  base: "./",
  plugins: [annotationsApi()],
  server: { port: 4182, strictPort: true },
  preview: { port: 4182, strictPort: true },
});
