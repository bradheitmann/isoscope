/* apply-theme-relocation.ts — one-shot, idempotent:
   1. replace the <style id="ide-themes"> block with a relocation note
   2. inject IDE_PROPS + IDE_THEMES runtime store after the THEMES array
   3. rewrite setTheme() to apply IDE palettes as inline custom properties
   Values come from the ide-themes.json written by relocate-ide-themes.ts.
   Usage: bun scripts/apply-theme-relocation.ts <template.html> <ide-themes.json> (--out <path> | --in-place) */
import { readFileSync, writeFileSync } from "fs";
import { fail, requireFile } from "./cli.ts";

const USAGE = "bun scripts/apply-theme-relocation.ts <template.html> <ide-themes.json> (--out <path> | --in-place)";
const argv = Bun.argv.slice(2);
const inPlace = argv.includes("--in-place");
const oi = argv.indexOf("--out");
const outArg = oi >= 0 ? argv[oi + 1] : undefined;
const pos = argv.filter((a, i) => !a.startsWith("--") && !(oi >= 0 && i === oi + 1));
if (pos.length !== 2) fail(USAGE, "need exactly <template.html> and <ide-themes.json>");
if (inPlace && oi >= 0) fail(USAGE, "--out and --in-place are mutually exclusive");
if (oi >= 0 && (!outArg || outArg.startsWith("--"))) fail(USAGE, "--out needs a path");
if (!inPlace && oi < 0) fail(USAGE, "pass --out <path>, or --in-place to rewrite the template");
const [tplPath, jsonPath] = pos;
const outPath = inPlace ? tplPath : outArg!;
requireFile(USAGE, "template", tplPath);
requireFile(USAGE, "ide-themes json", jsonPath);

const data: { props: string[]; themes: Record<string, Record<string, string>> } =
  JSON.parse(readFileSync(jsonPath, "utf8"));
let src = readFileSync(tplPath, "utf8");

if (src.includes("IDE_THEMES")) {
  if (outPath !== tplPath) writeFileSync(outPath, src); /* --out always yields a file */
  console.log(outPath !== tplPath ? `already applied — wrote unchanged copy to ${outPath}` : "already applied — nothing to do"); process.exit(0);
}

// 1. excise the static IDE-theme CSS
const styleRe = /<style id="ide-themes">[\s\S]*?<\/style>/;
if (!styleRe.test(src)) { console.error("FATAL: ide-themes block not found"); process.exit(1); }
src = src.replace(styleRe,
  `<style id="ide-themes">/* IDE theme palettes relocated to the runtime store (IDE_THEMES) — static CSS carries canon variants only. */</style>`);

// 2. inject the runtime store right after the THEMES array literal
const themesStart = src.indexOf("const THEMES=[");
const themesEnd = src.indexOf("\n];", themesStart);
if (themesStart < 0 || themesEnd < 0) { console.error("FATAL: THEMES array not found"); process.exit(1); }
const store = `\n/* ————— runtime IDE theme store (values relocated verbatim from static CSS) ————— */\n` +
  `const IDE_PROPS=${JSON.stringify(data.props)};\n` +
  `const IDE_THEMES=${JSON.stringify(data.themes)};`;
src = src.slice(0, themesEnd + 3) + store + src.slice(themesEnd + 3);

// 3. rewrite setTheme
const oldFn = `function setTheme(id){
 document.documentElement.setAttribute("data-style",id);
 refreshTheme();paintThemeRows();
}`;
if (!src.includes(oldFn)) { console.error("FATAL: setTheme not found in expected shape"); process.exit(1); }
const newFn = `function setTheme(id){
 IDE_PROPS.forEach(p=>document.documentElement.style.removeProperty(p));
 const ide=IDE_THEMES[id];
 if(ide){Object.entries(ide).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));document.documentElement.removeAttribute("data-style");}
 else document.documentElement.setAttribute("data-style",id);
 refreshTheme();paintThemeRows();
}`;
src = src.replace(oldFn, newFn);

writeFileSync(outPath, src);
console.log("applied: CSS block excised ·",
  "IDE_THEMES injected:", Object.keys(data.themes).length, "themes ·",
  "IDE_PROPS:", data.props.length, "properties · setTheme rewritten");
