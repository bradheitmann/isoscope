import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { basename, dirname, resolve } from "node:path";

export interface ApiOptions {
  /** tracked, read-only seed/example annotations (never written by the server) */
  annotationsPath: string;
  /** gitignored runtime store (read first, written atomically); defaults to <seed>.local.json */
  localAnnotationsPath?: string;
  /** directory that receives binary uploads */
  uploadDir: string;
  /** SQLite file for the wide-event store (opened lazily) */
  telemetryDbPath: string;
}

export type ApiHandler = (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;

const MAX_UPLOAD_BODY = 200e6;
const MAX_TELEMETRY_BODY = 1e6;
const MAX_JSON_BODY = 25e6;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/* Collect raw bytes as Buffer chunks so binary payloads are byte-exact. On overflow the
   remaining stream is discarded (not destroyed) so the 413 response can still be delivered. */
function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (c: Buffer | string) => {
      if (over) return;
      const b = typeof c === "string" ? Buffer.from(c) : c;
      size += b.length;
      if (size > max) { over = true; chunks.length = 0; rej(new HttpError(413, "payload too large")); return; }
      chunks.push(b);
    });
    req.on("end", () => { if (!over) res(Buffer.concat(chunks)); });
    req.on("error", rej);
  });
}

async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  const buf = await readBody(req, max);
  try { return JSON.parse(buf.toString("utf8")); } catch { throw new HttpError(400, "body is not valid JSON"); }
}

const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);
function moduleId(raw: string): string {
  let id: string;
  try { id = decodeURIComponent(raw); } catch { throw new HttpError(400, "invalid module id"); }
  if (RESERVED_IDS.has(id)) throw new HttpError(400, "invalid module id");
  return id;
}

