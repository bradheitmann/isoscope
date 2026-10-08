import { describe, expect, it } from "vitest";
import { centerShift, fitHomeZoom, labelScale, legibleFloor, MIN_LABEL_PX, unobstructedRect, type HomeLabel } from "../src/home-fit";

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
