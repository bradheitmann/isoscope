/* build-landing.ts — splice the canonical token blocks (:root + active variant)
   from the emitted stylesheet into landing.template.html → index.html.
   Drops @font-face rules (local font stacks with fallbacks are used instead —
   no external font requests, no relative-path 404s).
   Run: bun scripts/build-landing.ts                                     */
import { readFileSync, writeFileSync } from "fs";

const canon = readFileSync("/tmp/okoa-tokens.css", "utf8");
const tpl = readFileSync("advisory/2026-09-01-odin/landing.template.html", "utf8");

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
writeFileSync("advisory/2026-09-01-odin/index.html", out);
console.log("landing built:", out.length, "bytes · tokens:", tokens.length, "bytes");
