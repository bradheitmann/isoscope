import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const root = resolve(import.meta.dir, "..");
const cwd = mkdtempSync(join(tmpdir(), "isoscope-gen-test-"));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

function gen(script: string, ...args: string[]) {
  const p = Bun.spawnSync([process.execPath, join(root, "scripts", script), ...args], { cwd });
  return { code: p.exitCode, err: p.stderr.toString() };
}
const missing = (name: string) => join(cwd, name);

describe("generators fail clearly on missing input", () => {
  test("relocate-ide-themes: missing template", () => {
    const r = gen("relocate-ide-themes.ts", missing("nope.html"), missing("out.json"));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("nope.html");
    expect(r.err).toContain("usage:");
    expect(existsSync(missing("out.json"))).toBe(false);
  });
  test("relocate-ide-themes: no args prints usage", () => {
    const r = gen("relocate-ide-themes.ts");
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("usage:");
  });
  test("apply-theme-relocation: missing json, and no implicit in-place", () => {
    const tpl = missing("template.html");
    writeFileSync(tpl, "<html></html>");
    const r = gen("apply-theme-relocation.ts", tpl, missing("ide.json"), "--out", missing("o.html"));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("ide.json");
    const r2 = gen("apply-theme-relocation.ts", tpl, missing("ide.json"));
    expect(r2.code).not.toBe(0);
    expect(r2.err).toContain("--in-place");
  });
  test("apply-theme-relocation: missing template", () => {
    const r = gen("apply-theme-relocation.ts", missing("t.html"), missing("ide.json"), "--in-place");
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("t.html");
  });
  test("build-landing: missing tokens css", () => {
    const r = gen("build-landing.ts", missing("okoa-tokens.css"), missing("l.html"), missing("o.html"));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("okoa-tokens.css");
    expect(r.err).not.toContain("/tmp/okoa-tokens.css");
  });
  test("contrast-proof: missing built html (no Chrome launched)", () => {
    const r = gen("contrast-proof.ts", missing("iso-check.html"));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("iso-check.html");
    const r2 = gen("contrast-proof.ts");
    expect(r2.code).not.toBe(0);
    expect(r2.err).toContain("usage:");
  });
});
