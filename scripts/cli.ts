/* cli.ts — shared helpers for the generator scripts: usage + clear failures,
   and a per-run Chrome profile dir that is removed on exit or on a signal. */
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

const profileDirs = new Set<string>();
let hooked = false;
function removeProfileDirs(): void {
  for (const d of profileDirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} }
  profileDirs.clear();
}

/** Fresh Chrome --user-data-dir, removed on exit and on SIGINT/SIGTERM/SIGHUP (exit codes 128+signal). */
export function chromeProfileDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `isoscope-chrome-${tag}-`));
  profileDirs.add(dir);
  if (!hooked) {
    hooked = true;
    process.on("exit", removeProfileDirs);
    for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
      process.on(sig, () => { removeProfileDirs(); process.exit(code); });
    }
  }
  return dir;
}
