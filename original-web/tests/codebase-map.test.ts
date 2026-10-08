import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const hasBun = spawnSync("bun", ["--version"]).status === 0;
const here =dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

describe("codebase map", () => {
  it("examples/codebase.spec.json matches a fresh regeneration byte-for-byte", () => {
    /* Never skip: a skipped byte-for-byte check lets a stale map pass CI silently. */
    if (!hasBun) {
      throw new Error("bun is required for this test and was not found on PATH. Install it (https://bun.sh, or oven-sh/setup-bun in CI; pinned version in .github/workflows/ci.yml) and run: cd original-web && npm test");
    }
    const dir = mkdtempSync(join(tmpdir(), "codebase-map-test-"));
    try {
      const out = join(dir, "regen.json");
      const r = spawnSync("bun", [join(root, "scripts/codebase-graph.ts"), "--out", out], { encoding: "utf8" });
      expect(r.status, `generator failed (is bun installed?): ${r.stderr}`).toBe(0);
      const fresh = readFileSync(out, "utf8");
      const tracked = readFileSync(join(root, "examples/codebase.spec.json"), "utf8");
      expect(
        fresh === tracked,
        "examples/codebase.spec.json is stale. Regenerate with: cd original-web && bun run regen:codebase-map  (then commit it)",
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
