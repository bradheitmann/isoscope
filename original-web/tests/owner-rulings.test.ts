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
    expect(src).toContain("fitHomeZoom(");
  });
});
