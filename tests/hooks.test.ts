import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHook } from "../hooks.ts";

test("hook arguments remain filenames and an existing hook is preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "isoscope-hook-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    const database = join(root, "spaces ' ; printf injected > marker; #.db");
    const hook = installHook(root, database);
    execFileSync("sh", [hook], { cwd: root });
    expect(existsSync(database)).toBe(true);
    expect(existsSync(join(root, "marker"))).toBe(false);
    const before = readFileSync(hook, "utf8");
    expect(() => installHook(root, database)).toThrow();
    expect(readFileSync(hook, "utf8")).toBe(before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("linked worktrees use the hook path resolved by Git", () => {
  const root = mkdtempSync(join(tmpdir(), "isoscope-worktree-"));
  try {
    const main = join(root, "main");
    execFileSync("git", ["init", "-q", main]);
    execFileSync("git", ["-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"]);
    const linked = join(root, "linked");
    execFileSync("git", ["-C", main, "worktree", "add", "-qb", "fixture", linked]);
    const hook = installHook(linked, join(root, "graph.db"));
    expect(hook).toBe(join(main, ".git/hooks/post-commit"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