/* Any web page the user has open can send a simple cross-site POST to a loopback server.
   Browsers send Origin (or Sec-Fetch-Site); non-browser tools send neither and stay allowed. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return req.headers["sec-fetch-site"] !== "cross-site";
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function createApiHandler(opts: ApiOptions): ApiHandler {
  const { annotationsPath, uploadDir, telemetryDbPath } = opts;
  const localPath = opts.localAnnotationsPath ?? annotationsPath.replace(/\.json$/, "") + ".local.json";

  let telemetry: DatabaseSync | null = null;
  const telemetryDb = (): DatabaseSync => {
    if (telemetry) return telemetry;
    const db = new DatabaseSync(telemetryDbPath);
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
    telemetry = db;
    return db;
  };

  /* A missing store is empty; an unreadable or unparseable one is an error. Treating a corrupt
     file as empty would let the next POST/DELETE overwrite (wipe) the user's data. */
  const readStore = (): { modules: Record<string, unknown> } => {
    const file = existsSync(localPath) ? localPath : annotationsPath;
    if (!existsSync(file)) return { modules: {} };
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, "utf8")); }
    catch (e) { throw new HttpError(500, `annotation store ${basename(file)} is unreadable or not valid JSON (${(e as Error).message}); fix or remove it - it was not modified`); }
    const mods = (raw as { modules?: unknown } | null)?.modules;
    const bad = typeof raw !== "object" || raw === null || Array.isArray(raw)
      || (mods !== undefined && (typeof mods !== "object" || mods === null || Array.isArray(mods)));
    if (bad) throw new HttpError(500, `annotation store ${basename(file)} has an unexpected shape; fix or remove it - it was not modified`);
    return { modules: (mods as Record<string, unknown> | undefined) ?? {} };
  };
  const writeStore = (store: { modules: Record<string, unknown> }): void => {
    const body = JSON.stringify({ $schema: "per-module annotations", ...store }, null, 1) + "\n";
    const tmp = localPath + ".tmp";
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(tmp, body);
    renameSync(tmp, localPath); /* atomic: readers never see a torn write */
  };

  return async (req, res, next) => {
    const url = (req.url ?? "").split("?")[0] ?? "";
    if (!url.startsWith("/api/")) return next();
    const send = (status: number, body: unknown): void => {
      if (res.headersSent || res.writableEnded) { if (!res.writableEnded) res.end(); return; }
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      if ((req.method === "POST" || req.method === "DELETE") && !sameOrigin(req)) throw new HttpError(403, "cross-origin write refused");
      if (req.method === "GET" && url === "/api/annotations") {
        send(200, readStore().modules);
        return;
      }
      const m = /^\/api\/annotations\/([^/]+)$/.exec(url);
      if (req.method === "POST" && m) {
        const id = moduleId(m[1]!);
        const rec = await readJson(req, MAX_JSON_BODY);
        const store = readStore();
        store.modules[id] = rec;
        writeStore(store);
        send(200, { ok: true, id });
        return;
      }
      if (req.method === "DELETE" && m) {
        const id = moduleId(m[1]!);
        const store = readStore();
        delete store.modules[id];
        writeStore(store);
        send(200, { ok: true, id });
        return;
      }
      /* binary upload for the inside drawer / face media: POST /api/upload?name=... */
      if (req.method === "POST" && url === "/api/upload") {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "file";
        const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
        const buf = await readBody(req, MAX_UPLOAD_BODY);
        if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
        const dest = resolve(uploadDir, Date.now() + "-" + safe);
        writeFileSync(dest, buf);
        send(200, { ok: true, src: "/media/uploads/" + basename(dest) });
        return;
      }
      /* durable wide-event store: POST /api/telemetry with a JSON array of lumbr-schema
         wide events inserts one row per event into a local SQLite db (node:sqlite — zero
         deps, built into Node). Queryable: GET /api/telemetry?edge=&status=&limit= returns
         recent rows; GET /api/telemetry/health returns per-edge aggregates. A real lumbr
         backend (SurrealDB/Honeycomb) can replace this store without touching emitters. */
      if (url === "/api/telemetry" || url.startsWith("/api/telemetry/")) {
        if (req.method === "POST" && url === "/api/telemetry") {
          const events = await readJson(req, MAX_TELEMETRY_BODY);
          const db = telemetryDb();
          const list = (Array.isArray(events) ? events : [events]) as Record<string, unknown>[];
          const ins = db.prepare("INSERT INTO wide_events (edge,name,kind,status,duration_ms,end_ms,json) VALUES (?,?,?,?,?,?,?)");
          db.exec("BEGIN");
          try { for (const e of list) ins.run(String(e["isoscope.edge"] ?? ""), String(e.name ?? ""), String(e.kind ?? ""), String(e.status ?? ""), Number(e.duration_ms ?? 0), Number((e.end_time_unix_nano ?? 0) as number) / 1e6, JSON.stringify(e)); db.exec("COMMIT"); }
          catch { db.exec("ROLLBACK"); throw new Error("telemetry insert failed"); }
          send(200, { ok: true, count: list.length });
          return;
        }
        if (req.method === "GET" && url === "/api/telemetry") {
          const db = telemetryDb();
          const q = new URL(req.url ?? "", "http://x").searchParams;
          const edge = q.get("edge"), status = q.get("status"), limit = Math.min(500, Number(q.get("limit") ?? 100));
          const where = [edge ? "edge=?" : "", status ? "status=?" : ""].filter(Boolean).join(" AND ");
          const params = [edge, status].filter(Boolean) as string[];
          const rows = db.prepare(`SELECT json FROM wide_events ${where ? "WHERE " + where : ""} ORDER BY id DESC LIMIT ?`).all(...params, limit).map((r) => JSON.parse((r as { json: string }).json));
          send(200, rows);
          return;
        }
        if (req.method === "GET" && url === "/api/telemetry/health") {
          const db = telemetryDb();
          const rows = db.prepare("SELECT edge, COUNT(*) total, SUM(status='ERROR') errors, AVG(duration_ms) avg_ms, MAX(end_ms) last_ms FROM wide_events WHERE edge != '' GROUP BY edge ORDER BY errors DESC, avg_ms DESC").all();
          send(200, rows);
          return;
        }
        /* the primary AX hook: current offenders, derived server-side from the
           durable wide-event store with the same health rules the browser applies
           (telemetry.ts): errorRate>=0.5 with a recent crossing → broken;
           errorRate>=0.15 or slow average → degraded. Non-ok edges only, worst first. */
        if (req.method === "GET" && url === "/api/telemetry/attention") {
          const db = telemetryDb();
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
          send(200, out);
          return;
        }
      }
      send(404, { ok: false, error: "not found" });
    } catch (e) {
      send(e instanceof HttpError ? e.status : 500, { ok: false, error: (e as Error).message });
    }
  };
}
