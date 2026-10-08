import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vendorRoot = resolve(import.meta.dirname, "..", "vendor", "desert-pants");
const MANIFEST = "CANONICAL-MANIFEST.sha256";
// Meta files that describe the vendor tree rather than being pinned upstream bytes.
const META_FILES = [MANIFEST, "PROVENANCE.md"];

// readdir returns the on-disk spelling, so these comparisons are case-exact even on macOS.
function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

function parseManifest(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!m) throw new Error(`malformed manifest line: ${line}`);
    if (map.has(m[2]!)) throw new Error(`duplicate manifest entry: ${m[2]}`);
    map.set(m[2]!, m[1]!);
  }
  return map;
}

describe("vendor/desert-pants manifest", () => {
  const files = walk(vendorRoot);
  const manifest = parseManifest(readFileSync(join(vendorRoot, MANIFEST), "utf8"));

  it("lists every vendored file with exact case (meta files named explicitly)", () => {
    const unlisted = files.filter((f) => !META_FILES.includes(f) && !manifest.has(f));
    expect(unlisted).toEqual([]);
  });

  it("has no manifest entry without a file of exactly that name", () => {
    const onDisk = new Set(files);
    const missing = [...manifest.keys()].filter((f) => !onDisk.has(f));
    expect(missing).toEqual([]);
  });

  it("matches every sha256", () => {
    const mismatched = [...manifest.entries()]
      .filter(([f]) => files.includes(f))
      .filter(([f, sha]) => createHash("sha256").update(readFileSync(join(vendorRoot, f))).digest("hex") !== sha)
      .map(([f]) => f);
    expect(mismatched).toEqual([]);
  });

  it("meta files exist", () => {
    for (const m of META_FILES) expect(files).toContain(m);
  });
});
