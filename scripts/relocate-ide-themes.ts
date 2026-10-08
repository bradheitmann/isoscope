/* relocate-ide-themes.ts — extract the <style id="ide-themes"> var maps from
   template.html and emit them as a JSON payload for the runtime theme store.
   Pure transform: no hand-typed values. Usage: bun scripts/relocate-ide-themes.ts <template.html> <out-ide-themes.json> */
import { readFileSync, writeFileSync } from "fs";
import { fail, requireFile } from "./cli.ts";

const USAGE = "bun scripts/relocate-ide-themes.ts <template.html> <out-ide-themes.json>";
const [tplPath, outPath] = Bun.argv.slice(2);
if (!tplPath || !outPath) fail(USAGE, "both <template.html> and <out-ide-themes.json> are required");
requireFile(USAGE, "template", tplPath);

const src = readFileSync(tplPath, "utf8");
const m = src.match(/<style id="ide-themes">([\s\S]*?)<\/style>/);
if (!m) { console.error("FATAL: ide-themes style block not found"); process.exit(1); }
const css = m[1];

type VarMap = Record<string, string>;
const themes: Record<string, VarMap> = {};
const propSet = new Set<string>();

for (const block of css.matchAll(/\[data-style="([a-z-]+)"\]\{([^}]*)\}/g)) {
  const [, id, body] = block;
  const vars: VarMap = {};
  for (const decl of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]+)/g)) {
    const [, prop, val] = decl;
    vars[prop] = val;
    propSet.add(prop);
  }
  themes[id] = vars;
}

const props = [...propSet].sort();
const out = { props, themes };
writeFileSync(outPath, JSON.stringify(out, null, 1));

// integrity report
const counts = Object.entries(themes).map(([id, v]) => `${id}:${Object.keys(v).length}`);
console.log(`themes extracted: ${Object.keys(themes).length}`);
console.log(`distinct properties: ${props.length}`);
console.log(counts.join(" · "));
const uniform = new Set(Object.values(themes).map(v => Object.keys(v).length));
console.log(`uniform var count per theme: ${uniform.size === 1 ? "YES (" + [...uniform][0] + ")" : "NO " + [...uniform].join("/")}`);
