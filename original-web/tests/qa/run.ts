/* Isoscope QA harness entry point.
   bun tests/qa/run.ts            full run (private headless Chrome + vite on free ports)
   bun tests/qa/run.ts --static   no browser: typography var() resolution over token/dist CSS
   Optional: --only=<contract>[,<contract>] with navigation,viewport,modal,resize,gestures,motion,scene,typography */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { computedTypography, staticTypography } from "./typography";
import { Recorder } from "./report";
import {
  gestureContract, modalContracts, navigationContracts, reducedMotionContract, resizeContract,
  scene100Contract, viewportMatrix, openApp, type Ctx
} from "./contracts";
import { installCleanupHandlers, killAll, launchChrome, launchVite, ownedPids } from "./procs";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const staticOnly = args.includes("--static");
const onlyArg = args.find(a => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
const want = (name: string): boolean => only === null || only.has(name);

async function main(): Promise<number> {
  installCleanupHandlers();
  const rec = new Recorder();
  const tuples = staticTypography(rec, appRoot);
  if (staticOnly) {
    console.log(rec.summary());
    return rec.results.some(r => r.status === "fail") ? 1 : 0;
  }

  const outDir = join(appRoot, "tests/qa/out");
  mkdirSync(outDir, { recursive: true });
  const vite = await launchVite(appRoot);
  const chrome = await launchChrome();
  console.log(`vite pid ${vite.pid} on :${vite.port}; chrome pid ${chrome.pid} on :${chrome.port}; screenshots in ${outDir}`);
  const ctx: Ctx = { chromePort: chrome.port, appUrl: vite.url, outDir, rec };

  const run = async (name: string, fn: () => Promise<void>): Promise<void> => {
    if (!want(name)) return;
    try { await fn(); } catch (error) {
      rec.add({ contract: name, name: "harness error", status: "fail", detail: error instanceof Error ? error.message : String(error) });
    }
  };
  await run("typography", async () => {
    const s = await openApp(ctx, 1440, 900);
    try { await computedTypography(rec, s, tuples); } finally { await s.close(); }
  });
  await run("navigation", () => navigationContracts(ctx));
  await run("viewport", () => viewportMatrix(ctx));
  await run("modal", () => modalContracts(ctx));
  await run("resize", () => resizeContract(ctx));
  await run("gestures", () => gestureContract(ctx));
  await run("motion", () => reducedMotionContract(ctx));
  await run("scene", () => scene100Contract(ctx));

  console.log(rec.summary());
  return rec.results.some(r => r.status === "fail") ? 1 : 0;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(error);
} finally {
  const pids = ownedPids();
  await killAll();
  console.log(`cleanup: stopped ${pids.map(p => `${p.name}:${p.pid}`).join(", ") || "nothing"}`);
}
process.exit(code);
