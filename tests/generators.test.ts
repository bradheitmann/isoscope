import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
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

describe("apply-theme-relocation is idempotent and --out always writes", () => {
  const tplBody = [
    `<style id="ide-themes">.x{color:red}</style>`,
    `<script>const THEMES=[\n {id:"a"}\n];`,
    `function setTheme(id){`,
    ` document.documentElement.setAttribute("data-style",id);`,
    ` refreshTheme();paintThemeRows();`,
    `}</script>`,
  ].join("\n");
  test("second run on an already-relocated template still writes the --out copy", () => {
    const tpl = join(cwd, "idem-template.html"), json = join(cwd, "idem-themes.json");
    const out1 = join(cwd, "idem-out1.html"), out2 = join(cwd, "idem-out2.html");
    writeFileSync(tpl, tplBody);
    writeFileSync(json, JSON.stringify({ props: ["--a"], themes: { t: { "--a": "#fff" } } }));
    const first = gen("apply-theme-relocation.ts", tpl, json, "--out", out1);
    expect(first.code).toBe(0);
    expect(readFileSync(out1, "utf8")).toContain("IDE_THEMES");
    const second = gen("apply-theme-relocation.ts", out1, json, "--out", out2);
    expect(second.code).toBe(0);
    expect(existsSync(out2)).toBe(true);
    expect(readFileSync(out2, "utf8")).toBe(readFileSync(out1, "utf8"));
  });
  test("--in-place on an already-relocated template leaves it unchanged", () => {
    const tpl = join(cwd, "idem-inplace.html"), json = join(cwd, "idem-themes.json");
    writeFileSync(tpl, tplBody + "\n/* IDE_THEMES */");
    const before = readFileSync(tpl, "utf8");
    expect(gen("apply-theme-relocation.ts", tpl, json, "--in-place").code).toBe(0);
    expect(readFileSync(tpl, "utf8")).toBe(before);
  });
});
