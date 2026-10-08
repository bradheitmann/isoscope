import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createApiHandler } from "../server/api.ts";

let dir: string, server: Server, base: string, host: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "isoscope-dev-api-"));
  const handler = createApiHandler({
    annotationsPath: join(dir, "annotations.json"),
    uploadDir: join(dir, "uploads"),
    telemetryDbPath: join(dir, "telemetry.db"),
  });
  server = createServer((req, res) => {
    void handler(req, res, () => { res.writeHead(404); res.end("static"); });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  host = `127.0.0.1:${port}`;
  base = `http://${host}`;
});
afterAll(async () => {
  await new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); });
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", body, headers });
const alive = async () => expect((await fetch(base + "/api/annotations")).status).toBe(200);

describe("dev-server api", () => {
  it("GET /api/annotations returns the store", async () => {
    const r = await fetch(base + "/api/annotations");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
  });

  it("binary upload is byte-exact (200,000 random bytes)", async () => {
    const data = randomBytes(200_000);
    const r = await post("/api/upload?name=blob.bin", new Uint8Array(data));
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean; src: string };
    expect(j.ok).toBe(true);
    const files = readdirSync(join(dir, "uploads"));
    expect(files).toHaveLength(1);
    expect(j.src).toBe("/media/uploads/" + files[0]);
    expect(readFileSync(join(dir, "uploads", files[0]!)).equals(data)).toBe(true);
  });

  it("unknown /api path -> 404 JSON and server stays alive", async () => {
    const r = await fetch(base + "/api/nope");
    expect(r.status).toBe(404);
    expect((await r.json() as { ok: boolean }).ok).toBe(false);
    await alive();
  });

  it("invalid JSON -> 400 and server stays alive", async () => {
    const r = await post("/api/annotations/mod1", "{not json");
    expect(r.status).toBe(400);
    expect((await r.json() as { ok: boolean }).ok).toBe(false);
    await alive();
  });

  it("cross-site Origin POST -> 403", async () => {
    const r = await post("/api/annotations/mod1", "{}", { origin: "http://evil.example" });
    expect(r.status).toBe(403);
  });

  it("Sec-Fetch-Site cross-site without Origin -> 403", async () => {
    const r = await post("/api/annotations/mod1", "{}", { "sec-fetch-site": "cross-site" });
    expect(r.status).toBe(403);
  });

  it("same-origin and header-less POST succeed, DELETE round-trips", async () => {
    const r = await post("/api/annotations/mod1", JSON.stringify({ note: "hi" }), { origin: "http://" + host });
    expect(r.status).toBe(200);
    expect(await (await fetch(base + "/api/annotations")).json()).toEqual({ mod1: { note: "hi" } });
    const r2 = await post("/api/annotations/mod2", "{}");
    expect(r2.status).toBe(200);
    const d = await fetch(base + "/api/annotations/mod1", { method: "DELETE" });
    expect(d.status).toBe(200);
    const d2 = await fetch(base + "/api/annotations/mod2", { method: "DELETE", headers: { origin: "http://evil.example" } });
    expect(d2.status).toBe(403);
  });

  it.each(["__proto__", "constructor", "prototype"])("reserved module id %s -> 400", async (id) => {
    expect((await post("/api/annotations/" + id, "{}")).status).toBe(400);
    expect((await fetch(base + "/api/annotations/" + id, { method: "DELETE" })).status).toBe(400);
  });

  it("telemetry oversize -> 413 and server stays alive", async () => {
    const r = await post("/api/telemetry", JSON.stringify([{ name: "x".repeat(1_100_000) }]));
    expect(r.status).toBe(413);
    await alive();
  });

  it("telemetry invalid JSON -> 400", async () => {
    expect((await post("/api/telemetry", "][")).status).toBe(400);
  });

  it("telemetry insert and health still work", async () => {
    const r = await post("/api/telemetry", JSON.stringify([{ "isoscope.edge": "a", name: "n", status: "OK", duration_ms: 5 }]));
    expect(await r.json()).toEqual({ ok: true, count: 1 });
    const h = await (await fetch(base + "/api/telemetry/health")).json() as { edge: string; total: number }[];
    expect(h[0]).toMatchObject({ edge: "a", total: 1 });
  });
});

