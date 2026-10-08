import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

describe("CI bun pin", () => {
  it("every setup-bun bun-version equals the root packageManager pin", () => {
    const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { packageManager?: string };
    const m = /^bun@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? "");
    expect(m, "root package.json packageManager must be bun@<x.y.z>").not.toBeNull();
    const ci = readFileSync(join(repo, ".github/workflows/ci.yml"), "utf8");
    const pins = [...ci.matchAll(/bun-version:\s*([0-9.]+)/g)].map((x) => x[1]);
    expect(pins.length).toBeGreaterThan(0);
    for (const v of pins) expect(v).toBe(m![1]);
  });

  /* split the workflow into { jobName: body } without a YAML dependency (jobs are 2-space keys) */
  function jobs(ci: string): Record<string, string> {
    const after = ci.split(/^jobs:\s*$/m)[1] ?? "";
    const out: Record<string, string> = {};
    let name = "";
    for (const line of after.split("\n")) {
      const k = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (k) { name = k[1]!; out[name] = ""; } else if (name) out[name] += line + "\n";
    }
    return out;
  }

  it("every job that runs npm test or bun has a setup-bun step pinned to a 40-hex SHA, all the same SHA", () => {
    const ci = readFileSync(join(repo, ".github/workflows/ci.yml"), "utf8");
    const all = jobs(ci);
    expect(Object.keys(all).length).toBeGreaterThan(0);
    const shas = new Set<string>();
    let needing = 0;
    for (const [name, body] of Object.entries(all)) {
      if (!/run:\s*(?:npm test|npm run test|bun\b)/.test(body)) continue;
      needing++;
      const uses = [...body.matchAll(/uses:\s*oven-sh\/setup-bun@(\S+)/g)].map((x) => x[1]!);
      expect(uses.length, `job "${name}" runs npm test/bun but has no setup-bun step`).toBeGreaterThan(0);
      for (const ref of uses) {
        expect(ref, `job "${name}" setup-bun must be pinned to a 40-hex SHA`).toMatch(/^[0-9a-f]{40}$/);
        shas.add(ref);
      }
    }
    expect(needing).toBeGreaterThan(0);
    expect(shas.size, "all setup-bun uses must share one SHA").toBe(1);
  });

  it("original-web job runs qa:static; root job sparse-checks-out without public/media; push is limited to main", () => {
    const ci = readFileSync(join(repo, ".github/workflows/ci.yml"), "utf8");
    const all = jobs(ci);
    expect(all["original-web"]).toMatch(/run:\s*bun run qa:static/);
    expect(all["root"]).toMatch(/sparse-checkout:[\s\S]*!\/original-web\/public\/media\//);
    expect(ci).toMatch(/push:\n\s+branches:\s*\[main\]/);
  });
});
