/* build-landing.ts — splice the canonical token blocks (:root + active variant)
   from the emitted stylesheet into landing.template.html → index.html.
   Drops @font-face rules (local font stacks with fallbacks are used instead —
   no external font requests, no relative-path 404s).
   Usage: bun scripts/build-landing.ts <okoa-tokens.css> <landing.template.html> <out.html> */
import { readFileSync, writeFileSync } from "fs";
import { fail, requireFile } from "./cli.ts";

const USAGE = "bun scripts/build-landing.ts <okoa-tokens.css> <landing.template.html> <out.html>";
const [cssPath, tplPath, outPath] = Bun.argv.slice(2);
if (!cssPath || !tplPath || !outPath) fail(USAGE, "<okoa-tokens.css>, <landing.template.html> and <out.html> are all required");
requireFile(USAGE, "tokens css (from okoa_emit_stylesheet)", cssPath);
requireFile(USAGE, "landing template", tplPath);

const canon = readFileSync(cssPath, "utf8");
const tpl = readFileSync(tplPath, "utf8");

function extractBlock(openRe: RegExp): string {
  const start = canon.search(openRe);
  if (start < 0) throw new Error("block not found: " + openRe);
  let i = canon.indexOf("{", start), depth = 0, end = -1;
  for (; i < canon.length; i++) {
    if (canon[i] === "{") depth++;
    else if (canon[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error("unbalanced block: " + openRe);
  return canon.slice(start, end);
}

const rootBlock = extractBlock(/^:root\{/m);                                    // scale tokens (type, space, motion, z, radii)
const variantBlock = extractBlock(/^:root, \[data-style="ridgeline"\]\{/m);   // active variant (combined default selector)
const tokens = `/* canonical design tokens — emitted stylesheet v3, embedded (font-faces dropped; local stacks used) */\n${rootBlock}\n${variantBlock}`;

if (!tpl.includes("/*__OKOA_TOKENS__*/")) throw new Error("marker missing from template");
const out = tpl.replace("/*__OKOA_TOKENS__*/", tokens);
writeFileSync(outPath, out);
console.log("landing built:", out.length, "bytes · tokens:", tokens.length, "bytes");