describe("annotations seed vs local store", () => {
  it("reads the seed, writes only the local store, deletes only in the local store", async () => {
    const { writeFileSync, existsSync } = await import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "isoscope-seed-"));
    const seed = join(d, "annotations.json"), local = join(d, "annotations.local.json");
    const seedBody = JSON.stringify({ modules: { SP: { notes: "seed" }, TP: { notes: "tp" } } }, null, 1) + "\n";
    writeFileSync(seed, seedBody);
    const h = createApiHandler({ annotationsPath: seed, localAnnotationsPath: local, uploadDir: join(d, "u"), telemetryDbPath: join(d, "t.db") });
    const s = createServer((req, res) => { void h(req, res, () => { res.writeHead(404); res.end(); }); });
    await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    try {
      expect(await (await fetch(b + "/api/annotations")).json()).toEqual({ SP: { notes: "seed" }, TP: { notes: "tp" } });
      expect(existsSync(local)).toBe(false);
      const p = await fetch(b + "/api/annotations/CL", { method: "POST", body: JSON.stringify({ notes: "new" }) });
      expect(p.status).toBe(200);
      expect(readFileSync(seed, "utf8")).toBe(seedBody);
      expect(existsSync(local)).toBe(true);
      expect(await (await fetch(b + "/api/annotations")).json()).toEqual({ SP: { notes: "seed" }, TP: { notes: "tp" }, CL: { notes: "new" } });
      expect((await fetch(b + "/api/annotations/SP", { method: "DELETE" })).status).toBe(200);
      expect(readFileSync(seed, "utf8")).toBe(seedBody);
      expect(await (await fetch(b + "/api/annotations")).json()).toEqual({ TP: { notes: "tp" }, CL: { notes: "new" } });
    } finally {
      await new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); });
      rmSync(d, { recursive: true, force: true });
    }
  });
});

async function withApi(opts: { seed: string; local?: string; dir: string }, fn: (b: string) => Promise<void>): Promise<void> {
  const h = createApiHandler({
    annotationsPath: opts.seed,
    ...(opts.local ? { localAnnotationsPath: opts.local } : {}),
    uploadDir: join(opts.dir, "u"),
    telemetryDbPath: join(opts.dir, "t.db"),
  });
  const s = createServer((req, res) => { void h(req, res, () => { res.writeHead(404); res.end(); }); });
  await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${(s.address() as AddressInfo).port}`); }
  finally { await new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }); }
}

describe("default local-store path derivation", () => {
  it("derives <seed-without-.json>.local.json when no localAnnotationsPath is given", async () => {
    const { writeFileSync, existsSync } = await import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "isoscope-default-"));
    try {
      const seed = join(d, "annotations.json");
      const seedBody = JSON.stringify({ modules: { SP: { notes: "seed" } } }) + "\n";
      writeFileSync(seed, seedBody);
      await withApi({ seed, dir: d }, async (b) => {
        expect((await fetch(b + "/api/annotations/CL", { method: "POST", body: JSON.stringify({ n: 1 }) })).status).toBe(200);
        expect(existsSync(join(d, "annotations.local.json"))).toBe(true);
        expect(readFileSync(seed, "utf8")).toBe(seedBody);
        expect(await (await fetch(b + "/api/annotations")).json()).toEqual({ SP: { notes: "seed" }, CL: { n: 1 } });
      });
      expect(JSON.parse(readFileSync(join(d, "annotations.local.json"), "utf8")).modules).toEqual({ SP: { notes: "seed" }, CL: { n: 1 } });
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe("corrupt local store is never treated as empty", () => {
  it("GET, POST and DELETE return 500 JSON and leave the corrupt file byte-identical", async () => {
    const { writeFileSync } = await import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "isoscope-corrupt-"));
    try {
      const seed = join(d, "annotations.json"), local = join(d, "annotations.local.json");
      const seedBody = JSON.stringify({ modules: { SP: {} } }) + "\n";
      const corrupt = '{"modules": {"A": {"notes": "precious"';
      writeFileSync(seed, seedBody);
      writeFileSync(local, corrupt);
      await withApi({ seed, dir: d }, async (b) => {
        const calls: [string, RequestInit][] = [
          ["/api/annotations", {}],
          ["/api/annotations/X", { method: "POST", body: "{}" }],
          ["/api/annotations/A", { method: "DELETE" }],
        ];
        for (const [path, init] of calls) {
          const r = await fetch(b + path, init);
          expect(r.status, path).toBe(500);
          const j = await r.json() as { ok: boolean; error: string };
          expect(j.ok).toBe(false);
          expect(j.error).toMatch(/annotations\.local\.json.*not valid JSON/);
        }
      });
      expect(readFileSync(local, "utf8")).toBe(corrupt);
      expect(readFileSync(seed, "utf8")).toBe(seedBody);
      expect(readdirSync(d).sort()).toEqual(["annotations.json", "annotations.local.json"]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it("a wrongly-shaped store (modules is an array) is also refused, not overwritten", async () => {
    const { writeFileSync } = await import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "isoscope-shape-"));
    try {
      const seed = join(d, "annotations.json"), local = join(d, "annotations.local.json");
      const bad = '{"modules": [1,2]}';
      writeFileSync(seed, "{}\n");
      writeFileSync(local, bad);
      await withApi({ seed, dir: d }, async (b) => {
        expect((await fetch(b + "/api/annotations")).status).toBe(500);
        expect((await fetch(b + "/api/annotations/X", { method: "POST", body: "{}" })).status).toBe(500);
      });
      expect(readFileSync(local, "utf8")).toBe(bad);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
