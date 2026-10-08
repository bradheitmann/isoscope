import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/* The committed advisory HTML was built from a gitignored .db, so geometry and
   layout fields legitimately differ from a spec rebuild. The authored prose and
   topology (title, asOf, intro, groups, links, node text) must not drift. */
const root = resolve(import.meta.dir, "..");
const RE = /<script type="application\/json" id="isospec">([\s\S]*?)<\/script>/;

type Spec = Record<string, unknown> & { nodes: Array<Record<string, unknown>> };
const NODE_TEXT = ["id", "tag", "g", "name", "does", "built", "refs"];

function content(spec: Spec): unknown {
  return {
    title: spec.title, asOf: spec.asOf, intro: spec.intro, groups: spec.groups, links: spec.links,
    nodes: spec.nodes.map((n) => Object.fromEntries(NODE_TEXT.map((k) => [k, n[k]]))),
  };
}

function embedded(html: string): string {
  const m = RE.exec(html);
  if (!m || m[1] === undefined) throw new Error("no isospec block found");
  return m[1];
}

describe("advisory artifacts", () => {
  for (const [spec, html] of [
    ["visual-a-odin-codebase.spec.json", "odin-codebase.html"],
    ["visual-b-topology-lab.spec.json", "topology-lab.html"],
  ] as const) {
    test(`${html} embeds the spec build.ts emits from ${spec}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "advisory-sync-"));
      try {
        const out = join(dir, "out.html");
        const r = Bun.spawnSync(["bun", join(root, "build.ts"), join(root, "advisory/2026-09-01-odin", spec), out], { cwd: root });
        expect(r.exitCode, new TextDecoder().decode(r.stderr)).toBe(0);
        const fresh = JSON.parse(embedded(readFileSync(out, "utf8"))) as Spec;
        const committed = JSON.parse(embedded(readFileSync(join(root, "advisory/2026-09-01-odin", html), "utf8"))) as Spec;
        expect(content(committed)).toEqual(content(fresh));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
