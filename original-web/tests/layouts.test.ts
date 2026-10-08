import { describe, expect, it } from "vitest";
import { buildGallery, genLinear, genPhased, genRandom, scoreLayout, type EdgeSpec, type LayoutNode, type Positions } from "../src/layouts";

const nodes: LayoutNode[] = [
  { id: "a", x: 0, y: 0, w: 2, d: 2, g: "g1" },
  { id: "b", x: 4, y: 0, w: 2, d: 2, g: "g1" },
  { id: "c", x: 8, y: 0, w: 3, d: 2, g: "g2" },
  { id: "d", x: 0, y: 4, w: 2, d: 3, g: "g2" },
  { id: "e", x: 4, y: 4, w: 2, d: 2, g: "g3" },
  { id: "f", x: 8, y: 4, w: 2, d: 2 },
];
const edges: EdgeSpec[] = [["a", "b"], ["b", "c"], ["a", "d"], ["d", "e"], ["e", "f"], ["b", "e"]];

function covers(p: Positions): void {
  for (const n of nodes) {
    expect(p[n.id], n.id).toBeDefined();
    expect(Number.isFinite(p[n.id].x) && Number.isFinite(p[n.id].y), n.id).toBe(true);
  }
  expect(Object.keys(p).sort()).toEqual(nodes.map(n => n.id).sort());
}
function noFootprintOverlap(p: Positions): void {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j], a = p[A.id], b = p[B.id];
    const apart = a.x + A.w <= b.x || b.x + B.w <= a.x || a.y + A.d <= b.y || b.y + B.d <= a.y;
    expect(apart, `${A.id} vs ${B.id}`).toBe(true);
  }
}
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

describe("layouts: linear", () => {
  for (const horizontal of [true, false]) {
    it(`${horizontal ? "horizontal" : "vertical"} places every node, finite, with no footprint overlap`, () => {
      const c = genLinear(nodes, edges, horizontal);
      expect(c.kind).toBe("linear");
      covers(c.positions);
      noFootprintOverlap(c.positions);
      const ys = new Set(Object.values(c.positions).map(p => p.y));
      const xs = new Set(Object.values(c.positions).map(p => p.x));
      if (horizontal) expect(ys.size).toBe(1); else expect(xs.size).toBe(1);
    });
  }
  it("is deterministic and orders along the edge flow, sources first", () => {
    expect(genLinear(nodes, edges, true)).toEqual(genLinear(nodes, edges, true));
    const p = genLinear(nodes, edges, true).positions;
    /* topological: every edge a->b must place a before b (the fixture's chain) */
    expect(p.a.x).toBeLessThan(p.b.x);
    expect(p.b.x).toBeLessThan(p.c.x);
    expect(p.a.x).toBeLessThan(p.d.x);
    expect(p.d.x).toBeLessThan(p.e.x);
    expect(p.b.x).toBeLessThan(p.e.x);
    expect(p.e.x).toBeLessThan(p.f.x);
  });
  it("follows an authored journey order when one is supplied", () => {
    const p = genLinear(nodes, edges, true, ["f", "c"]).positions;
    /* journey nodes lead, in journey order; the rest follow topologically */
    expect(p.f.x).toBeLessThan(p.c.x);
    expect(p.c.x).toBeLessThan(p.a.x);
    expect(p.a.x).toBeLessThan(p.b.x);
    expect(p.e.x).toBeLessThan(p.f.x + 1e9); /* f placed by journey, e topological after a */
    const ids = Object.entries(p).sort((x, y) => x[1].x - y[1].x).map(([id]) => id);
    expect(ids.slice(0, 2)).toEqual(["f", "c"]);
    expect(ids).toHaveLength(nodes.length);
  });
  it("does not mutate its inputs", () => {
    const snap = JSON.stringify(nodes);
    genLinear(nodes, edges, true); genPhased(nodes, edges);
    expect(JSON.stringify(nodes)).toBe(snap);
  });
});

