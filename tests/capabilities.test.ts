import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open, importSpec, exportSpec, markNode } from "isoscope/graph";
import { buildHtml } from "isoscope/render";
import { createLiveApplication, parseServeOptions, secureLiveFetch } from "isoscope/live";

const token = "synthetic-test-token-with-at-least-32-characters";
const base = "http://127.0.0.1:4177";
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const fixture = JSON.parse(readFileSync(new URL("../examples/isoscope.spec.json", import.meta.url), "utf8"));

describe("optional capabilities", () => {
  test("headless package entry imports without CLI, listener, output or store creation", () => {
    const directory = mkdtempSync(join(tmpdir(), "isoscope-consumer-"));
    try {
      const entry = new URL("../index.ts", import.meta.url).pathname;
      const child = Bun.spawnSync([process.execPath, "-e", `Bun.serve = () => { throw new Error('unexpected listener'); }; const api = await import(${JSON.stringify(entry)}); console.log(typeof api.exportSpec);`], { cwd: directory });
      expect(child.exitCode).toBe(0);
      expect(child.stdout.toString()).toBe("function\n");
      expect(child.stderr.toString()).toBe("");
      expect(readdirSync(directory)).toEqual([]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test("focused graph and render consumers preserve the existing store-to-HTML workflow", () => {
    const db = open(":memory:");
    try {
      importSpec(db, fixture);
      markNode(db, { id: fixture.nodes[0].id, state: "attn" });
      const spec = exportSpec(db);
      expect(spec.status[fixture.nodes[0].id].state).toBe("attn");
      expect(buildHtml(spec)).toContain(JSON.stringify(spec.nodes[0].id));
      expect(buildHtml(spec)).not.toContain("__ISOSCOPE_SPEC__");
    } finally { db.close(); }
  });

  test("omitted and explicit full profile have identical read and write behavior", async () => {
    for (const profile of [undefined, "full"] as const) {
      let calls = 0;
      const app = secureLiveFetch(() => { calls++; return new Response("ok"); }, token, { profile });
      for (const path of ["/", "/spec.json", "/blast-radius", "/events", "/mark", "/ci?provider=signal"]) {
        expect((await app.fetch(new Request(base + path, { headers }), 4177)).status).toBe(200);
        expect((await app.fetch(new Request(base + path, { method: "POST", headers, body: "{}" }), 4177)).status).toBe(200);
      }
      expect(calls).toBe(12);
    }
  });

  test("read-only rejects every mutation method on all routes before dispatch, including future routes", async () => {
    let calls = 0;
    const app = secureLiveFetch(() => { calls++; return new Response("ok"); }, token, { profile: "read-only" });
    for (const path of ["/", "/spec.json", "/blast-radius", "/events", "/mark", "/ci?provider=signal", "/future-write"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        expect((await app.fetch(new Request(base + path, { method, headers, body: "{}" }), 4177)).status).toBe(403);
      }
    }
    expect(calls).toBe(0);
    expect((await app.fetch(new Request(base, { method: "POST" }), 4177)).status).toBe(401);
  });

  test("real read-only application serves viewer, graph, incident scope and SSE, without changing graph", async () => {
    const directory = mkdtempSync(join(tmpdir(), "isoscope-live-"));
    const path = join(directory, "map.db");
    const db = open(path);
    importSpec(db, fixture);
    const before = exportSpec(db);
    db.close();
    const application = createLiveApplication(path, { token, profile: "read-only" });
    const live = application;
    try {
      for (const route of ["/", "/spec.json", "/blast-radius"]) {
        const response = await live.fetch(new Request(base + route, { headers }), 4177);
        expect(response.status).toBe(200);
        expect((await response.text()).length).toBeGreaterThan(0);
      }
      const response = await live.fetch(new Request(base + "/events", { headers }), 4177);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      const reader = response.body!.getReader();
      expect(String((await reader.read()).value)).toContain("event: hello");
      application.notify();
      expect(String((await reader.read()).value)).toContain("event: update");
      await reader.cancel();
      for (const route of ["/mark", "/ci?provider=signal"]) {
        expect((await live.fetch(new Request(base + route, { method: "POST", headers, body: JSON.stringify({ id: fixture.nodes[0].id, state: "attn" }) }), 4177)).status).toBe(403);
      }
      const reopened = open(path);
      try { expect(exportSpec(reopened)).toEqual(before); } finally { reopened.close(); }
    } finally { application.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  test("full application still applies authenticated mark and CI mutations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "isoscope-full-"));
    const path = join(directory, "map.db");
    const db = open(path);
    importSpec(db, fixture);
    db.close();
    const application = createLiveApplication(path, { token });
    const live = application;
    try {
      const id = fixture.nodes[0].id;
      const marked = await live.fetch(new Request(base + "/mark", { method: "POST", headers, body: JSON.stringify({ id, state: "attn" }) }), 4177);
      expect(marked.status).toBe(200);
      const ci = await live.fetch(new Request(base + "/ci?provider=signal", { method: "POST", headers, body: JSON.stringify({ job: id, ok: false, message: "synthetic CI failure" }) }), 4177);
      expect(ci.status).toBe(200);
      const response = await live.fetch(new Request(base + "/spec.json", { headers }), 4177);
      const spec = await response.json() as any;
      expect(spec.status[id].state).toBe("attn");
      expect(spec.status[id].items.some((item: any) => item.c === "red" && item.l.includes("synthetic CI failure"))).toBe(true);
    } finally { application.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  test("embedded listener shares the application profile and browser session", async () => {
    const directory = mkdtempSync(join(tmpdir(), "isoscope-embedded-"));
    const path = join(directory, "map.db");
    const db = open(path);
    importSpec(db, fixture);
    db.close();
    const application = createLiveApplication(path, { token, profile: "read-only" });
    const { server, bootstrapCode } = application.listen(0);
    try {
      expect(server.hostname).toBe("127.0.0.1");
      expect(bootstrapCode).toBe(application.bootstrapCode);
      const endpoint = `http://127.0.0.1:${server.port}`;
      expect((await fetch(endpoint + "/spec.json")).status).toBe(401);
      expect((await fetch(endpoint + "/spec.json", { headers })).status).toBe(200);
      for (const route of ["/mark", "/ci?provider=signal", "/future"]) {
        expect((await fetch(endpoint + route, { method: "POST", headers, body: "{}" })).status).toBe(403);
      }
      const handoff = await fetch(endpoint + "/session?code=" + bootstrapCode, { redirect: "manual" });
      expect(handoff.status).toBe(303);
      const cookie = handoff.headers.get("set-cookie")!.split(";")[0];
      expect((await application.fetch(new Request(endpoint + "/spec.json", { headers: { cookie } }), server.port!)).status).toBe(200);
    } finally { application.close(); await server.stop(true); rmSync(directory, { recursive: true, force: true }); }
  });

  test("invalid profiles and serve options fail closed before effects", () => {
    for (const profile of ["readonly", "", null, false, 0]) {
      expect(() => secureLiveFetch(() => new Response(), token, { profile: profile as any })).toThrow();
    }
    expect(parseServeOptions([])).toEqual({ dbPath: "isoscope.db", port: 4177, profile: "full" });
    expect(parseServeOptions(["--port", "0", "--profile", "read-only", "graph.db"])).toEqual({ dbPath: "graph.db", port: 0, profile: "read-only" });
    for (const args of [["--profile"], ["--profile", "bad"], ["--port", "-1"], ["--port", "Infinity"], ["--port", "65536"], ["--port", "1.5"], ["--unknown"], ["a.db", "b.db"], ["--profile", "full", "--profile", "read-only"]]) {
      expect(() => parseServeOptions(args)).toThrow();
    }
  });
});
