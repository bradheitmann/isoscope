import { describe, expect, it } from "vitest";
import { centerShift, fitHomeZoom, labelScale, legibleFloor, legibleScale, MAX_LEGIBLE_SCALE, MIN_CAP_PX, MIN_LABEL_PX, planHomeFit, unobstructedRect, type HomeLabel } from "../src/home-fit";

describe("unobstructedRect", () => {
  const canvas = { left: 0, top: 57, right: 390, bottom: 844 };
  it("returns the canvas when nothing covers it", () => {
    expect(unobstructedRect(canvas, [])).toEqual(canvas);
    expect(unobstructedRect(canvas, [{ left: 500, top: 0, right: 600, bottom: 50 }])).toEqual(canvas);
  });
  it("takes a corner button from the cheaper side", () => {
    const r = unobstructedRect(canvas, [{ left: 12, top: 69, right: 56, bottom: 113 }]);
    expect(r).toEqual({ left: 0, top: 113, right: 390, bottom: 844 });
  });
  it("takes a tall rail from the left and a docked strip from the right", () => {
    const r = unobstructedRect({ left: 0, top: 57, right: 768, bottom: 1024 }, [
      { left: 12, top: 69, right: 56, bottom: 800 }, { left: 748, top: 57, right: 768, bottom: 1000 }
    ], 4);
    expect(r.left).toBe(60);
    expect(r.right).toBe(744);
  });
  it("takes an open bottom sheet from the bottom", () => {
    const r = unobstructedRect(canvas, [{ left: 0, top: 500, right: 390, bottom: 844 }]);
    expect(r.bottom).toBe(500);
  });
});

describe("legibility floor", () => {
  it("never lets a label render under the minimum font size", () => {
    const base = 10.8, floor = legibleFloor(base);
    expect(floor * base).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-9);
    expect(labelScale(0.01, 1.12, floor) * base).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-9);
  });
  it("is 1 for a font already at or under the minimum and tolerates bad input", () => {
    expect(legibleFloor(9)).toBe(1);
    expect(legibleFloor(0)).toBe(1);
  });
  it("makes the fit zoom smaller than a shrinkable label would, so legibility wins over fit", () => {
    const labels: HomeLabel[] = [{ dx: 190, dy: 0, w: 120, h: 14 }, { dx: -190, dy: 40, w: 120, h: 14 }];
    const b = { left: -183, right: 183, top: -300, bottom: 300 };
    const shrinkable = fitHomeZoom(labels, b, 1.12, 0.1, 2, 0.55);
    const legible = fitHomeZoom(labels, b, 1.12, 0.1, 2, legibleFloor(10.8));
    expect(legible).toBeLessThan(shrinkable);
  });
});

describe("centerShift", () => {
  const b = { left: -183, right: 183, top: -300, bottom: 300 };
  it("is zero for a scene already centred", () => {
    const s = centerShift([{ dx: -50, dy: -20, w: 20, h: 10 }, { dx: 50, dy: 20, w: 20, h: 10 }], b, 1, 1);
    expect(s.dx).toBeCloseTo(0);
    expect(s.dy).toBeCloseTo(-5, 5); /* extents -20..30 -> centre 5 */
  });
  it("moves a low scene up and the result centres the extents", () => {
    const labels: HomeLabel[] = [{ dx: 0, dy: 100, w: 40, h: 10 }, { dx: 0, dy: 220, w: 40, h: 10 }];
    const s = centerShift(labels, b, 0.5, 1);
    const y0 = 100 * 0.5 + s.dy, y1 = 220 * 0.5 + 10 + s.dy;
    expect((y0 + y1) / 2).toBeCloseTo(0);
    expect(s.dy).toBeLessThan(0);
  });
  it("handles an empty scene", () => {
    expect(centerShift([], b, 1, 1)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("legibleScale (cap-height floor)", () => {
  it("enlarges a label whose cap height is under the minimum, never shrinks one above it", () => {
    const s = legibleScale(11, 0.73);
    expect(s).toBeGreaterThan(1);
    expect(11 * s * 0.73).toBeGreaterThanOrEqual(MIN_CAP_PX - 1e-9);
    expect(legibleScale(20, 0.73) * 20 * 0.73).toBeGreaterThanOrEqual(MIN_CAP_PX - 1e-9);
  });
  it("is bounded and tolerates bad input", () => {
    expect(legibleScale(2, 0.7)).toBe(MAX_LEGIBLE_SCALE);
    expect(legibleScale(0, 0.7)).toBe(1);
    expect(legibleScale(11, 0)).toBeCloseTo(MIN_LABEL_PX / 11);
  });
  it("labelScale honours a floor above 1 but is unchanged for floors at or under 1", () => {
    expect(labelScale(0.3, 1.12, 1.2)).toBe(1.2);
    expect(labelScale(2, 1.12, 0.55)).toBe(1);
    expect(labelScale(0.1, 1.12, 0.55)).toBe(0.55);
  });
});

describe("planHomeFit (the pure core of refitHome)", () => {
  const canvas = { left: 0, top: 57, right: 390, bottom: 844 };
  const labels: HomeLabel[] = [{ dx: -260, dy: -150, w: 90, h: 14 }, { dx: 260, dy: 150, w: 90, h: 14 }];
  it("fits inside the unobstructed rectangle, not the whole canvas", () => {
    const whole = planHomeFit(labels, canvas, canvas, 1.12, 1);
    const free = { left: 0, top: 57, right: 390, bottom: 500 };
    const narrow = planHomeFit(labels, canvas, free, 1.12, 1);
    expect(narrow.zoom).toBeLessThanOrEqual(whole.zoom);
    expect(narrow.bounds.bottom).toBeLessThan(whole.bounds.bottom);
    const x = (l: HomeLabel): number => l.dx * (narrow.zoom / 1.12);
    for (const l of labels) expect(Math.abs(x(l)) + l.w / 2).toBeLessThanOrEqual(195 + 1e-6);
  });
  it("centres the fitted extents in the unobstructed rectangle when it had to zoom out", () => {
    const free = { left: 60, top: 120, right: 390, bottom: 800 };
    const p = planHomeFit(labels, canvas, free, 1.12, 1);
    expect(p.zoom).toBeLessThan(1.12);
    const s = p.zoom / 1.12;
    const ys = labels.map(l => l.dy * s + p.shift.dy);
    const mid = ((Math.min(...ys)) + (Math.max(...ys) + 14)) / 2;
    expect(mid).toBeCloseTo((p.bounds.top + p.bounds.bottom) / 2, 4);
  });
  it("leaves a scene that already fits exactly as it was (wide home)", () => {
    const wide = { left: 0, top: 0, right: 1440, bottom: 900 };
    const p = planHomeFit(labels, wide, wide, 1.12, 1);
    expect(p.zoom).toBe(1.12);
    expect(p.shift).toEqual({ dx: 0, dy: 0 });
  });
});
