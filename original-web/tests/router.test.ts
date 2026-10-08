/* Fixture provenance: router-original.json = isoRouteAll(spec.nodes, spec.edges) from the ORIGINAL
   router.mjs (`git show b76b003:router.mjs`, evaluated without writing a .mjs file) over every root
   examples/*.spec.json, JSON round-tripped. Re-verified after the wave-4 self-map sync: byte-identical
   per spec. To regenerate, run that same function on each spec and write { "<file>.spec.json": result }
   with keys sorted; never regenerate from router.ts. */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isoRouteAll, type RouterEdge, type RouterNode } from "../../router.ts";

/* The router was ported from router.mjs to strict TS (D28). The fixture was generated
   from the ORIGINAL router.mjs (commit b76b003) over every root examples/*.spec.json; the TS
   router must reproduce it exactly (routes, hops and qc). */
const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "../../examples");
const fixture = JSON.parse(readFileSync(join(here, "fixtures/router-original.json"), "utf8")) as Record<string, unknown>;
const specs = readdirSync(examplesDir).filter((f) => f.endsWith(".spec.json")).sort();

describe("router.ts equivalence with the original router.mjs", () => {
  it("fixture covers every root example spec", () => {
    expect(Object.keys(fixture).sort()).toEqual(specs);
  });
  for (const f of specs) {
    it(`routes ${f} identically`, () => {
      const spec = JSON.parse(readFileSync(join(examplesDir, f), "utf8")) as { nodes: RouterNode[]; edges: RouterEdge[] };
      expect(JSON.parse(JSON.stringify(isoRouteAll(spec.nodes, spec.edges)))).toEqual(fixture[f]);
    });
  }
});
