import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { safeImageSrc, safeMediaSrc, vetSrc } from "../src/media-src";

const root = resolve(import.meta.dirname, "..");

describe("safeMediaSrc", () => {
  it.each([
    "/media/a.mp4", "./a.mp4", "../a.mp4", "media/x.mp4", "https://x/y.m3u8",
    "http://x/y.mp4", "blob:https://x/1234-abcd", "/media/uploads/a%20b.mp3",
  ])("allows %s", (s) => expect(safeMediaSrc(s)).toBe(s));

  it.each([
    "  javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "//evil.com/x.mp4",
    "data:text/html,<script>1</script>", "data:image/png;base64,AAAA", "file:///etc/passwd",
    "vbscript:x", "", "   ", "\\\\evil\\x",
  ])("rejects %j", (s) => expect(safeMediaSrc(s)).toBeNull());

  it.each([undefined, null, 5, {}, []])("rejects non-string %j", (v) => expect(safeMediaSrc(v)).toBeNull());
});

describe("safeImageSrc", () => {
  it("allows data:image types and normal sources", () => {
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBeTruthy();
    expect(safeImageSrc("data:image/svg+xml,<svg/>")).toBeTruthy();
    expect(safeImageSrc("/media/a.png")).toBe("/media/a.png");
  });
  it("still rejects hostile sources", () => {
    expect(safeImageSrc("data:text/html,x")).toBeNull();
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc("//evil.com/a.png")).toBeNull();
  });
});

describe("vetSrc", () => {
  it("warns once per node and src, never throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(vetSrc("javascript:1", "nodeA")).toBeNull();
    expect(vetSrc("javascript:1", "nodeA")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("nodeA");
    expect(vetSrc(undefined, "nodeB")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("renderer routes spec src through the helper", () => {
  const src = readFileSync(resolve(root, "src/original-renderer.ts"), "utf8");
  it("imports vetSrc and has no raw ref.src assignment", () => {
    expect(src).toMatch(/from "\.\/media-src"/);
    expect(src).not.toMatch(/const src=ref\.src;/);
    expect(src).not.toMatch(/img\.src=pages\[0\]/);
    expect(src).not.toMatch(/\.src\s*=\s*ref\.src/);
  });
  it("vets src in every media builder", () => {
    for (const fn of ["buildVideo", "buildImage", "buildAudioPlate"]) {
      const m = new RegExp(`function ${fn}\\([^\\n]*\\n[^\\n]*vetSrc\\(ref\\.src`).exec(src);
      expect(m, fn).not.toBeNull();
    }
  });
});

import { escapeHtml, safeLinkHref } from "../src/media-src";

describe("safeLinkHref / escapeHtml", () => {
  it.each(["https://x/y", "http://x/y", "/a/b.pdf", "./a.pdf", "blob:https://x/1"])("links %s", (s) => expect(safeLinkHref(s)).toBe(s));
  it.each(["javascript:alert(1)", " JaVaScRiPt:1", "data:text/html,x", "data:image/png;base64,AA", "//evil.com", "file:///etc/passwd", "", undefined, 5])("no link for %j", (s) => expect(safeLinkHref(s)).toBeNull());
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="a()">'&\``)).toBe("&#60;img src=x onerror=&#34;a()&#34;&#62;&#39;&#38;&#96;");
    expect(escapeHtml(undefined)).toBe("");
  });
  it("renderer routes annotation links and names through the helpers", () => {
    const r = readFileSync(resolve(root, "src/original-renderer.ts"), "utf8");
    expect(r).toContain("safeLinkHref(it.src)");
    expect(r).not.toMatch(/href="\$\{it\.src\}"/);
    expect(r).not.toMatch(/\$\{it\.name\}/);
    expect(r).toMatch(/escapeHtml\(it\.name\)/);
    expect(r).not.toMatch(/\$\{ev\.name\}/);
    expect(r).not.toMatch(/\$\{ev\["isoscope\.edge"\]\}/);
    expect(r).toMatch(/escapeHtml\(ev\.name\)/);
  });
});
