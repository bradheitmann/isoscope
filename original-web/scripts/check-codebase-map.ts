/* Fails when examples/codebase.spec.json differs from a fresh regeneration.
   Fix: `bun run regen:codebase-map` (in original-web) and commit the result. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const tracked = resolve(here, "../examples/codebase.spec.json");
const dir = mkdtempSync(join(tmpdir(), "codebase-map-"));
try {
  const out = join(dir, "regen.json");
  const r = spawnSync("bun", [join(here, "codebase-graph.ts"), "--out", out], { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(`generator failed: ${r.stderr}\n`);
    process.exit(2);
  }
  if (readFileSync(out, "utf8") !== readFileSync(tracked, "utf8")) {
    process.stderr.write(
      "examples/codebase.spec.json is stale vs a fresh regeneration.\n" +
        "Regenerate with: (cd original-web && bun run regen:codebase-map) and commit it.\n",
    );
    process.exit(1);
  }
  process.stdout.write("codebase map is up to date\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
