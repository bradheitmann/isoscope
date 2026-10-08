import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vendorRoot = resolve(import.meta.dirname, "..", "vendor", "desert-pants");
const MANIFEST = "CANONICAL-MANIFEST.sha256";
// Meta files that describe the vendor tree rather than being pinned upstream bytes.
const META_FILES = [MANIFEST, "PROVENANCE.md"];

// The vendor tree is enumerated from git, not the disk: tracked files are the contract, and untracked
// non-ignored files are strays that must fail. Ignored files (a local .DS_Store) are neither.
// git prints the index spelling, so comparisons stay case-exact even on macOS.
function gitList(...args: string[]): string[] {
  const out = execFileSync("git", ["ls-files", "-z", ...args], { cwd: vendorRoot, encoding: "utf8" });
  return out.split("\0").filter((p) => p !== "").sort();
}
const trackedFiles = (): string[] => gitList();
const strayFiles = (): string[] => gitList("--others", "--exclude-standard");

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
  const files = trackedFiles();
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

  it("has no untracked, non-ignored stray file under the vendor tree", () => {
    expect(strayFiles()).toEqual([]);
  });

  it("negative control: an untracked stray file is reported; an ignored .DS_Store is not", () => {
    const stray = join(vendorRoot, "STRAY-NEGATIVE-CONTROL.txt");
    const ds = join(vendorRoot, ".DS_Store");
    writeFileSync(stray, "x");
    writeFileSync(ds, "x");
    try {
      const found = strayFiles();
      expect(found).toContain("STRAY-NEGATIVE-CONTROL.txt");
      expect(found).not.toContain(".DS_Store");
      expect(trackedFiles()).not.toContain(".DS_Store");
    } finally {
      rmSync(stray, { force: true });
      rmSync(ds, { force: true });
    }
  });

  it("meta files exist", () => {
    for (const m of META_FILES) expect(files).toContain(m);
  });
});
