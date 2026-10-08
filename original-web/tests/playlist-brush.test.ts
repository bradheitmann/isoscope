import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { energizeTrack } from "../src/playlist";
import { clearBrush, type BrushState } from "../src/brush-model";

const renderer = readFileSync(resolve(import.meta.dirname, "../src/original-renderer.ts"), "utf8");

describe("playlist -> energize", () => {
  it("energizes exactly the picked track, replacing any prior energized set", () => {
    const cordon = new Set(["a", "b", "c"]);
    energizeTrack(cordon, "b");
    expect([...cordon]).toEqual(["b"]);
  });
  it("works from empty and when the track is already the only one", () => {
    const cordon = new Set<string>();
    energizeTrack(cordon, "x");
    expect([...cordon]).toEqual(["x"]);
    energizeTrack(cordon, "x");
    expect([...cordon]).toEqual(["x"]);
  });
  it("mutates the shared set in place (the renderer holds the same reference)", () => {
    const cordon = new Set(["a"]);
    const ref = cordon;
    energizeTrack(cordon, "z");
    expect(ref.has("z") && !ref.has("a")).toBe(true);
  });
  it("the renderer playlist row uses it", () => {
    expect(renderer).toMatch(/energizeTrack\(cordon,id\);pinned=null;/);
  });
});

describe("brush clear", () => {
  const mk = (strokes: string[], current: string | null, drawing: boolean): BrushState<string> => ({ strokes, current, drawing });

  it("drops every committed stroke", () => {
    const dropped: string[] = [];
    const st = mk(["s1", "s2", "s3"], null, false);
    clearBrush(st, s => dropped.push(s));
    expect(st.strokes).toEqual([]);
    expect(dropped.sort()).toEqual(["s1", "s2", "s3"]);
  });
  it("also discards the in-progress stroke and ends the drag, so pointer-up cannot resurrect it", () => {
    const dropped: string[] = [];
    const st = mk(["s1"], "live", true);
    clearBrush(st, s => dropped.push(s));
    expect(dropped).toContain("live");
    expect(st.current).toBeNull();
    expect(st.drawing).toBe(false);
    expect(st.strokes).toEqual([]);
  });
  it("is a safe no-op on an empty brush and idempotent", () => {
    const st = mk([], null, false);
    let n = 0;
    clearBrush(st, () => { n++; }); clearBrush(st, () => { n++; });
    expect(n).toBe(0);
  });
  it("keeps the same strokes array reference (the renderer closes over it)", () => {
    const arr = ["a"];
    const st = mk(arr, null, false);
    clearBrush(st, () => {});
    expect(st.strokes).toBe(arr);
  });
  it("the renderer's brush.clear routes through clearBrush and writes back current/drawing", () => {
    expect(renderer).toMatch(/clearBrush\(st,drop\);\s*current=st\.current;drawing=st\.drawing;/);
  });
});

describe("D4 compact reader focus", () => {
  it("btnReadMap on the compact path opens the panel with focus (true), the desktop path focuses the panel", () => {
    const m = /btnReadMap\.addEventListener\("click",\(\)=>\{([\s\S]*?)\n\}\);/.exec(renderer);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).toContain("if(compactReader.matches)openReadingPanel(true);");
    expect(body).not.toContain("openReadingPanel(false)");
    expect(body).toContain("readingPanel.focus(");
  });
});
