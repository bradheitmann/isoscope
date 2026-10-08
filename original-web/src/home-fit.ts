/* Home-view fit (D6): the settled home must show every node label inside the visible canvas.
   Orthographic projection is linear in zoom about the camera target, so a label's offset from the
   canvas centre scales with zoom s. Labels shrink with the scene down to a floor (labelScale), so the
   largest feasible zoom is found by bisection (feasibility is monotone in s). */
export interface HomeLabel {
  /** label anchor offset from the canvas centre, in px, at the reference zoom (x right, y down) */
  dx: number; dy: number;
  /** measured label box at scale 1 (labels are centred on the anchor x and hang below the anchor y) */
  w: number; h: number;
}
export interface HomeBounds { left: number; right: number; top: number; bottom: number } /* px, relative to the canvas centre */

/** Label scale at a zoom relative to the home reference zoom: follows the scene, floored, never above 1. */
export function labelScale(zoom: number, refZoom: number, floor = 0.55): number {
  return Math.min(1, Math.max(floor, zoom / refZoom));
}

function fits(labels: readonly HomeLabel[], b: HomeBounds, s: number, k: number, pad: number): boolean {
  for (const l of labels) {
    const x = l.dx * s, y = l.dy * s, hw = (l.w * k) / 2;
    if (x + hw > b.right - pad || x - hw < b.left + pad || y < b.top + pad || y + l.h * k > b.bottom - pad) return false;
  }
  return true;
}

/** Returns the zoom (<= zoom) at which every (scaled) label box lies inside `bounds`; never raises zoom. */
export function fitHomeZoom(labels: readonly HomeLabel[], bounds: HomeBounds, zoom: number, minZoom: number, pad = 2, floor = 1): number {
  const ok = (s: number): boolean => fits(labels, bounds, s, labelScale(zoom * s, zoom, floor), pad);
  if (ok(1)) return zoom;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return Math.max(minZoom, zoom * lo);
}

/** Zoom below which item-less labels are hidden ("veryfar"). Never above the fitted home zoom, so the settled home shows every label. */
export function veryFarZoom(homeZoom: number, base = 0.62): number {
  return Math.min(base, homeZoom - 0.01);
}
