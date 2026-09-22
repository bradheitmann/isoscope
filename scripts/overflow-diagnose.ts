/* overflow-diagnose.ts — at a given viewport, list the elements of a generated isoscope artifact that
   escape the horizontal viewport (right edge > layout width), self-scroll, or clip their own text.
   Real Chrome (headless=new) over CDP through --remote-debugging-pipe: no debugging port, no loopback
   socket, no server. The artifact is a file:// URL; network is DEFAULT-DENY except the pinned
   three@0.160.0 jsDelivr package the artifact's importmap requests. Temporary profile, removed on exit.
   Usage: node scripts/overflow-diagnose.ts <artifact.html> [width=768] [height=1024] [--mobile] [--intro] */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.RENDER_PROOF_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const mobile = args.includes("--mobile"), keepIntro = args.includes("--intro");
const [artifact, w = "768", h = "1024"] = args.filter(a => !a.startsWith("--"));
if (!artifact || !artifact.endsWith(".html")) { console.error("usage: node scripts/overflow-diagnose.ts <artifact.html> [width] [height] [--mobile] [--intro]"); process.exit(2); }
const url = pathToFileURL(resolve(artifact)).href;
/* Pinned CDN matcher — exact-match (disposition v2 CDN matcher repair). The importmap's pinned
   three@0.160.0 dependency resolves to exactly these 7 URLs (root module + transitive examples/jsm
   imports), as recorded in the 2026-09-21 DEV and independent-QA network disclosures. Any other URL —
   including any other package path under the same prefix — is denied. */
const PINNED_CDN_URLS = new Set([
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/Line2.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineGeometry.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineMaterial.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineSegments2.js",
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js",
]);
const ALLOW = (u: string) => /^(file|data|about|blob):/.test(u) || PINNED_CDN_URLS.has(u);

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
class CDP {
  private id = 0; private pending = new Map<number, Pending>(); private buf: Buffer = Buffer.alloc(0);
  private w: NodeJS.WritableStream; events: Array<(m: any) => void> = [];
  constructor(child: ChildProcess) {
    this.w = child.stdio[3] as NodeJS.WritableStream;
    (child.stdio[4] as NodeJS.ReadableStream).on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]); let i: number;
      while ((i = this.buf.indexOf(0)) >= 0) {
        const s = this.buf.subarray(0, i).toString("utf8"); this.buf = this.buf.subarray(i + 1);
        let m: any; try { m = JSON.parse(s); } catch { continue; }
        if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id)!; this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
        else if (m.method) this.events.forEach(f => f(m));
      }
    });
  }
  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id; const msg: any = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    this.w.write(JSON.stringify(msg) + "\0");
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)); } }, 30000); });
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "isoscope-overflow-diag-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--disable-sync", "--disable-background-networking", "--disable-component-update", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
/* F-HARNESS-001 owned-profile repair: the profile is owned by this process alone; removal waits for
   Chrome to exit so a still-shutting-down Chrome cannot recreate the directory after deletion. */
const cleanup = async () => {
  try { chrome.kill(); } catch {}
  try { await Promise.race([new Promise(r => chrome.once("close", r)), sleep(3000)]); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
const cleanupSync = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanupSync); /* abnormal-exit fallback only; the normal path awaits cleanup() */
process.on("SIGINT", () => { cleanupSync(); process.exit(130); });
process.on("SIGTERM", () => { cleanupSync(); process.exit(143); });
const cdp = new CDP(chrome); await sleep(400);
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
const S = (method: string, params: any = {}) => cdp.send(method, params, sessionId);
const denied: string[] = [];
cdp.events.push(async (m: any) => {
  if (m.method !== "Fetch.requestPaused" || m.sessionId !== sessionId) return;
  const u = m.params.request.url;
  try { if (ALLOW(u)) await S("Fetch.continueRequest", { requestId: m.params.requestId }); else { denied.push(u); await S("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" }); } } catch {}
});
await S("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
await S("Page.enable"); await S("Runtime.enable");
await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__rpReady=false;window.addEventListener("isoscope-ready",()=>{window.__rpReady=true;});` });
await S("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: mobile ? 2 : 1, mobile });
await S("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
const ev = async (expression: string) => (await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
await S("Page.navigate", { url });
for (let t = 0; t < 200 && !(await ev("window.__rpReady===true").catch(() => false)); t++) await sleep(100);
if (!keepIntro) { await ev(`localStorage.setItem("isoscope.introSeen","1"); document.getElementById("introVeil").hidden=true; true`); }
await sleep(300);
const res = await ev(`(() => {
  const lw = document.documentElement.clientWidth, iw = window.innerWidth, ih = window.innerHeight, out = [], clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || el.closest("#labels")) continue;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
    let p = el.parentElement, inScroller = false; /* content of an intentional horizontal scroller is not an overflow defect */
    while (p && p !== document.body) { const ps = getComputedStyle(p); if (ps.overflowX === "auto" || ps.overflowX === "scroll") { inScroller = true; break; } p = p.parentElement; }
    if (inScroller) continue;
    if (r.right > lw + 1 || r.width > lw + 1) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), id: el.id, right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || "").trim().slice(0, 40) });
    const cx = (cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1;
    const cy = (cs.overflowY === "hidden" || cs.overflowY === "clip") && el.scrollHeight > el.clientHeight + 1;
    if ((cx || cy) && !el.classList.contains("panel")) clipped.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), id: el.id, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
  }
  const de = document.scrollingElement;
  const box = id => { const e = document.getElementById(id) || document.querySelector(id); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  return { innerWidth: iw, innerHeight: ih, layoutWidth: lw, visualScale: window.visualViewport ? window.visualViewport.scale : 1, scrollWidth: de.scrollWidth, coarse: matchMedia("(pointer: coarse)").matches, regions: { topbar: box(".topbar"), side: box(".side"), canvas: box("canvasWrap"), panel: box(".panel"), hint: box(".hint") }, offenders: out.slice(0, 20), clipped: clipped.slice(0, 20) };
})()`);
res.denied_requests = [...new Set(denied)];
await cleanup();
res.owned_profile = { path: profile, owned: "this process only (mkdtemp under system tmpdir)", absent_after_cleanup: !existsSync(profile) };
console.log(JSON.stringify(res, null, 1));
