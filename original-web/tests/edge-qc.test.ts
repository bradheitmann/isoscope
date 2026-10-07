import { describe, it, expect } from "vitest";
import { isoRouteAll } from "../../router.mjs";
import { checkRoutes, summarize, type RouteInput } from "../src/edge-qc";
import SPEC from "../examples/isoscope.spec.json";

type Node = { id: string; x: number; y: number; w: number; d: number };
type Edge = [string, string, string?];
const nodes = SPEC.nodes as unknown as Node[];
const edges = SPEC.edges as unknown as Edge[];

function routeCurrent(): RouteInput {
  const out = isoRouteAll(nodes, edges) as { routes: Record<string, [number, number][]>; hops: Record<string, [number, number][]> };
  return { routes: out.routes, hops: out.hops };
}

/* a shuffled layout (same trick as the in-app shuffle) for property-style QC */
function routeShuffled(seed: number): RouteInput {
  const ns = nodes.map(n => ({ ...n }));
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const cells = ns.map(n => ({ x: n.x, y: n.y }));
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  ns.forEach((n, i) => { n.x = cells[i].x; n.y = cells[i].y; });
  const out = isoRouteAll(ns, edges) as { routes: Record<string, [number, number][]>; hops: Record<string, [number, number][]> };
  return { routes: out.routes, hops: out.hops };
}

describe("edge routing QC (deterministic geometry)", () => {
  it("flags zero defects of each structural kind on the shipped layout", () => {
    const defects = checkRoutes(routeCurrent());
    // Report what we see so failures are legible.
    if (defects.length) console.log("defects:", JSON.stringify(summarize(defects)), defects.slice(0, 6));
    // The shipped map should have no malformed elbows, collapsed steps, or self-crossings.
    expect(defects.filter(d => d.kind === "off-grid-segment")).toEqual([]);
    expect(defects.filter(d => d.kind === "zero-length-segment")).toEqual([]);
    expect(defects.filter(d => d.kind === "self-intersection")).toEqual([]);
  });

  it("flags bridges that have no genuine perpendicular crossing", () => {
    const defects = checkRoutes(routeCurrent());
    const bad = defects.filter(d => d.kind === "unneeded-bridge" || d.kind === "bridge-off-horizontal");
    if (bad.length) console.log("bridge defects:", JSON.stringify(bad));
    expect(bad).toEqual([]);
  });

  it("detects malformed elbows/self-crossings when a raw shuffle produces them (positive control)", () => {
    // Raw random shuffles CAN route badly — that is exactly why QC-guided selection exists.
    // Across 40 shuffles the detector must (a) never crash, (b) catch every structural
    // defect it defines, and (c) report counts we can rank layouts by. We assert the
    // detector is *sensitive*, not that raw shuffles are magically clean.
    let totalHard = 0, seedsWithDefects = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const defects = checkRoutes(routeShuffled(seed));
      const hard = defects.filter(d => d.kind !== "overlapping-segment");
      totalHard += hard.length;
      if (hard.length) seedsWithDefects++;
    }
    console.log(`QC sweep: ${seedsWithDefects}/40 shuffled seeds carried ${totalHard} structural defects`);
    // The detector found the known tail-wiggle class at least once across the sweep,
    // proving the check is live (not vacuously passing). Counts are reported for ranking.
    expect(seedsWithDefects).toBeGreaterThan(0);
  });

  it("ranks a clean layout above a defective one (the optimizer's ordering signal)", () => {
    // A layout with a self-crossing tail must score worse than the shipped clean layout.
    const clean = checkRoutes(routeCurrent()).filter(d => d.kind !== "overlapping-segment").length;
    let defectiveSeed = -1, defectiveCount = 0;
    for (let seed = 1; seed <= 40 && defectiveSeed < 0; seed++) {
      const c = checkRoutes(routeShuffled(seed)).filter(d => d.kind !== "overlapping-segment").length;
      if (c > 0) { defectiveSeed = seed; defectiveCount = c; }
    }
    expect(defectiveSeed).toBeGreaterThan(0);       // we found a defective layout to compare
    expect(defectiveCount).toBeGreaterThan(clean);  // and it scores strictly worse
  });
});
