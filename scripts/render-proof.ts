/* render-proof.ts — the T23-class render proof for isoscope artifacts.
   Headless Chrome + CDP (Bun WebSocket). For each artifact × viewport:
   navigate, settle, assert (no h-overflow, h1 policy, canvas present & sized,
   intro veil dismissible on maps, focus-ring rule present), screenshot.
   Usage: bun scripts/render-proof.ts
   Output: advisory/2026-09-01-odin/screens/*.png + a PASS/FAIL table.        */
import { chromeProfileDir } from "./cli.ts";
import { spawn } from "child_process";
import { mkdirSync } from "fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const BASE = "http://127.0.0.1:4180";
const OUT = "advisory/2026-09-01-odin/screens";
const VIEWPORTS: Array<[number, number, string]> = [
  [320, 568, "phone-portrait"], [390, 844, "phone-large"],
  [768, 1024, "tablet-portrait-4-3"], [1024, 768, "tablet-landscape-4-3"],
  [1440, 900, "laptop"], [1920, 1080, "desktop"],
];
const ARTIFACTS: Array<{ path: string; kind: "landing" | "map" }> = [
  { path: "/", kind: "landing" },
  { path: "/odin-codebase.html", kind: "map" },
  { path: "/topology-lab.html", kind: "map" },
];

mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${chromeProfileDir("profile")}`, "--remote-allow-origins=*",
  "about:blank",
], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));

// --- minimal CDP client ---
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
function connect(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id)!; pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    };
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}
function send(ws: WebSocket, method: string, params: any = {}): Promise<any> {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t: any) => t.type === "page");
const ws = await connect(page.webSocketDebuggerUrl);
await send(ws, "Page.enable");
await send(ws, "Runtime.enable");

const results: string[] = [];
for (const art of ARTIFACTS) {
  for (const [w, h, label] of VIEWPORTS) {
    await send(ws, "Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send(ws, "Page.navigate", { url: BASE + art.path });
    await new Promise(r => setTimeout(r, w < 700 ? 2600 : 1800)); // boot + first paint
    const check = await send(ws, "Runtime.evaluate", {
      returnByValue: true, expression: `(() => {
        const de = document.scrollingElement || document.documentElement;
        const overflowX = de.scrollWidth - window.innerWidth;
        const h1s = document.querySelectorAll("h1").length;
        const canvas = document.querySelector("canvas");
        const cv = canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null;
        const veil = document.querySelector(".introveil");
        const veilVisible = veil ? getComputedStyle(veil).display !== "none" : false;
        const dismiss = [...document.querySelectorAll("button")].some(b => /GOT IT/i.test(b.textContent || ""));
        const focusRule = [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.selectorText && r.selectorText.includes("focus-visible")); } catch { return false; } });
        const clippedCells = [...document.querySelectorAll(".topbar .cell")].filter(c => c.getBoundingClientRect().right > window.innerWidth + 1).length;
        return { overflowX, h1s, cv, veilVisible, dismiss, focusRule, clippedCells, title: document.title.slice(0, 40), iw: window.innerWidth };
      })()`,
    });
    const m = check.result.value;
    const fail: string[] = [];
    if (m.overflowX > 1) fail.push(`overflowX=${m.overflowX}`);
    if (art.kind === "landing" && m.h1s !== 1) fail.push(`h1=${m.h1s}`);
    if (art.kind === "landing" && !m.focusRule) fail.push("no focus-visible rule");
    if (art.kind === "map" && !m.cv) fail.push("no canvas");
    if (art.kind === "map" && m.cv && (m.cv.w < 50)) fail.push(`canvas ${m.cv.w}x${m.cv.h}`);
    if (art.kind === "map" && m.veilVisible && !m.dismiss) fail.push("veil without dismiss");
    if (art.kind === "map" && m.clippedCells > 0) fail.push(`clipped topbar cells=${m.clippedCells}`);
    const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
    await Bun.write(`${OUT}/${art.path === "/" ? "index" : art.path.replace(/\W+/g, "-").slice(1, 24)}-${w}x${h}.png`, Buffer.from(shot.data, "base64"));
    const name = art.path === "/" ? "landing" : art.path.includes("odin") ? "codebase" : "topology";
    results.push(`${fail.length ? "FAIL" : "PASS"}  ${name.padEnd(9)} ${label.padEnd(20)} ${w}x${h}${m.iw !== w ? "(actual " + m.iw + ")" : ""}  ${fail.join(", ") || `canvas=${m.cv ? m.cv.w + "x" + m.cv.h : "-"} h1=${m.h1s}`}`);
  }
}
console.log(results.join("\n"));
const fails = results.filter(r => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} viewports PASS`);
chrome.kill();
process.exit(fails ? 1 : 0);
