/* Process lifecycle for the harness: free-port search, private Chrome, vite. Everything started
   here is killed by its own PID on exit, including on failure and on signals. */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export const VITE_PORTS: readonly [number, number] = [4300, 4399];
export const CDP_PORTS: readonly [number, number] = [9400, 9499];
const FORBIDDEN = new Set([4190, 9333, 8022]);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export { sleep };

function portFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

export async function freePort(range: readonly [number, number]): Promise<number> {
  const [lo, hi] = range;
  const start = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let k = 0; k <= hi - lo; k++) {
    const port = lo + ((start - lo + k) % (hi - lo + 1));
    if (FORBIDDEN.has(port)) continue;
    if (await portFree(port)) return port;
  }
  throw new Error(`no free port in ${lo}-${hi}`);
}

const owned: Array<{ name: string; child: ChildProcess }> = [];
const cleanupDirs: string[] = [];
let cleaned = false;

export async function killAll(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  for (const { child } of owned) if (child.pid && child.exitCode === null) { try { child.kill("SIGTERM"); } catch { /* already gone */ } }
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && owned.some(({ child }) => child.exitCode === null && child.signalCode === null)) await sleep(100);
  for (const { child } of owned) if (child.exitCode === null && child.signalCode === null) { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
  for (const dir of cleanupDirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}

let handlersInstalled = false;
export function installCleanupHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const bail = (code: number) => () => { void killAll().finally(() => process.exit(code)); };
  process.on("SIGINT", bail(130));
  process.on("SIGTERM", bail(143));
  process.on("SIGHUP", bail(129));
  process.on("uncaughtException", error => { console.error(error); bail(1)(); });
  process.on("unhandledRejection", error => { console.error(error); bail(1)(); });
  process.on("exit", () => {
    for (const { child } of owned) if (child.exitCode === null && child.signalCode === null) { try { child.kill("SIGKILL"); } catch { /* gone */ } }
  });
}

export function ownedPids(): Array<{ name: string; pid: number | undefined }> {
  return owned.map(({ name, child }) => ({ name, pid: child.pid }));
}

/* Newest installed Playwright headless shell (highest chromium_headless_shell-<n>), or "" when none is installed. */
function playwrightHeadlessShell(): string {
  const cache = process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? join(homedir(), "Library/Caches/ms-playwright");
  let dirs: string[] = [];
  try { dirs = readdirSync(cache); } catch { return ""; }
  const builds = dirs
    .map(d => d.match(/^chromium_headless_shell-(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const m of builds) {
    for (const arch of ["mac-arm64", "mac-x64"]) {
      const p = join(cache, m[0], `chrome-headless-shell-${arch}`, "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
  }
  return "";
}

export function findChrome(): string {
  const candidates = [
    process.env["QA_CHROME"] ?? "",
    playwrightHeadlessShell(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  for (const path of candidates) if (path && existsSync(path)) return path;
  throw new Error("no Chrome found; set QA_CHROME to a chrome/chrome-headless-shell binary");
}

export interface RunningChrome { port: number; pid: number; profile: string }

export async function launchChrome(): Promise<RunningChrome> {
  const binary = findChrome();
  const port = await freePort(CDP_PORTS);
  const profile = mkdtempSync(join(tmpdir(), "iso-qa-chrome-"));
  cleanupDirs.push(profile);
  const args = [
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--window-size=1440,900", "about:blank"
  ];
  if (!binary.includes("headless_shell") && !binary.includes("headless-shell")) args.unshift("--headless=new");
  const child = spawn(binary, args, { stdio: "ignore" });
  owned.push({ name: "chrome", child });
  child.on("error", error => console.error("chrome spawn error", error));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`chrome exited early (code ${child.exitCode}) from ${binary}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return { port, pid: child.pid ?? -1, profile };
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error("chrome did not expose CDP in time");
}

export interface RunningVite { port: number; pid: number; url: string }

export async function launchVite(appRoot: string): Promise<RunningVite> {
  const port = await freePort(VITE_PORTS);
  const bin = join(appRoot, "node_modules/.bin/vite");
  if (!existsSync(bin)) throw new Error(`vite not installed at ${bin}; run npm ci in original-web`);
  const child = spawn(bin, ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: appRoot, stdio: "ignore" });
  owned.push({ name: "vite", child });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite exited early (code ${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return { port, pid: child.pid ?? -1, url };
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("vite did not come up in time");
}
