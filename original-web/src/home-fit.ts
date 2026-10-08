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

/* ————— D6 rework: unobstructed canvas, legible label floor, vertical centring ————— */
export interface Rect { left: number; top: number; right: number; bottom: number }

/** Smallest rendered label font size (px) the home view may use. */
export const MIN_LABEL_PX = 9;

/** Label scale floor that keeps a label of `basePx` at or above `minPx` once scaled (never above 1, never below 0.3). */
export function legibleFloor(basePx: number, minPx = MIN_LABEL_PX): number {
  if (!(basePx > 0)) return 1;
  return Math.min(1, Math.max(0.3, minPx / basePx));
}

/**
 * The part of `canvas` no floating control covers. Each obstacle removes the strip of the canvas it
 * occupies from the side it hugs (the side with the least canvas lost), so the result stays a rectangle.
 * Obstacles that do not intersect the canvas are ignored.
 */
export function unobstructedRect(canvas: Rect, obstacles: readonly Rect[], gap = 0): Rect {
  const out: Rect = { ...canvas };
  for (const o of obstacles) {
    if (!(o.right > o.left && o.bottom > o.top)) continue;
    if (o.right <= out.left || o.left >= out.right || o.bottom <= out.top || o.top >= out.bottom) continue;
    const loss = {
      left: Math.max(0, o.right + gap - out.left) * (out.bottom - out.top),
      right: Math.max(0, out.right - (o.left - gap)) * (out.bottom - out.top),
      top: Math.max(0, o.bottom + gap - out.top) * (out.right - out.left),
      bottom: Math.max(0, out.bottom - (o.top - gap)) * (out.right - out.left)
    };
    const side = (Object.keys(loss) as Array<keyof typeof loss>).reduce((a, b) => (loss[b] < loss[a] ? b : a));
    if (side === "left") out.left = o.right + gap;
    else if (side === "right") out.right = o.left - gap;
    else if (side === "top") out.top = o.bottom + gap;
    else out.bottom = o.top - gap;
  }
  return out;
}

/** Pixel translation that centres the label extents at fit zoom `s` (fraction of the reference zoom) inside `b`. */
export function centerShift(labels: readonly HomeLabel[], b: HomeBounds, s: number, k: number): { dx: number; dy: number } {
  if (!labels.length) return { dx: 0, dy: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of labels) {
    const x = l.dx * s, y = l.dy * s, hw = (l.w * k) / 2;
    x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y + l.h * k);
  }
  return { dx: (b.left + b.right) / 2 - (x0 + x1) / 2, dy: (b.top + b.bottom) / 2 - (y0 + y1) / 2 };
}
