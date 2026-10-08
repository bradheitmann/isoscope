import { defineConfig, type Plugin } from "vite";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const ANNOTATIONS = resolve(root, "examples/annotations.json");
const UPLOAD_DIR = resolve(root, "public/media/uploads");
const TELEMETRY_DB = resolve(root, "examples/telemetry.db");

/* the local wide-event store: one SQLite db, opened lazily. node:sqlite is built into
   Node — zero dependencies, no native builds, no Docker. The lumbr wide-event schema
   is kept byte-for-byte in the `json` column; indexed columns make health/throughput
   queries cheap. This is the easiest backend to run; a real lumbr backend swaps in
   behind the same endpoint. */
let _telemetryDb: DatabaseSync | null = null;
function telemetryDb(): DatabaseSync {
  if (_telemetryDb) return _telemetryDb;
  const db = new DatabaseSync(TELEMETRY_DB);
  db.exec(`CREATE TABLE IF NOT EXISTS wide_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edge TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    duration_ms REAL NOT NULL DEFAULT 0,
    end_ms REAL NOT NULL DEFAULT 0,
    json TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_wide_events_edge ON wide_events(edge, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_wide_events_status ON wide_events(status, id)");
  _telemetryDb = db;
  return db;
}

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
      /* durable wide-event store: POST /api/telemetry with a JSON array of lumbr-schema
         wide events inserts one row per event into a local SQLite db (node:sqlite — zero
         deps, built into Node). Queryable: GET /api/telemetry?edge=&status=&limit= returns
         recent rows; GET /api/telemetry/health returns per-edge aggregates. A real lumbr
         backend (SurrealDB/Honeycomb) can replace this store without touching emitters. */
      if (url === "/api/telemetry" || url.startsWith("/api/telemetry/")) {
        const db = telemetryDb();
        if (req.method === "POST" && url === "/api/telemetry") {
          const events = JSON.parse(await readBody(req)) as unknown;
          const list = (Array.isArray(events) ? events : [events]) as Record<string, unknown>[];
          const ins = db.prepare("INSERT INTO wide_events (edge,name,kind,status,duration_ms,end_ms,json) VALUES (?,?,?,?,?,?,?)");
          db.exec("BEGIN");
          try { for (const e of list) ins.run(String(e["isoscope.edge"] ?? ""), String(e.name ?? ""), String(e.kind ?? ""), String(e.status ?? ""), Number(e.duration_ms ?? 0), Number((e.end_time_unix_nano ?? 0) as number) / 1e6, JSON.stringify(e)); db.exec("COMMIT"); }
          catch { db.exec("ROLLBACK"); throw new Error("telemetry insert failed"); }
          res.end(JSON.stringify({ ok: true, count: list.length }));
          return;
        }
        if (req.method === "GET" && url === "/api/telemetry") {
          const q = new URL(req.url ?? "", "http://x").searchParams;
          const edge = q.get("edge"), status = q.get("status"), limit = Math.min(500, Number(q.get("limit") ?? 100));
          const where = [edge ? "edge=?" : "", status ? "status=?" : ""].filter(Boolean).join(" AND ");
          const params = [edge, status].filter(Boolean) as string[];
          const rows = db.prepare(`SELECT json FROM wide_events ${where ? "WHERE " + where : ""} ORDER BY id DESC LIMIT ?`).all(...params, limit).map((r) => JSON.parse((r as { json: string }).json));
          res.end(JSON.stringify(rows));
          return;
        }
        if (req.method === "GET" && url === "/api/telemetry/health") {
          const rows = db.prepare("SELECT edge, COUNT(*) total, SUM(status='ERROR') errors, AVG(duration_ms) avg_ms, MAX(end_ms) last_ms FROM wide_events WHERE edge != '' GROUP BY edge ORDER BY errors DESC, avg_ms DESC").all();
          res.end(JSON.stringify(rows));
          return;
        }
        /* the primary AX hook: current offenders, derived server-side from the
           durable wide-event store with the same health rules the browser applies
           (telemetry.ts): errorRate>=0.5 with a recent crossing → broken;
           errorRate>=0.15 or slow average → degraded. Non-ok edges only, worst first. */
        if (req.method === "GET" && url === "/api/telemetry/attention") {
          const SLOW_MS = 120, RECENT_MS = 5 * 60e3;
          const rows = db.prepare("SELECT edge, COUNT(*) total, SUM(status='ERROR') errors, AVG(duration_ms) avg_ms, MAX(end_ms) last_ms FROM wide_events WHERE edge != '' GROUP BY edge").all() as
            { edge: string; total: number; errors: number; avg_ms: number; last_ms: number }[];
          const now = Date.now();
          const out = rows.map(r => {
            const errorRate = r.total ? r.errors / r.total : 0;
            const health = (errorRate >= 0.5 && now - r.last_ms < RECENT_MS) ? "broken"
              : (errorRate >= 0.15 || r.avg_ms > SLOW_MS) ? "degraded" : "ok";
            return { edge: r.edge, health, total: r.total, errors: r.errors,
              errorRate: Math.round(errorRate * 1000) / 1000,
              avg_ms: Math.round(r.avg_ms * 10) / 10, last_ms: r.last_ms };
          }).filter(r => r.health !== "ok")
            .sort((a, b) => (a.health === b.health ? 0 : a.health === "broken" ? -1 : 1) || (b.errorRate - a.errorRate) || (b.avg_ms - a.avg_ms));
          res.end(JSON.stringify(out));
          return;
        }
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
