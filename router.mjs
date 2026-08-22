/* isoscope shared router — SINGLE SOURCE OF TRUTH for routing + collision math.
   Consumed by template.html (injected at build) and drc.ts (imported).
   Two laws: (1) no transit under unconnected modules; (2) same-plane crossings
   only when unavoidable — scored, double-jog candidates, 2 rip-up passes.
   Pure data in/out: points are [x,z]; no rendering dependencies. */
function isoRouteAll(NODES, EDGES) {
 const byId = {}; NODES.forEach(n => byId[n.id] = n);
 const OBST = NODES.map(n => ({ id: n.id, x0: n.x - 0.22, x1: n.x + n.w + 0.22, z0: n.y - 0.22, z1: n.y + n.d + 0.22 }));
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
 function edgeCandidates(e) {
  const a = byId[e[0]], b = byId[e[1]];
  const ax = a.x + a.w/2, az = a.y + a.d/2, bx = b.x + b.w/2, bz = b.y + b.d/2;
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
   const cc = c.filter((p,i) => i===0 || Math.abs(p[0]-c[i-1][0])>1e-6 || Math.abs(p[1]-c[i-1][1])>1e-6);
   if (cc.length >= 2 && routeClear(cc, e[0], e[1])) out.push(cc);
  });
  if (!out.length) out.push(raw[0]);
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
 function trimEnd(pts, which, n) {
  const i = which === 0 ? 0 : pts.length-1, j = which === 0 ? 1 : pts.length-2;
  const P = pts[i], Q = pts[j], pad = -0.06;
  if (Math.abs(P[0]-Q[0]) < 1e-6) P[1] = Q[1] > P[1] ? (n.y + n.d + pad) : (n.y - pad);
  else P[0] = Q[0] > P[0] ? (n.x + n.w + pad) : (n.x - pad);
 }
 const dist = e => { const A = byId[e[0]], B = byId[e[1]]; return Math.abs(A.x-B.x) + Math.abs(A.y-B.y); };
 const order = [...EDGES].sort((e1,e2) => dist(e1) - dist(e2));
 const routed = [];
 order.forEach(e => {
  const cands = edgeCandidates(e);
  let best = null, bestCost = Infinity;
  cands.forEach(c => {
   let x = 0;
   for (let i = 1; i < c.length; i++)
    routed.forEach(r => { for (let j = 1; j < r.c.length; j++) x += xPenalty(c[i-1], c[i], r.c[j-1], r.c[j]); });
   const cost = x*100 + (c.length-2)*2 + pathLen(c);
   if (cost < bestCost) { bestCost = cost; best = c; }
  });
  routed.push({ e, c: best });
 });
 const scoreAgainst = (c, others) => {
  let x = 0;
  for (let i = 1; i < c.length; i++)
   others.forEach(r => { for (let j = 1; j < r.c.length; j++) x += xPenalty(c[i-1], c[i], r.c[j-1], r.c[j]); });
  return x;
 };
 for (let pass = 0; pass < 2; pass++)
  routed.forEach((slot, idx) => {
   const others = routed.filter((_, k) => k !== idx);
   let best = slot.c, bestCost = scoreAgainst(slot.c, others)*100 + (slot.c.length-2)*2 + pathLen(slot.c);
   edgeCandidates(slot.e).forEach(c => {
    const cost = scoreAgainst(c, others)*100 + (c.length-2)*2 + pathLen(c);
    if (cost < bestCost) { bestCost = cost; best = c; }
   });
   slot.c = best;
  });
 const routes = {}, perEdge = [];
 let weighted = 0;
 routed.forEach(slot => {
  const x = scoreAgainst(slot.c, routed.filter(r => r !== slot));
  if (x > 0) perEdge.push({ key: slot.e[0]+"-"+slot.e[1], weighted: x });
  weighted += x;
  const pts = slot.c.map(p => [p[0], p[1]]);
  trimEnd(pts, 0, byId[slot.e[0]]); trimEnd(pts, 1, byId[slot.e[1]]);
  routes[slot.e[0]+"-"+slot.e[1]] = pts;
 });
 weighted = weighted / 2; /* each pair counted from both ends */
 perEdge.sort((a,b) => b.weighted - a.weighted);
 return { routes, qc: { weighted, offenders: perEdge, edges: EDGES.length } };
}
export { isoRouteAll };
