import { describe, expect, it } from "vitest";
import { fitHomeZoom, type HomeBounds } from "../src/home-fit";

const B: HomeBounds = { left: -195, right: 195, top: -422, bottom: 422 };

describe("fitHomeZoom", () => {
  it("never raises zoom when everything already fits", () => {
    expect(fitHomeZoom([{ dx: 10, dy: 10, w: 80, h: 20 }], B, 1.12, 0.35)).toBe(1.12);
  });
  it("shrinks zoom until a wide-offset label box is inside the bounds", () => {
    const z = fitHomeZoom([{ dx: 400, dy: 0, w: 100, h: 20 }], B, 1.12, 0.35);
    expect(z).toBeLessThan(1.12);
    const s = z / 1.12;
    expect(400 * s + 50).toBeLessThanOrEqual(B.right);
  });
  it("handles left and vertical overflow", () => {
    const z = fitHomeZoom([{ dx: -500, dy: 900, w: 60, h: 20 }], B, 1, 0.1);
    const s = z;
    expect(-500 * s - 30).toBeGreaterThanOrEqual(B.left);
    expect(900 * s + 20).toBeLessThanOrEqual(B.bottom);
  });
  it("respects the minimum zoom", () => {
    expect(fitHomeZoom([{ dx: 1e6, dy: 0, w: 10, h: 10 }], B, 1.12, 0.35)).toBe(0.35);
  });
});
