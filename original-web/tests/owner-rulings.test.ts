import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(import.meta.dirname, "../src/original-renderer.ts"), "utf8");

describe("owner rulings (D5/D6/D7), static source", () => {
  it("D5: Escape and the Close button close the reader fully", () => {
    expect(src).toContain('$("closeReadingPanel").addEventListener("click",closeReadingPanel);');
    expect(src).toMatch(/else if\(readerModalOpen\)\{ev\.preventDefault\(\);closeReadingPanel\(\);\}/);
    expect(src).not.toMatch(/closeReadingPanel"\)\.addEventListener\("click",\(\)=>setSheetDetent/);
  });
  it("D7: resetView keeps ink", () => {
    const m = src.match(/function resetView\(\)\{[^\n]*/);
    expect(m).not.toBeNull();
    expect(m![0]).not.toContain("brush.clear");
    expect(m![0]).not.toContain("resetInkBackup");
  });
  it("D6: resize refits the home zoom", () => {
    expect(src).toContain("refitHome()");
    expect(src).toContain("planHomeFit("); /* planHomeFit wraps fitHomeZoom + the centring shift */
    expect(src).toMatch(/planHomeFit\(labels,[^;]*,free,HOME_ZOOM/); /* the fit bounds come from the unobstructed rect, not the window */
  });
});

import { fitHomeZoom, veryFarZoom } from "../src/home-fit";

describe("D6 home fit (behaviour)", () => {
  const labels = [{ dx: -300, dy: -100, w: 100, h: 30 }, { dx: 300, dy: 200, w: 100, h: 30 }];
  it("never raises zoom and leaves wide canvases unchanged", () => {
    expect(fitHomeZoom(labels, { left: -700, right: 700, top: -450, bottom: 450 }, 1.12, 0.15)).toBe(1.12);
  });
  it("zooms out until every label box is inside a narrow canvas", () => {
    const z = fitHomeZoom(labels, { left: -195, right: 195, top: -422, bottom: 422 }, 1.12, 0.15);
    expect(z).toBeLessThan(1.12);
    const s = z / 1.12;
    for (const l of labels) {
      expect(l.dx * s + l.w / 2).toBeLessThanOrEqual(195);
      expect(l.dx * s - l.w / 2).toBeGreaterThanOrEqual(-195);
    }
  });
  it("veryfar floor never hides labels at the fitted home zoom", () => {
    for (const home of [1.12, 0.62, 0.4, 0.2]) expect(home < veryFarZoom(home)).toBe(false);
    expect(veryFarZoom(1.12)).toBe(0.62);
  });
  it("renderer uses the veryfar floor", () => {
    expect(src).toContain("veryfar=camera.zoom<veryFarZoom(HOME.zoom)");
  });
});

describe("D6 labels stay rendered at the fitted home (static)", () => {
  it("home view is exempt from veryfar and far dimming but keeps clash hiding (A/PO-CLAUDE review fix 2)", () => {
    expect(src).toContain("const hit=placed.some(");
    expect(src).not.toContain("const hit=!(lk<1&&camera.zoom<=HOME.zoom*1.02)");
    expect(src).toContain("far=camera.zoom<0.8&&camera.zoom<HOME.zoom-0.01");
    expect(src).toContain("veryfar=camera.zoom<veryFarZoom(HOME.zoom)");
  });
});
