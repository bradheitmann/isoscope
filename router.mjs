/* isoscope shared router — SINGLE SOURCE OF TRUTH for routing + collision math.
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
 const OBST = NODES.map(n => ({ id: n.id, x0: n.x - 0.22, x1: n.x + n.w + 0.22, z0: n.y - 0.22, z1: n.y + n.d + 0.22 }));
 const HUB_DEGREE = 3, STUB = 0.35;
 function segHits(o, x0, z0, x1, z1) {
  if (Math.abs(x0 - x1) < 1e-9) return x0 > o.x0 && x0 < o.x1 && Math.max(z0, z1) > o.z0 && Math.min(z0, z1) < o.z1;
  return z0 > o.z0 && z0 < o.z1 && Math.max(x0, x1) > o.x0 && Math.min(x0, x1) < o.x1;
 }
 function routeClear(pts, skipA, skipB) {
  for (const o of OBST) {
   if (o.id === skipA || o.id === skipB) continue;
   for (let i = 1; i < pts.length; i++)
    if (segHits(o, pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1])) return false;
  }
  return true;
 }
 /* ————— R13 escape pins: every link end owns a point on its module's wall ————— */
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
 function edgeCandidates(e) {
  const A = pins[ckey(e, 0)], B = pins[ckey(e, 1)];
  const [ax, az] = A.s, [bx, bz] = B.s;
  const raw = [[[ax,az],[bx,az],[bx,bz]], [[ax,az],[ax,bz],[bx,bz]]];
  for (let off = 0.5; off <= 6; off += 0.5) {
   [Math.min(ax,bx)-off, Math.max(ax,bx)+off, (ax+bx)/2+off, (ax+bx)/2-off].forEach(mx =>
    raw.push([[ax,az],[mx,az],[mx,bz],[bx,bz]]));
   [Math.min(az,bz)-off, Math.max(az,bz)+off, (az+bz)/2+off, (az+bz)/2-off].forEach(mz =>
    raw.push([[ax,az],[ax,mz],[bx,mz],[bx,bz]]));
  }
  const mxs = [Math.min(ax,bx)-1, Math.min(ax,bx)-2.5, Math.max(ax,bx)+1, Math.max(ax,bx)+2.5, (ax+bx)/2+1, (ax+bx)/2-1];
  const mzs = [Math.min(az,bz)-1, Math.min(az,bz)-2.5, Math.max(az,bz)+1, Math.max(az,bz)+2.5, (az+bz)/2+1, (az+bz)/2-1];
  mxs.forEach(mx => mzs.forEach(mz => raw.push([[ax,az],[mx,az],[mx,mz],[bx,mz],[bx,bz]])));
  const out = [];
  raw.forEach(c => {
   const full = [A.p, ...c, B.p];
   const cc = full.filter((p,i) => i===0 || Math.abs(p[0]-full[i-1][0])>1e-6 || Math.abs(p[1]-full[i-1][1])>1e-6);
   if (cc.length >= 2 && routeClear(cc, e[0], e[1])) out.push(cc);
  });
  if (!out.length) out.push([A.p, ...raw[0], B.p]);
  return out;
 }
 function xPenalty(p1, p2, q1, q2) {
  const E = 0.05;
  const aH = Math.abs(p1[1]-p2[1]) < 1e-9, bH = Math.abs(q1[1]-q2[1]) < 1e-9;
  if (aH && !bH) {
   const hz = p1[1], hx0 = Math.min(p1[0],p2[0]), hx1 = Math.max(p1[0],p2[0]);
   const vx = q1[0], vz0 = Math.min(q1[1],q2[1]), vz1 = Math.max(q1[1],q2[1]);
   return (vx > hx0+E && vx < hx1-E && hz > vz0+E && hz < vz1-E) ? 1 : 0;
  }
  if (!aH && bH) return xPenalty(q1, q2, p1, p2);
  if (aH && bH) {
   if (Math.abs(p1[1]-q1[1]) > 0.12) return 0;
   const a0 = Math.min(p1[0],p2[0]), a1 = Math.max(p1[0],p2[0]), b0 = Math.min(q1[0],q2[0]), b1 = Math.max(q1[0],q2[0]);
   return (Math.min(a1,b1) - Math.max(a0,b0) > 0.25) ? 4 : 0;
  }
  if (Math.abs(p1[0]-q1[0]) > 0.12) return 0;
  const a0 = Math.min(p1[1],p2[1]), a1 = Math.max(p1[1],p2[1]), b0 = Math.min(q1[1],q2[1]), b1 = Math.max(q1[1],q2[1]);
  return (Math.min(a1,b1) - Math.max(a0,b0) > 0.25) ? 4 : 0;
 }
 function pathLen(c) { let L = 0; for (let i = 1; i < c.length; i++) L += Math.abs(c[i][0]-c[i-1][0]) + Math.abs(c[i][1]-c[i-1][1]); return L; }
 /* a route that leaves its pin and immediately doubles back runs under its own module: lawful, ugly */
 function backtrack(c) {
  let b = 0;
  for (let i = 2; i < c.length; i++) {
   const ux = c[i-1][0]-c[i-2][0], uz = c[i-1][1]-c[i-2][1], vx = c[i][0]-c[i-1][0], vz = c[i][1]-c[i-1][1];
   if (ux*vx + uz*vz < -1e-9) b++;
  }
  return b;
 }
 const shape = c => (c.length-2)*2 + pathLen(c) + backtrack(c)*50;
 function trimEnd(pts, which, n) {
  const i = which === 0 ? 0 : pts.length-1, j = which === 0 ? 1 : pts.length-2;
  const P = pts[i], Q = pts[j], pad = -0.06;
  if (Math.abs(P[0]-Q[0]) < 1e-6) P[1] = Q[1] > P[1] ? (n.y + n.d + pad) : (n.y - pad);
  else P[0] = Q[0] > P[0] ? (n.x + n.w + pad) : (n.x - pad);
 }
 const dist = e => { const A = byId[e[0]], B = byId[e[1]]; return Math.abs(A.x-B.x) + Math.abs(A.y-B.y); };
 const order = [...EDGES].sort((e1,e2) => dist(e1) - dist(e2));
 const pairPenalty = (c, d) => {
  let x = 0;
  for (let i = 1; i < c.length; i++) for (let j = 1; j < d.length; j++) x += xPenalty(c[i-1], c[i], d[j-1], d[j]);
  return x;
 };
 const scoreAgainst = (c, others) => { let x = 0; others.forEach(r => x += pairPenalty(c, r.c)); return x; };
 const routed = [];
 order.forEach(e => {
  let best = null, bestCost = Infinity;
  edgeCandidates(e).forEach(c => {
   const cost = scoreAgainst(c, routed)*100 + shape(c);
   if (cost < bestCost) { bestCost = cost; best = c; }
  });
  routed.push({ e, c: best });
 });
 /* rip-up passes: each route re-picks against everyone else */
 for (let pass = 0; pass < 2; pass++)
  routed.forEach((slot, idx) => {
   const others = routed.filter((_, k) => k !== idx);
   let best = slot.c, bestCost = scoreAgainst(slot.c, others)*100 + shape(slot.c);
   edgeCandidates(slot.e).forEach(c => {
    const cost = scoreAgainst(c, others)*100 + shape(c);
    if (cost < bestCost) { bestCost = cost; best = c; }
   });
   slot.c = best;
  });
 /* R16 joint shove: a crossing that neither route can fix alone may vanish when both move together */
 const TOPK = 14;
 for (let round = 0; round < 2; round++) {
  let improved = false;
  for (let i = 0; i < routed.length; i++) for (let j = i+1; j < routed.length; j++) {
   if (pairPenalty(routed[i].c, routed[j].c) === 0) continue;
   const others = routed.filter((_, k) => k !== i && k !== j);
   const cur = (scoreAgainst(routed[i].c, others) + scoreAgainst(routed[j].c, others) + pairPenalty(routed[i].c, routed[j].c))*100 + shape(routed[i].c) + shape(routed[j].c);
   const rank = e => edgeCandidates(e).map(c => ({ c, s: scoreAgainst(c, others)*100 + shape(c) })).sort((a,b) => a.s - b.s).slice(0, TOPK);
   const ci = rank(routed[i].e), cj = rank(routed[j].e);
   let best = null, bestCost = cur;
   ci.forEach(a => cj.forEach(b => {
    const cost = a.s + b.s + pairPenalty(a.c, b.c)*100;
    if (cost < bestCost - 1e-9) { bestCost = cost; best = [a.c, b.c]; }
   }));
   if (best) { routed[i].c = best[0]; routed[j].c = best[1]; improved = true; }
  }
  if (!improved) break;
 }
 /* R10: resolve shared corridors on the actual route, not in the renderer.
    Pins and escape stubs stay put; short orthogonal connectors join each lane. */
 const LANE_GAP = 0.34;
 let lanes_assigned = 0, corridors_resolved = 0;
 const laneFailures = new Map();
 const edgeKey = e => e[0]+"-"+e[1];
 const trimmed = (c, e) => {
  const pts = c.map(p => [...p]);
  trimEnd(pts, 0, byId[e[0]]); trimEnd(pts, 1, byId[e[1]]);
  return pts;
 };
 function corridorGroups() {
  const segs = [];
  routed.forEach((r, ri) => {
   for (let si = 1; si < r.c.length; si++) segs.push({ ri, si, p: r.c[si-1], q: r.c[si], key: edgeKey(r.e) });
  });
  const parent = segs.map((_, i) => i), active = new Set();
  const root = i => { while (parent[i] !== i) i = parent[i]; return i; };
  for (let i = 0; i < segs.length; i++) for (let j = i+1; j < segs.length; j++) {
   const a = segs[i], b = segs[j];
   if (a.ri === b.ri || xPenalty(a.p, a.q, b.p, b.q) !== 4) continue;
   parent[root(j)] = root(i); active.add(i); active.add(j);
  }
  const groups = new Map();
  active.forEach(i => { const k = root(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(segs[i]); });
  return [...groups.values()].map(g => g.sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.si-b.si));
 }
 const totalPenalty = paths => {
  let x = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i+1; j < paths.length; j++) x += pairPenalty(paths[i], paths[j]);
  return x;
 };
 function compactPath(pts) {
  const out = [];
  pts.forEach(p => {
   if (out.length && Math.abs(p[0]-out[out.length-1][0]) < 1e-9 && Math.abs(p[1]-out[out.length-1][1]) < 1e-9) return;
   out.push(p);
  });
  return out;
 }
 const sharedSegments = (a, b) => {
  let n = 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++)
   if (xPenalty(a[i-1], a[i], b[j-1], b[j]) === 4) n++;
  return n;
 };
 const shareCount = paths => {
  let n = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i+1; j < paths.length; j++) n += sharedSegments(paths[i], paths[j]);
  return n;
 };
 /* Recompute groups after every accepted change: segment indices are ephemeral.
    Each accepted pass must reduce sharing, bounding progress without oscillation. */
 for (;;) {
  let improved = false;
  const before = routed.map(r => trimmed(r.c, r.e));
  const oldCost = totalPenalty(before);
  const oldShares = shareCount(before);
  for (const group of corridorGroups()) {
   const changed = new Map(), moved = [];
   let reason = "";
   group.forEach((s, i) => {
    const r = routed[s.ri], delta = LANE_GAP * (i-(group.length-1)/2);
    if (Math.abs(delta) < 1e-9) return;
    if ((s.si === 1 && deg[r.e[0]] >= HUB_DEGREE) || (s.si === r.c.length-1 && deg[r.e[1]] >= HUB_DEGREE)) {
     reason = "fixed R13 escape stub"; return;
    }
    const axis = Math.abs(s.p[1]-s.q[1]) < 1e-9 ? 1 : 0;
    const p = [...s.p], q = [...s.q]; p[axis] += delta; q[axis] += delta;
    if (!changed.has(s.ri)) changed.set(s.ri, new Map());
    changed.get(s.ri).set(s.si, [p, q]); moved.push(s);
   });
   const candidate = routed.map((r, ri) => {
    const edits = changed.get(ri); if (!edits) return r.c;
    const pts = [[...r.c[0]]];
    for (let si = 1; si < r.c.length; si++) {
     if (edits.has(si)) pts.push(...edits.get(si));
     pts.push([...r.c[si]]);
    }
    return compactPath(pts);
   });
   if (!reason && [...changed.keys()].some(ri => !routeClear(candidate[ri], ...routed[ri].e.slice(0,2)))) reason = "obstacle clearance";
   const after = candidate.map((c, ri) => trimmed(c, routed[ri].e));
   if (!reason && totalPenalty(after) > oldCost) reason = "weighted cost would rise";
   if (!reason && shareCount(after) >= oldShares) reason = "connectors retain shared corridor";
   if (!reason && group.some(a => group.some(b => a.ri !== b.ri && sharedSegments(after[a.ri], after[b.ri]) > 0))) reason = "corridor members remain shared";
   /* Near-coincident original offsets can make the literal symmetric shifts
      closer than LANE_GAP. Reject those sets rather than overlap R31 arcs. */
   const axis = Math.abs(group[0].p[1]-group[0].q[1]) < 1e-9 ? 1 : 0;
   const offsets = group.map((s,i) => s.p[axis] + LANE_GAP*(i-(group.length-1)/2));
   if (!reason && offsets.some((a,i) => offsets.some((b,j) => i !== j && Math.abs(a-b) < 0.30-1e-9))) reason = "lane spacing below hop diameter";
   if (reason) {
    group.forEach(a => group.forEach(b => { if (a.key !== b.key) laneFailures.set([a.key,b.key].sort().join("|"), reason); }));
    continue;
   }
   candidate.forEach((c, ri) => routed[ri].c = c);
   lanes_assigned += moved.length; corridors_resolved++;
   improved = true; break;
  }
  if (!improved) break;
 }
 const routes = {}, perEdge = [], hops = {}, unresolved_shares = [];
 let weighted = 0, crossings = 0, shares = 0;
 routed.forEach(slot => { slot.c = trimmed(slot.c, slot.e); });
 routed.forEach(slot => {
  const x = scoreAgainst(slot.c, routed.filter(r => r !== slot));
  if (x > 0) perEdge.push({ key: slot.e[0]+"-"+slot.e[1], weighted: x });
  weighted += x;
  const pts = slot.c.map(p => [p[0], p[1]]);
  slot.key = slot.e[0]+"-"+slot.e[1];
  routes[slot.key] = pts;
 });
 weighted = weighted / 2; /* each pair counted from both ends */
 /* R31: locate every perpendicular crossing; the constant-z (horizontal) segment carries the hop */
 for (let i = 0; i < routed.length; i++) for (let j = i+1; j < routed.length; j++) {
  const P = routes[routed[i].key], Q = routes[routed[j].key];
  for (let a = 1; a < P.length; a++) for (let b = 1; b < Q.length; b++) {
   const pen = xPenalty(P[a-1], P[a], Q[b-1], Q[b]);
   if (pen === 4) {
    shares++;
    const keys = [routed[i].key, routed[j].key];
    unresolved_shares.push({ keys, segments: [a-1,b-1], reason: laneFailures.get([...keys].sort().join("|")) || "no feasible lane set" });
    continue;
   }
   if (pen !== 1) continue;
   crossings++;
   const pH = Math.abs(P[a-1][1]-P[a][1]) < 1e-9;
   const H = pH ? P : Q, V = pH ? Q : P, hk = pH ? routed[i].key : routed[j].key;
   const hi = pH ? a : b, vi = pH ? b : a;
   (hops[hk] = hops[hk] || []).push([V[vi][0], H[hi][1]]);
  }
 }
 perEdge.sort((a,b) => b.weighted - a.weighted);
 const hubs = NODES.filter(n => (deg[n.id]||0) >= HUB_DEGREE).map(n => n.id);
 return { routes, hops, qc: { weighted, crossings, shares, lanes_assigned, corridors_resolved, unresolved_shares, hops: Object.values(hops).reduce((s,h) => s+h.length, 0), hubs, offenders: perEdge, edges: EDGES.length } };
}
export { isoRouteAll };
