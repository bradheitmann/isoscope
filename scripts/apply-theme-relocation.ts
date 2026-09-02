/* apply-theme-relocation.ts — one-shot, idempotent:
   1. replace the <style id="ide-themes"> block with a relocation note
   2. inject IDE_PROPS + IDE_THEMES runtime store after the THEMES array
   3. rewrite setTheme() to apply IDE palettes as inline custom properties
   Values come from /tmp/ide-themes.json (extracted by relocate-ide-themes.ts).
   Run: bun scripts/apply-theme-relocation.ts */
import { readFileSync, writeFileSync } from "fs";

const data: { props: string[]; themes: Record<string, Record<string, string>> } =
  JSON.parse(readFileSync("/tmp/ide-themes.json", "utf8"));
let src = readFileSync("template.html", "utf8");

if (src.includes("IDE_THEMES")) {
  console.log("already applied — nothing to do"); process.exit(0);
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

writeFileSync("template.html", src);
console.log("applied: CSS block excised ·",
  "IDE_THEMES injected:", Object.keys(data.themes).length, "themes ·",
  "IDE_PROPS:", data.props.length, "properties · setTheme rewritten");
