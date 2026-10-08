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
});
