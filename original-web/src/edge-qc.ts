/* Deterministic edge-routing QC — fast, offline, no model.
   Runs the isometric router on a spec (or a shuffled layout) and flags geometric
   defects per edge. This is the always-on first pass; a Jev semantic layer may
   advise on the ambiguous remainder, but it never overrides these hard facts.

   Defect vocabulary (each is a structural fact about the routed polyline, not a taste call):
   - off-grid-segment: a run that is neither perfectly horizontal nor vertical (a malformed elbow)
   - zero-length-segment: consecutive duplicate points (a collapsed step)
   - self-intersection: the edge crosses one of its own non-adjacent segments
   - unneeded-bridge: a hop/bridge placed where no perpendicular line actually crosses it
   - bridge-off-horizontal: a bridge not carried on a constant-z (horizontal) segment (R31 rule)
   - overlapping-segment: two edges share a collinear run (an unresolved share the router could not separate) */

export type QCPoint = [number, number]; /* [x, z] on the ground plane */
export type EdgeDefect = {
  edge: string;
  kind: "off-grid-segment" | "zero-length-segment" | "self-intersection" | "unneeded-bridge" | "bridge-off-horizontal" | "overlapping-segment";
  detail: string;
  at?: QCPoint;
};
export type RouteInput = { routes: Record<string, QCPoint[]>; hops: Record<string, QCPoint[]> };

const EPS = 1e-6;
const isH = (a: QCPoint, b: QCPoint) => Math.abs(a[1] - b[1]) < EPS; /* constant z → horizontal */
const isV = (a: QCPoint, b: QCPoint) => Math.abs(a[0] - b[0]) < EPS; /* constant x → vertical */

function segsOf(pts: QCPoint[]): Array<[QCPoint, QCPoint]> {
  const out: Array<[QCPoint, QCPoint]> = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  return out;
}

/* proper intersection of an axis-aligned pair, one horizontal one vertical, within both bounds */
function hvCross(h: [QCPoint, QCPoint], v: [QCPoint, QCPoint]): QCPoint | null {
  const hx0 = Math.min(h[0][0], h[1][0]), hx1 = Math.max(h[0][0], h[1][0]), hz = h[0][1];
  const vz0 = Math.min(v[0][1], v[1][1]), vz1 = Math.max(v[0][1], v[1][1]), vx = v[0][0];
  if (vx >= hx0 - EPS && vx <= hx1 + EPS && hz >= vz0 - EPS && hz <= vz1 + EPS) return [vx, hz];
  return null;
}

/* do two axis-aligned segments properly cross (perpendicular), or overlap (collinear)? */
function segRel(a: [QCPoint, QCPoint], b: [QCPoint, QCPoint]): "cross" | "overlap" | "none" {
  const aH = isH(a[0], a[1]), aV = isV(a[0], a[1]);
  const bH = isH(b[0], b[1]), bV = isV(b[0], b[1]);
  if (aH && bV) return hvCross(a, b) ? "cross" : "none";
  if (aV && bH) return hvCross(b, a) ? "cross" : "none";
  if (aH && bH) { /* collinear horizontal overlap */
    if (Math.abs(a[0][1] - b[0][1]) > EPS) return "none";
    const a0 = Math.min(a[0][0], a[1][0]), a1 = Math.max(a[0][0], a[1][0]);
    const b0 = Math.min(b[0][0], b[1][0]), b1 = Math.max(b[0][0], b[1][0]);
    return Math.min(a1, b1) - Math.max(a0, b0) > EPS ? "overlap" : "none";
  }
  if (aV && bV) {
    if (Math.abs(a[0][0] - b[0][0]) > EPS) return "none";
    const a0 = Math.min(a[0][1], a[1][1]), a1 = Math.max(a[0][1], a[1][1]);
    const b0 = Math.min(b[0][1], b[1][1]), b1 = Math.max(b[0][1], b[1][1]);
    return Math.min(a1, b1) - Math.max(a0, b0) > EPS ? "overlap" : "none";
  }
  return "none";
}

export function checkRoutes(input: RouteInput): EdgeDefect[] {
  const defects: EdgeDefect[] = [];
  const keys = Object.keys(input.routes);

  for (const key of keys) {
    const pts = input.routes[key];
    if (!pts || pts.length < 2) { defects.push({ edge: key, kind: "zero-length-segment", detail: "route has fewer than 2 points" }); continue; }

    /* per-segment structure */
    const segs = segsOf(pts);
    segs.forEach((s, i) => {
      const [a, b] = s;
      if (Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS)
        defects.push({ edge: key, kind: "zero-length-segment", detail: `segment ${i} is a duplicate point`, at: a });
      else if (!isH(a, b) && !isV(a, b))
        defects.push({ edge: key, kind: "off-grid-segment", detail: `segment ${i} is diagonal (elbow not orthogonal)`, at: a });
    });

    /* self-intersection: a segment properly crosses a non-adjacent segment of the same edge */
    for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) {
      if (segRel(segs[i], segs[j]) === "cross")
        defects.push({ edge: key, kind: "self-intersection", detail: `segment ${i} crosses its own segment ${j}`, at: segs[i][0] });
    }
  }

  /* bridges: every hop must sit on a real perpendicular crossing with another edge,
     carried on a horizontal segment (R31). Flag hops with no genuine crossing. */
  for (const key of keys) {
    const hops = input.hops[key] ?? [];
    if (!hops.length) continue;
    const segs = segsOf(input.routes[key]);
    for (const hop of hops) {
      /* the hop must lie on one of THIS edge's horizontal segments */
      const onH = segs.some(s => isH(s[0], s[1]) &&
        Math.abs(s[0][1] - hop[1]) < EPS &&
        hop[0] >= Math.min(s[0][0], s[1][0]) - EPS && hop[0] <= Math.max(s[0][0], s[1][0]) + EPS);
      if (!onH) { defects.push({ edge: key, kind: "bridge-off-horizontal", detail: "bridge not carried on a horizontal segment", at: hop }); continue; }
      /* and some OTHER edge must genuinely cross it here (perpendicular) */
      const crossed = keys.some(other => {
        if (other === key) return false;
        return segsOf(input.routes[other]).some(os => isV(os[0], os[1]) &&
          Math.abs(os[0][0] - hop[0]) < EPS &&
          hop[1] >= Math.min(os[0][1], os[1][1]) - EPS && hop[1] <= Math.max(os[0][1], os[1][1]) + EPS);
      });
      if (!crossed) defects.push({ edge: key, kind: "unneeded-bridge", detail: "bridge placed where no perpendicular line crosses", at: hop });
    }
  }

  /* unresolved shares: two edges overlapping a collinear run */
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = segsOf(input.routes[keys[i]]), B = segsOf(input.routes[keys[j]]);
    for (const sa of A) for (const sb of B) {
      if (segRel(sa, sb) === "overlap")
        defects.push({ edge: `${keys[i]}|${keys[j]}`, kind: "overlapping-segment", detail: "two edges share a collinear run", at: sa[0] });
    }
  }

  return defects;
}

/* a one-line summary for reports and tests */
export function summarize(defects: EdgeDefect[]): Record<string, number> {
  const by: Record<string, number> = {};
  defects.forEach(d => { by[d.kind] = (by[d.kind] ?? 0) + 1; });
  return by;
}
