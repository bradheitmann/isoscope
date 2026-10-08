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

describe("dev-server api: configurable caps and cross-site writes", () => {
  let dir2: string, server2: Server, base2: string;
  beforeAll(async () => {
    dir2 = mkdtempSync(join(tmpdir(), "isoscope-dev-api-cap-"));
    const handler = createApiHandler({
      annotationsPath: join(dir2, "annotations.json"),
      uploadDir: join(dir2, "uploads"),
      telemetryDbPath: join(dir2, "telemetry.db"),
      maxUploadBytes: 1000,
      maxTelemetryBytes: 500,
    });
    server2 = createServer((req, res) => {
      void handler(req, res, () => { res.writeHead(404); res.end("static"); });
    });
    await new Promise<void>(r => server2.listen(0, "127.0.0.1", r));
    base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(r => { server2.closeAllConnections(); server2.close(() => r()); });
    rmSync(dir2, { recursive: true, force: true });
  });
  const alive2 = async () => expect((await fetch(base2 + "/api/annotations")).status).toBe(200);
  const evil = { origin: "http://evil.example" };

  it("upload over the configured cap -> 413, nothing written, server stays alive", async () => {
    const r = await fetch(base2 + "/api/upload?name=big.bin", { method: "POST", body: new Uint8Array(5000) });
    expect(r.status).toBe(413);
    expect(() => readdirSync(join(dir2, "uploads"))).toThrow();
    await alive2();
    const ok = await fetch(base2 + "/api/upload?name=small.bin", { method: "POST", body: new Uint8Array(900) });
    expect(ok.status).toBe(200);
  });

  it("telemetry over the configured cap -> 413 and server stays alive", async () => {
    const r = await fetch(base2 + "/api/telemetry", { method: "POST", body: JSON.stringify([{ name: "x".repeat(800) }]) });
    expect(r.status).toBe(413);
    await alive2();
  });

  it("cross-site Origin POST to /api/upload -> 403 and nothing written", async () => {
    const before = (() => { try { return readdirSync(join(dir2, "uploads")).length; } catch { return 0; } })();
    const r = await fetch(base2 + "/api/upload?name=x.bin", { method: "POST", body: new Uint8Array(10), headers: evil });
    expect(r.status).toBe(403);
    const after = (() => { try { return readdirSync(join(dir2, "uploads")).length; } catch { return 0; } })();
    expect(after).toBe(before);
  });

  it("cross-site Origin POST to /api/telemetry -> 403 and nothing stored", async () => {
    const r = await fetch(base2 + "/api/telemetry", { method: "POST", body: JSON.stringify([{ "isoscope.edge": "e", name: "n" }]), headers: evil });
    expect(r.status).toBe(403);
    const rows = await (await fetch(base2 + "/api/telemetry")).json() as unknown[];
    expect(rows).toHaveLength(0);
  });

  it("cross-site DELETE /api/annotations/:id -> 403 and the record survives", async () => {
    expect((await fetch(base2 + "/api/annotations/keep", { method: "POST", body: JSON.stringify({ a: 1 }) })).status).toBe(200);
    const d = await fetch(base2 + "/api/annotations/keep", { method: "DELETE", headers: evil });
    expect(d.status).toBe(403);
    expect(await (await fetch(base2 + "/api/annotations")).json()).toEqual({ keep: { a: 1 } });
  });
});
