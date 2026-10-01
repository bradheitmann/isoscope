import { defineConfig, type Plugin } from "vite";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const ANNOTATIONS = resolve(root, "examples/annotations.json");
const UPLOAD_DIR = resolve(root, "public/media/uploads");

/* Per-module annotation write-back. The app is otherwise a static read of the
   spec; this endpoint is the one place a user's own annotations (notes, inside
   files, face assignments) persist durably and share via the git-tracked JSON.
   POST /api/annotations/:moduleId merges that module's record and writes the
   file atomically. GET returns the whole store. A pure static host has no such
   endpoint — the client detects that and falls back to localStorage + export. */
function readStore(): { modules: Record<string, unknown> } {
  try {
    const raw = JSON.parse(readFileSync(ANNOTATIONS, "utf8")) as { modules?: Record<string, unknown> };
    return { modules: raw.modules ?? {} };
  } catch {
    return { modules: {} };
  }
}
function writeStore(store: { modules: Record<string, unknown> }): void {
  const body = JSON.stringify({ $schema: "per-module annotations", ...store }, null, 1) + "\n";
  const tmp = ANNOTATIONS + ".tmp";
  writeFileSync(tmp, body);
  renameSync(tmp, ANNOTATIONS); /* atomic: readers never see a torn write */
}
function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", c => { b += c; if (b.length > 25e6) rej(new Error("payload too large")); });
    req.on("end", () => res(b));
    req.on("error", rej);
  });
}
function annotationsApi(): Plugin {
  const handler = async (req: NodeJS.ReadableStream & { method?: string; url?: string }, res: { writeHead: (n: number, h?: Record<string, string>) => void; end: (b?: string) => void }, next: () => void) => {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/api/")) return next();
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    try {
      if (req.method === "GET" && url === "/api/annotations") {
        res.end(JSON.stringify(readStore().modules));
        return;
      }
      const m = /^\/api\/annotations\/([^/]+)$/.exec(url);
      if (req.method === "POST" && m) {
        const id = decodeURIComponent(m[1]);
        const rec = JSON.parse(await readBody(req)) as unknown;
        const store = readStore();
        store.modules[id] = rec;
        writeStore(store);
        res.end(JSON.stringify({ ok: true, id }));
        return;
      }
      if (req.method === "DELETE" && m) {
        const id = decodeURIComponent(m[1]);
        const store = readStore();
        delete store.modules[id];
        writeStore(store);
        res.end(JSON.stringify({ ok: true, id }));
        return;
      }
      /* binary upload for the inside drawer / face media: POST /api/upload?name=... */
      if (req.method === "POST" && url === "/api/upload") {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "file";
        const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
        if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
        const buf = Buffer.from(await readBody(req), "binary");
        const dest = resolve(UPLOAD_DIR, Date.now() + "-" + safe);
        writeFileSync(dest, buf);
        res.end(JSON.stringify({ ok: true, src: "/media/uploads/" + dest.split("/").pop() }));
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
  };
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
