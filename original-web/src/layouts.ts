/* Layout engine for the map — circuit-design placement metrics + named arrangements.

   Efficiency is scored the way circuit-board layout scores it: minimize crossings
   first (a crossing forces a bridge/via — the expensive thing), then total wire
   length (shorter traces are cheaper and cleaner). Structural defects from the
   deterministic edge-QC dominate everything.

   The shuffle button cycles a curated GALLERY, not a random walk: the top-5 most
   efficient random arrangements, plus at least one linear workflow and at least one
   phased (grouped) workflow — about 7–10 boards total. */

import { isoRouteAll } from "../../router.ts";
import { checkRoutes } from "./edge-qc";

export interface LayoutNode { id: string; x: number; y: number; w: number; d: number; g?: string }
export type EdgeSpec = [string, string, string?];
export type Positions = Record<string, { x: number; y: number }>;
export interface LayoutCandidate { name: string; kind: "efficient" | "linear" | "phased" | "random"; positions: Positions; score: number }

/* ————— circuit-design efficiency score —————
   Lower is better. Hard defects dominate; then crossings (each forces a bridge);
   then total Manhattan wirelength. This is HPWL + crossing-count, the standard
   circuit-placement objective. */
export function scoreLayout(nodes: LayoutNode[], edges: EdgeSpec[]): number {
  const out = isoRouteAll(nodes, edges) as { routes: Record<string, [number, number][]>; hops: Record<string, [number, number][]>; qc: { crossings: number } };
  const defects = checkRoutes({ routes: out.routes, hops: out.hops });
  const hard = defects.filter(d => d.kind !== "overlapping-segment").length;
  const soft = defects.length - hard;
  let wire = 0;
  for (const key of Object.keys(out.routes)) {
    const pts = out.routes[key];
    for (let i = 1; i < pts.length; i++) wire += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  }
  return hard * 10000 + soft * 500 + out.qc.crossings * 50 + wire;
}

/* apply a positions map to a fresh copy of nodes */
function place(nodes: LayoutNode[], positions: Positions): LayoutNode[] {
  return nodes.map(n => ({ ...n, x: positions[n.id]?.x ?? n.x, y: positions[n.id]?.y ?? n.y }));
}

/* grid helpers: place an ordering on a grid with per-node footprint + spacing.
   colWidth/rowHeight account for the largest node so nothing overlaps. */
function gridPositions(order: LayoutNode[], cols: number, sx: number, sz: number, serpentine: boolean): Positions {
  const out: Positions = {};
  order.forEach((n, i) => {
    let col = i % cols, row = Math.floor(i / cols);
    if (serpentine && row % 2 === 1) col = cols - 1 - col; /* snake: alternate direction per row */
    out[n.id] = { x: col * sx, y: row * sz };
  });
  return out;
}

/* a topological-ish order: nodes with fewer dependencies first, hubs toward the middle */
function flowOrder(nodes: LayoutNode[], edges: EdgeSpec[]): LayoutNode[] {
  const deg: Record<string, number> = {}; edges.forEach(e => { deg[e[0]] = (deg[e[0]] ?? 0) + 1; deg[e[1]] = (deg[e[1]] ?? 0) + 1; });
  return nodes.slice().sort((a, b) => (deg[a.id] ?? 0) - (deg[b.id] ?? 0) || a.id.localeCompare(b.id));
}

/* ————— generators ————— */

/* linear workflow: one row left-to-right (or one column top-to-bottom), in flow order */
export function genLinear(nodes: LayoutNode[], edges: EdgeSpec[], horizontal: boolean): LayoutCandidate {
  const order = flowOrder(nodes, edges);
  const sx = Math.max(...nodes.map(n => n.w)) + 1.6, sz = Math.max(...nodes.map(n => n.d)) + 1.6;
  const positions = horizontal
    ? gridPositions(order, order.length, sx, sz, false)
    : Object.fromEntries(order.map((n, i) => [n.id, { x: 0, y: i * sz }]));
  return { name: horizontal ? "Linear →" : "Linear ↓", kind: "linear", positions, score: 0 };
}

/* phased / grouped workflow: each group is a row, laid left-to-right, rows stacked
   downward (boustrophedon so the eye follows the flow across then down). */
export function genPhased(nodes: LayoutNode[], edges: EdgeSpec[]): LayoutCandidate {
  const groups = new Map<string, LayoutNode[]>();
  nodes.forEach(n => { const g = n.g ?? "default"; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(n); });
  const sx = Math.max(...nodes.map(n => n.w)) + 1.6, sz = Math.max(...nodes.map(n => n.d)) + 2.0;
  const positions: Positions = {};
  let row = 0;
  for (const [, members] of groups) {
    const ordered = flowOrder(members, edges);
    ordered.forEach((n, i) => { const col = row % 2 === 1 ? ordered.length - 1 - i : i; positions[n.id] = { x: col * sx, y: row * sz }; });
    row++;
  }
  return { name: "Phased", kind: "phased", positions, score: 0 };
}

/* random arrangement on the current bounding grid */
export function genRandom(nodes: LayoutNode[], rand: () => number): LayoutCandidate {
  const cells = nodes.map(n => ({ x: n.x, y: n.y }));
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[cells[i], cells[j]] = [cells[j], cells[i]]; }
  const positions: Positions = {};
  nodes.forEach((n, i) => { positions[n.id] = cells[i]; });
  return { name: "Shuffle", kind: "random", positions, score: 0 };
}

/* ————— the curated gallery —————
   Top-5 most efficient random boards, then guarantee at least one linear and one
   phased board. ~7–10 total. Each candidate is scored on the real router. */
export function buildGallery(nodes: LayoutNode[], edges: EdgeSpec[], seed = 1): LayoutCandidate[] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const score = (c: LayoutCandidate): number => { const placed = place(nodes, c.positions); c.score = scoreLayout(placed, edges); return c.score; };

  /* efficient candidates: many random boards, ranked */
  const randoms: LayoutCandidate[] = [];
  for (let i = 0; i < 60; i++) randoms.push(genRandom(nodes, rand));
  randoms.forEach(score);
  randoms.sort((a, b) => a.score - b.score);
  const top = randoms.slice(0, 5).map((c, i) => ({ ...c, kind: "efficient" as const, name: `Efficient ${i + 1}` }));

  const linH = genLinear(nodes, edges, true);
  const linV = genLinear(nodes, edges, false);
  const phased = genPhased(nodes, edges);
  [linH, linV, phased].forEach(score);
  const linear = linH.score <= linV.score ? linH : linV;

  return [...top, linear, phased];
}
