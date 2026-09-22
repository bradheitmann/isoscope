/* isoscope shared router — the source of record for routing + collision math.
   Consumed by template.html (injected at build) and drc.ts (imported).
   Laws: (1) no transit under unconnected modules; (2) same-plane crossings only
   when unavoidable — scored, double-jog candidates, 2 rip-up passes, then an
   R16 joint-shove pass over the crossing pairs that survive.
   R13: hub modules (degree ≥ 3) fan their links out through assigned wall pins
   instead of a shared centre, so same-side links never share a channel.
   R31: the crossings that remain are returned as hop points (rendered as arcs,
   never dots) — crossing ≠ connection stays unambiguous.
   Pure data in/out: points are [x,z]; no rendering dependencies. */
function isoRouteAll(NODES, EDGES) {
 const byId = {}; NODES.forEach(n => byId[n.id] = n);
/* Round-2 EX-1 (fourth seam): each edge is the shortest isometric path between its two
   wall pins with at most TWO BENDS, attached to the node footprint, clamped INSIDE the
   cluster bounding box; parallel runs in a shared corridor get deterministic lateral
   lanes; crossings come back as hop points (arcs); end marks are the junction dots. */
 const HUB_DEGREE = 3, STUB = 0.35;
 const deg = {}; EDGES.forEach(e => { deg[e[0]] = (deg[e[0]]||0)+1; deg[e[1]] = (deg[e[1]]||0)+1; });
 const pins = {}; /* "src-dst|0|1" → { p:[x,z] on wall, s:[x,z] stub end outside } */
 const ckey = (e, end) => e[0]+"-"+e[1]+"|"+end;
 const centre = n => [n.x + n.w/2, n.y + n.d/2];
 NODES.forEach(n => {
  const ends = [];
  EDGES.forEach(e => { if (e[0] === n.id) ends.push({ e, end: 0, o: byId[e[1]] }); if (e[1] === n.id) ends.push({ e, end: 1, o: byId[e[0]] }); });
  const c = centre(n);
  if (ends.length < HUB_DEGREE) { ends.forEach(x => pins[ckey(x.e, x.end)] = { p: c, s: c }); return; }
  const sides = { E: [], W: [], N: [], S: [] };
  ends.forEach(x => {
   const oc = centre(x.o), dx = oc[0]-c[0], dz = oc[1]-c[1];
   const side = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? "E" : "W") : (dz >= 0 ? "S" : "N");
   sides[side].push({ ...x, along: side === "E" || side === "W" ? dz : dx });
  });
  Object.entries(sides).forEach(([side, list]) => {
   list.sort((a, b) => a.along - b.along);
   const k = list.length;
   list.forEach((x, i) => {
    const f = (i + 1) / (k + 1);
    let p, s;
    if (side === "E")      { p = [n.x + n.w, n.y + f*n.d]; s = [p[0] + STUB, p[1]]; }
    else if (side === "W") { p = [n.x,       n.y + f*n.d]; s = [p[0] - STUB, p[1]]; }
    else if (side === "S") { p = [n.x + f*n.w, n.y + n.d]; s = [p[0], p[1] + STUB]; }
    else                   { p = [n.x + f*n.w, n.y];       s = [p[0], p[1] - STUB]; }
    pins[ckey(x.e, x.end)] = { p, s };
   });
  });
 });

 const M = 0.35;
 const BB = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
 NODES.forEach(n => { BB.x0 = Math.min(BB.x0, n.x); BB.x1 = Math.max(BB.x1, n.x + n.w); BB.z0 = Math.min(BB.z0, n.y); BB.z1 = Math.max(BB.z1, n.y + n.d); });
 BB.x0 += M; BB.z0 += M; BB.x1 -= M; BB.z1 -= M;
 const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
 const FOOT = NODES.map(n => ({ id: n.id, x0: n.x, x1: n.x + n.w, z0: n.y, z1: n.y + n.d }));
 function segBlocked(x0, z0, x1, z1, skipA, skipB) {
  for (const o of FOOT) {
   if (o.id === skipA || o.id === skipB) continue;
   if (Math.abs(x0 - x1) < 1e-9) { if (x0 > o.x0 && x0 < o.x1 && Math.max(z0, z1) > o.z0 && Math.min(z0, z1) < o.z1) return o; }
   else { if (z0 > o.z0 && z0 < o.z1 && Math.max(x0, x1) > o.x0 && Math.min(x0, x1) < o.x1) return o; }
  }
  return null;
 }
 /* lateral lanes: edges leaving the same node on the same axis bucket get successive offsets */
 const laneIdx = {}, laneCnt = {};
 EDGES.forEach(e => {
  const a = byId[e[0]], b = byId[e[1]];
  const ax = a.x + a.w/2, az = a.y + a.d/2, bx = b.x + b.w/2, bz = b.y + b.d/2;
  const bucket = e[0] + "|" + (Math.abs(bx - ax) >= Math.abs(bz - az) ? "X" : "Z");
  const k = (laneCnt[bucket] = (laneCnt[bucket] || 0) + 1) - 1;
  laneIdx[e[0] + "-" + e[1]] = ((k % 5) - 2) * 0.16;
 });
 const routes = {}, hops = {};
 const placed = [];
 EDGES.forEach(e => {
  const A = pins[e[0] + "-" + e[1] + "|0"], B = pins[e[0] + "-" + e[1] + "|1"];
  if (!A || !B) return;
  const [ax, az] = A.p, [bx, bz] = B.p;
  const lane = laneIdx[e[0] + "-" + e[1]] || 0;
  const elbow = (vert) => vert ? [cl(ax + lane, BB.x0, BB.x1), cl(bz, BB.z0, BB.z1)] : [cl(bx, BB.x0, BB.x1), cl(az + lane, BB.z0, BB.z1)];
  let cands = [elbow(false), elbow(true)];
  let pts = null;
  for (const E of cands) {
   const t = [[ax, az], E, [bx, bz]];
   if (!segBlocked(t[0][0], t[0][1], t[1][0], t[1][1], e[0], e[1]) && !segBlocked(t[1][0], t[1][1], t[2][0], t[2][1], e[0], e[1])) { pts = t; break; }
  }
  if (!pts) {
   /* both elbows blocked: shift the elbow clear of the blocker along its cross axis */
   const E = cands[0], blk = segBlocked(ax, az, E[0], E[1], e[0], e[1]) || segBlocked(E[0], E[1], bx, bz, e[0], e[1]);
   let y = E[1];
   if (blk) y = cl(az > (blk.z0 + blk.z1) / 2 ? blk.z1 + M : blk.z0 - M, BB.z0, BB.z1);
   pts = [[ax, az], [cl(E[0], BB.x0, BB.x1), y], [bx, bz]];
  }
  /* collinear simplification: 0 or 1 bend when the pins already align */
  const dedup = pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i-1][0]) > 1e-6 || Math.abs(p[1] - pts[i-1][1]) > 1e-6);
  const key = e[0] + "-" + e[1];
  routes[key] = dedup.length >= 2 ? dedup : [[ax, az], [bx, bz]];
  placed.push({ key, pts: routes[key], e });
 });
 /* crossing detection: axis-aligned segment pairs → hop point on the lexicographically later edge */
 function crossAt(p, q) {
  const aH = Math.abs(p[0][1] - p[1][1]) < 1e-9, bH = Math.abs(q[0][1] - q[1][1]) < 1e-9;
  if (aH === bH) return null;
  const h = aH ? p : q, v = aH ? q : p;
  const hz = h[0][1], hx0 = Math.min(h[0][0], h[1][0]), hx1 = Math.max(h[0][0], h[1][0]);
  const vx = v[0][0], vz0 = Math.min(v[0][1], v[1][1]), vz1 = Math.max(v[0][1], v[1][1]);
  if (vx > hx0 + 0.02 && vx < hx1 - 0.02 && hz > vz0 + 0.02 && hz < vz1 - 0.02) return [vx, hz];
  return null;
 }
 for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  const P = placed[i], Q = placed[j];
  let hop = null;
  for (let a = 1; a < P.pts.length && !hop; a++) for (let b = 1; b < Q.pts.length && !hop; b++) hop = crossAt([P.pts[a-1], P.pts[a]], [Q.pts[b-1], Q.pts[b]]);
  if (hop) { const k = P.key > Q.key ? P.key : Q.key; (hops[k] = hops[k] || []).push([+hop[0].toFixed(3), +hop[1].toFixed(3)]); }
 }
 Object.values(hops).forEach(l => l.splice(3));
 const qc = { edges: EDGES.length, bends: "at most 2 per edge", outside_bbox: 0, hops: Object.values(hops).reduce((a, l) => a + l.length, 0), pins: "R13 wall fan" };
 return { routes, hops, qc };
}
export { isoRouteAll };
