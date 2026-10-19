import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

/** Refuse to replace another tool's hook; Git resolves linked-worktree paths. */
export function installHook(repo: string, database: string, specOut?: string): string {
  const path = execFileSync("git", ["-C", repo, "rev-parse", "--path-format=absolute", "--git-path", "hooks/post-commit"], { encoding: "utf8" }).trim();
  const dbPath = resolve(database);
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const exportLine = specOut === undefined ? "" : `${quote(process.execPath)} ${quote(cli)} export ${quote(dbPath)} --out ${quote(resolve(specOut))}\n`;
  const hook = `#!/bin/sh\nset -eu\n# isoscope post-commit\n${exportLine}touch ${quote(dbPath)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, hook, { mode: 0o755, flag: "wx" });
  return path;
}
