/* Post-build check: three.js must live in its own chunk in dist/assets, and the entry chunk must
   not also bundle it. Run after `npm run build`. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assets = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "dist", "assets");
const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
const threeChunks = js.filter((f) => f.startsWith("three-"));
const failures: string[] = [];

if (threeChunks.length !== 1) failures.push(`expected exactly one three-*.js chunk, found ${threeChunks.length}`);
for (const f of js) {
  if (f.startsWith("three-")) continue;
  const src = readFileSync(join(assets, f), "utf8");
  if (src.includes("WebGLRenderer") && src.includes("OrbitControls")) failures.push(`${f} still bundles three.js`);
}
if (failures.length > 0) {
  console.error(`check:chunks FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`check:chunks ok: ${threeChunks[0]} is separate (${js.length} JS chunks)`);
