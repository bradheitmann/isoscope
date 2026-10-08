/* cli.ts — shared helpers for the generator scripts: usage + clear failures,
   and a per-run Chrome profile dir that is removed on exit. */
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/** Print `msg` (and the usage line) to stderr, exit 2. */
export function fail(usage: string, msg: string): never {
  console.error(`error: ${msg}\nusage: ${usage}`);
  process.exit(2);
}

/** Exit 1 naming the file when a required input is missing. */
export function requireFile(usage: string, role: string, path: string): string {
  if (!existsSync(path)) {
    console.error(`error: ${role} not found: ${path}\nusage: ${usage}`);
    process.exit(1);
  }
  return path;
}

/** Fresh Chrome --user-data-dir, removed when the process exits. */
export function chromeProfileDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `isoscope-chrome-${tag}-`));
  process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
  return dir;
}
