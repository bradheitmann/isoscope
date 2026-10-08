import { afterEach, describe, expect, it, vi } from "vitest";

type Mod = typeof import("../src/annotations");
const LS = "isoscope.annotations";

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    _m: m,
  };
}

async function fresh(opts: { fetchImpl?: (...a: unknown[]) => Promise<unknown>; ls?: Record<string, string> } = {}): Promise<{ a: Mod; ls: ReturnType<typeof memoryStorage>; fetchMock: ReturnType<typeof vi.fn> }> {
  vi.resetModules();
  const ls = memoryStorage(opts.ls);
  const fetchMock = vi.fn(opts.fetchImpl ?? (async () => { throw new Error("no network"); }));
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("fetch", fetchMock);
  const a = await import("../src/annotations");
  return { a, ls, fetchMock };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("annotations: static host (no endpoint) falls back to the local mirror", () => {
  it("loads the local mirror when the endpoint is absent and marks the store non-remote", async () => {
    const { a } = await fresh({ ls: { [LS]: JSON.stringify({ m1: { notes: "local" } }) } });
    const store = await a.loadAnnotations();
    expect(a.isRemote()).toBe(false);
    expect(store.m1.notes).toBe("local");
    expect(a.getModule("m1").notes).toBe("local");
  });

  it("corrupt local JSON yields an empty store, not a throw", async () => {
    const { a } = await fresh({ ls: { [LS]: "{not json" } });
    expect(await a.loadAnnotations()).toEqual({});
  });

  it("unknown module reads as an empty record", async () => {
    const { a } = await fresh();
    await a.loadAnnotations();
    expect(a.getModule("nope")).toEqual({});
  });

  it("setNotes / setFace / addInside / removeInside read-modify-write one record and mirror locally", async () => {
    const { a, ls } = await fresh();
    await a.loadAnnotations();
    await a.setNotes("m", "hello");
    await a.setFace("m", "roof", { kind: "image", src: "/x.png" });
    await a.setFace("m", "north", null);
    await a.addInside("m", { kind: "note", name: "a", text: "t", addedAt: 1 });
    await a.addInside("m", { kind: "file", name: "b", src: "/b", addedAt: 2 });
    const rec = a.getModule("m");
    expect(rec.notes).toBe("hello");
    expect(rec.faces?.roof).toEqual({ kind: "image", src: "/x.png" });
    expect(rec.faces && "north" in rec.faces && rec.faces.north).toBeNull();
    expect(rec.inside?.map(i => i.name)).toEqual(["a", "b"]);
    await a.removeInside("m", 0);
    expect(a.getModule("m").inside?.map(i => i.name)).toEqual(["b"]);
    await a.removeInside("m", 99); /* out of range is a no-op */
    expect(a.getModule("m").inside?.length).toBe(1);
    expect(JSON.parse(ls._m.get(LS) as string).m.notes).toBe("hello");
  });

  it("writes to one module never disturb another, and replace the old record object", async () => {
    const { a } = await fresh();
    await a.loadAnnotations();
    await a.setNotes("a", "A");
    const before = a.allAnnotations();
    await a.setNotes("b", "B");
    expect(a.allAnnotations()).not.toBe(before); /* immutable replace so change detection works */
    expect(a.getModule("a").notes).toBe("A");
    expect(a.getModule("b").notes).toBe("B");
  });

  it("clearModule removes only that module", async () => {
    const { a, ls } = await fresh();
    await a.loadAnnotations();
    await a.setNotes("a", "A"); await a.setNotes("b", "B");
    await a.clearModule("a");
    expect(a.getModule("a")).toEqual({});
    expect(a.getModule("b").notes).toBe("B");
    expect(Object.keys(JSON.parse(ls._m.get(LS) as string))).toEqual(["b"]);
  });

  it("change listeners fire on load, set and clear", async () => {
    const { a } = await fresh();
    const fn = vi.fn();
    a.onAnnotationsChange(fn);
    await a.loadAnnotations();
    await a.setNotes("a", "x");
    await a.clearModule("a");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("annotations: served by the write-back endpoint", () => {
  const okJson = (body: unknown) => ({ ok: true, json: async () => body });

  it("server records win over the local mirror on load, and the store is remote", async () => {
    const { a, fetchMock } = await fresh({
      ls: { [LS]: JSON.stringify({ m1: { notes: "stale local" }, only_local: { notes: "x" } }) },
      fetchImpl: async () => okJson({ m1: { notes: "server" } }),
    });
    const store = await a.loadAnnotations();
    expect(a.isRemote()).toBe(true);
    expect(store.m1.notes).toBe("server");
    expect(a.getModule("only_local")).toEqual({}); /* no silent merge: the server store is the truth */
    expect(fetchMock.mock.calls[0][0]).toBe("api/annotations");
  });

  it("a non-ok GET is treated as an absent endpoint", async () => {
    const { a } = await fresh({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
    await a.loadAnnotations();
    expect(a.isRemote()).toBe(false);
  });

  it("setModule POSTs the record to the encoded id", async () => {
    const calls: unknown[][] = [];
    const { a } = await fresh({
      fetchImpl: async (...args: unknown[]) => { calls.push(args); return args[0] === "api/annotations" ? okJson({}) : okJson({ ok: true }); },
    });
    await a.loadAnnotations();
    await a.setNotes("weird id/1", "n");
    const post = calls.find(c => String(c[0]).includes("weird"));
    expect(post?.[0]).toBe("api/annotations/weird%20id%2F1");
    expect((post?.[1] as { method: string }).method).toBe("POST");
    expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({ notes: "n" });
  });

  it("a failed write keeps the local change and drops to non-remote", async () => {
    let n = 0;
    const { a } = await fresh({ fetchImpl: async () => (n++ === 0 ? okJson({}) : { ok: false, json: async () => ({}) }) });
    await a.loadAnnotations();
    expect(a.isRemote()).toBe(true);
    await a.setNotes("m", "kept");
    expect(a.isRemote()).toBe(false);
    expect(a.getModule("m").notes).toBe("kept");
  });

  it("clearModule sends DELETE", async () => {
    const calls: unknown[][] = [];
    const { a } = await fresh({ fetchImpl: async (...args: unknown[]) => { calls.push(args); return okJson({}); } });
    await a.loadAnnotations();
    await a.clearModule("m");
    const del = calls.find(c => (c[1] as { method?: string } | undefined)?.method === "DELETE");
    expect(del?.[0]).toBe("api/annotations/m");
  });
});

describe("annotations: constants and export shape", () => {
  it("exposes the six faces and five surface kinds", async () => {
    const { a } = await fresh();
    expect(a.FACES).toEqual(["roof", "north", "south", "east", "west", "bottom"]);
    expect(a.SURFACE_KINDS).toEqual(["video", "image", "doc", "slides", "ink"]);
  });

  it("exportAnnotations bakes {$schema, modules} JSON and downloads annotations.json", async () => {
    const { a } = await fresh();
    await a.loadAnnotations();
    await a.setNotes("m", "exported");
    let blobPart = "";
    const click = vi.fn();
    const anchor: { href: string; download: string; click: () => void } = { href: "", download: "", click };
    vi.stubGlobal("document", { createElement: () => anchor });
    vi.stubGlobal("Blob", class { constructor(parts: string[]) { blobPart = parts.join(""); } });
    const URLStub = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() };
    vi.stubGlobal("URL", URLStub);
    vi.useFakeTimers();
    a.exportAnnotations();
    expect(anchor.download).toBe("annotations.json");
    expect(click).toHaveBeenCalledOnce();
    const parsed = JSON.parse(blobPart);
    expect(parsed.$schema).toBe("per-module annotations");
    expect(parsed.modules.m.notes).toBe("exported");
    vi.advanceTimersByTime(4000);
    expect(URLStub.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
  });
});