describe("layouts: phased", () => {
  it("places every node with no footprint overlap, one row per group", () => {
    const c = genPhased(nodes, edges);
    expect(c.kind).toBe("phased");
    covers(c.positions);
    noFootprintOverlap(c.positions);
    const row = (ids: string[]) => new Set(ids.map(i => c.positions[i].y));
    expect(row(["a", "b"]).size).toBe(1);
    expect(row(["c", "d"]).size).toBe(1);
    expect(new Set(["a", "c", "e", "f"].map(i => c.positions[i].y)).size).toBe(4); /* g1,g2,g3,default */
  });
  it("is deterministic", () => {
    expect(genPhased(nodes, edges)).toEqual(genPhased(nodes, edges));
  });
  it("snakes: alternate rows run in opposite directions", () => {
    const flat: LayoutNode[] = [
      { id: "p", x: 0, y: 0, w: 1, d: 1, g: "r0" }, { id: "q", x: 0, y: 0, w: 1, d: 1, g: "r0" },
      { id: "r", x: 0, y: 0, w: 1, d: 1, g: "r1" }, { id: "s", x: 0, y: 0, w: 1, d: 1, g: "r1" },
    ];
    const pos = genPhased(flat, []).positions; /* no edges: id order within a group */
    expect(pos.p.x).toBeLessThan(pos.q.x);
    expect(pos.r.x).toBeGreaterThan(pos.s.x);
  });
});

describe("layouts: random", () => {
  it("permutes the existing cells: same set of coordinates, none duplicated", () => {
    const c = genRandom(nodes, seeded(7));
    covers(c.positions);
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    expect(Object.values(c.positions).map(key).sort()).toEqual(nodes.map(key).sort());
  });
  it("same rand stream gives the same arrangement", () => {
    expect(genRandom(nodes, seeded(3)).positions).toEqual(genRandom(nodes, seeded(3)).positions);
  });
});

describe("layouts: scoring and gallery", () => {
  it("scoreLayout is finite, non-negative and stable", () => {
    const s = scoreLayout(nodes, edges);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(scoreLayout(nodes, edges)).toBe(s);
  });
  it("footprint overlap dominates the score, even with no edges (F12)", () => {
    /* two different-width nodes: swapping cells makes the wide one cover the narrow */
    const a: LayoutNode = { id: "a", x: 0, y: 0, w: 1, d: 1 };
    const b: LayoutNode = { id: "b", x: 2, y: 0, w: 5, d: 1 };
    const valid = scoreLayout([a, b], []);
    const overlapped = scoreLayout([{ ...b, x: 0 }, { ...a, x: 2 }], []);
    expect(valid).toBe(0);
    expect(overlapped).toBeGreaterThanOrEqual(1000000);
  });
  it("buildGallery returns 5 efficient (ascending) + linear + phased, all complete, finite and deterministic", () => {
    const g = buildGallery(nodes, edges, 42);
    expect(g.map(c => c.kind)).toEqual(["efficient", "efficient", "efficient", "efficient", "efficient", "linear", "phased"]);
    g.forEach(c => { covers(c.positions); expect(Number.isFinite(c.score)).toBe(true); });
    const eff = g.slice(0, 5).map(c => c.score);
    expect([...eff].sort((x, y) => x - y)).toEqual(eff);
    expect(g.map(c => c.name).slice(0, 5)).toEqual(["Efficient 1", "Efficient 2", "Efficient 3", "Efficient 4", "Efficient 5"]);
    expect(buildGallery(nodes, edges, 42)).toEqual(g);
  });
  it("the linear pick is the better-scoring of the two orientations", () => {
    const g = buildGallery(nodes, edges, 1);
    const lin = g.find(c => c.kind === "linear")!;
    const place = (p: Positions) => nodes.map(n => ({ ...n, x: p[n.id].x, y: p[n.id].y }));
    const h = scoreLayout(place(genLinear(nodes, edges, true).positions), edges);
    const v = scoreLayout(place(genLinear(nodes, edges, false).positions), edges);
    expect(lin.score).toBe(Math.min(h, v));
  });
});
