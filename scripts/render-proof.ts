/* render-proof.ts — matrix-v2 render proof for isoscope artifacts.
   Real Chrome (headless=new) driven over CDP through --remote-debugging-pipe (fds 3/4): no debugging
   port, no loopback socket, no server of any kind. Artifacts are opened as file:// URLs only, inside
   an isolated temporary profile (mkdtemp) that is deleted on exit — the user's Chrome is never touched.
   Chrome is started with spawn(argv[]) — no shell, no string interpolation into a command line.
   Usage:
     node scripts/render-proof.ts [--out DIR] [--template template.html] [--viewports all|id,id]
                                  [--states all|id,id] [--user-viewport WxH] <artifact.html> [...]
   Output: DIR/<artifact>--<viewport>--<state>.png, DIR/index.json (sha256 digests, measurements,
   verdicts bound to artifact + template digests), and a PASS/FAIL table on stdout. Exit 1 on FAIL.
   Network: CDP Fetch interception in DEFAULT-DENY mode. Only file:// reads and the exact pinned
   three@0.160.0 jsDelivr package the artifact's importmap requests are allowed; everything else
   (web fonts, any other host) is failed with BlockedByClient. Every allowed request's URL, HTTP status
   and response-body sha256, and every denied URL, are written to --network-disclosure (JSON).
   Assertions R1–R12 follow d-responsive-current-state-edge-viewport-matrix-v2.json. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.RENDER_PROOF_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

type Viewport = { id: string; w: number; h: number; dsf: number; mobile: boolean; touch: boolean; note?: string };
const MATRIX_V2: Viewport[] = [
  { id: "desk-narrow-1024", w: 1024, h: 768, dsf: 1, mobile: false, touch: false },
  { id: "desk-narrow-1180", w: 1180, h: 800, dsf: 1, mobile: false, touch: false },
  { id: "laptop-1280", w: 1280, h: 800, dsf: 1, mobile: false, touch: false, note: "2026-09-07 V-2 footer occlusion" },
  { id: "laptop-1440", w: 1440, h: 900, dsf: 1, mobile: false, touch: false },
  { id: "desk-wide-1920", w: 1920, h: 1080, dsf: 1, mobile: false, touch: false },
  { id: "ipad-mini-portrait", w: 744, h: 1133, dsf: 2, mobile: true, touch: true },
  { id: "ipad-mini-landscape", w: 1133, h: 744, dsf: 2, mobile: true, touch: true },
  { id: "tablet-834", w: 834, h: 1112, dsf: 2, mobile: true, touch: true },
  { id: "phone-390", w: 390, h: 844, dsf: 3, mobile: true, touch: true, note: "2026-09-07 V-1 intro dismiss off-viewport" },
  { id: "phone-320", w: 320, h: 568, dsf: 2, mobile: true, touch: true },
];
const STATES = [
  "first-visit-intro", "intro-dismissed", "legend-open", "inspector-node-selected", "edge-selected",
  "settings-open", "after-resize-wide-to-narrow", "after-resize-narrow-to-wide",
] as const;
type State = (typeof STATES)[number];
const ALLOWED_STORAGE_KEYS = ["isoscope.theme", "isoscope.introSeen"];

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUT = resolve(opt("--out", "/tmp/d-dev-stage-a/screens")!);
const TEMPLATE = resolve(opt("--template", "template.html")!);
const vpSel = opt("--viewports", "all")!;
const stSel = opt("--states", "all")!;
const userVp = opt("--user-viewport");
const NET_DISCLOSURE = resolve(opt("--network-disclosure", "/tmp/d-dev-stage-a/network-disclosure.json")!);
/* Pinned CDN matcher — exact-match, digest-bound (disposition v2 CDN matcher repair).
   The importmap's pinned engine dependency (three@0.160.0, accepted existing property, not vendored)
   resolves to exactly these 7 URLs: the root module plus its transitive examples/jsm imports.
   Digests are the response-body SHA-256 values observed identically across the DEV and independent-QA
   network disclosures of 2026-09-21. Any other URL — any other host, package, version, or package
   path under the same prefix — is denied. A pinned URL whose observed digest differs is denied too:
   unpinned bytes never reach the page. */
const PINNED_CDN: Record<string, { sha256: string; bytes: number }> = {
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js": { sha256: "76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495", bytes: 1272972 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js": { sha256: "5a44a9e86a2a0fb11933eed69bc2cd33c76a496854c1aed6ed776efa87d7b064", bytes: 29868 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/Line2.js": { sha256: "f926f3c903983abbf10e7a30dc5908df71dc6a20117eb67f0f758344d4a76f93", bytes: 433 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineGeometry.js": { sha256: "b7e1952c8891dc7840a9119ce03eeb547825663c831851bd73baf305d4c61c46", bytes: 1458 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineMaterial.js": { sha256: "eed69bd471547ca0d15e0e87722530317d5d514f533585948086515c5f308234", bytes: 11281 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineSegments2.js": { sha256: "5009e85ffbd09e86003509f7d1001642cfe7594d42192facdde516fcd4418d24", bytes: 9330 },
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js": { sha256: "59419cee5eccbaacfab5939871308ee262a63761815f72ff49cbd217fd84fdb7", bytes: 4632 },
};
const ALLOW_SCHEMES = ["file:", "data:", "about:", "blob:"];
const artifacts = argv.filter(a => !a.startsWith("--")).map(a => resolve(a));
if (!artifacts.length) { console.error("usage: node scripts/render-proof.ts [--out DIR] [--viewports ...] [--states ...] [--user-viewport WxH] <artifact.html> [...]"); process.exit(2); }
for (const a of artifacts) if (!a.endsWith(".html")) { console.error(`refusing non-HTML artifact ${a}`); process.exit(2); }

const viewports: Viewport[] = vpSel === "all" ? [...MATRIX_V2] : MATRIX_V2.filter(v => vpSel.split(",").includes(v.id));
if (userVp) {
  const m = /^(\d+)x(\d+)$/.exec(userVp);
  if (!m) { console.error("--user-viewport must be WxH"); process.exit(2); }
  viewports.push({ id: "user-current-chrome", w: +m[1], h: +m[2], dsf: 2, mobile: false, touch: false, note: "measured content viewport supplied by operator" });
}
const states: State[] = stSel === "all" ? [...STATES] : STATES.filter(s => stSel.split(",").includes(s));

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const templateBytes = readFileSync(TEMPLATE);
const templateSha = sha256(templateBytes);

// ---------- CDP over the debugging pipe (fd 3 = to Chrome, fd 4 = from Chrome; \0-delimited JSON) ----------
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
class CDP {
  private id = 0;
  private pending = new Map<number, Pending>();
  private buf: Buffer = Buffer.alloc(0);
  private events: Array<(m: any) => void> = [];
  private w: NodeJS.WritableStream;
  constructor(child: ChildProcess) {
    this.w = child.stdio[3] as NodeJS.WritableStream;
    const r = child.stdio[4] as NodeJS.ReadableStream;
    r.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      let i: number;
      while ((i = this.buf.indexOf(0)) >= 0) {
        const s = this.buf.subarray(0, i).toString("utf8");
        this.buf = this.buf.subarray(i + 1);
        let m: any; try { m = JSON.parse(s); } catch { continue; }
        if (m.id && this.pending.has(m.id)) {
          const p = this.pending.get(m.id)!; this.pending.delete(m.id);
          m.error ? p.reject(new Error(`${m.error.code} ${m.error.message}`)) : p.resolve(m.result);
        } else if (m.method) this.events.forEach(f => f(m));
      }
    });
  }
  onEvent(f: (m: any) => void) { this.events.push(f); }
  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    const msg: any = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    this.w.write(JSON.stringify(msg) + "\0");
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)); } }, 30000);
    });
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "isoscope-render-proof-"));
mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "--window-size=1920,1080", "--disable-sync", "--disable-background-networking",
  "--disable-component-update", "--no-service-autorun", "--disable-default-apps", "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
/* F-HARNESS-001 owned-profile repair: this profile is owned by this process alone (mkdtemp under the
   system tmpdir; never a shared path, never the user's browser profile). Removal waits for Chrome to
   exit first — deleting the directory while Chrome was still shutting down let Chrome recreate files,
   which is how a profile survived an earlier run and had to be removed by QA. */
let profileRemoved = false;
const cleanup = async () => {
  try { chrome.kill(); } catch {}
  try { await Promise.race([new Promise(r => chrome.once("close", r)), sleep(3000)]); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  profileRemoved = !existsSync(profile);
};
const cleanupSync = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanupSync); /* abnormal-exit fallback only; the normal path awaits cleanup() */
process.on("SIGINT", () => { cleanupSync(); process.exit(130); });
process.on("SIGTERM", () => { cleanupSync(); process.exit(143); });
const cdp = new CDP(chrome);
await sleep(400);
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
const S = (method: string, params: any = {}) => cdp.send(method, params, sessionId);
await S("Page.enable"); await S("Runtime.enable");
// ---------- default-deny network interception (Fetch domain), request + response stages ----------
type NetRec = { url: string; status: number | null; sha256: string | null; bytes: number | null; count: number; mime?: string; expected_sha256?: string; digest_match?: boolean };
const netAllowed = new Map<string, NetRec>(), netDenied = new Map<string, number>();
const digestMismatches: Array<{ url: string; expected: string; observed: string | null }> = [];
const isAllowed = (url: string) => ALLOW_SCHEMES.some(s => url.startsWith(s)) || Object.hasOwn(PINNED_CDN, url);
cdp.onEvent(async (m: any) => {
  if (m.method !== "Fetch.requestPaused" || m.sessionId !== sessionId) return;
  const p = m.params, url: string = p.request.url, rid = p.requestId;
  try {
    if (!isAllowed(url)) { netDenied.set(url, (netDenied.get(url) || 0) + 1); await S("Fetch.failRequest", { requestId: rid, errorReason: "BlockedByClient" }); return; }
    if (p.responseStatusCode === undefined && !p.responseErrorReason) { await S("Fetch.continueRequest", { requestId: rid }); return; } // request stage: allowed → proceed
    const rec = netAllowed.get(url) || { url, status: null, sha256: null, bytes: null, count: 0 };
    rec.count++; rec.status = p.responseStatusCode ?? null;
    rec.mime = (p.responseHeaders || []).find((h: any) => h.name.toLowerCase() === "content-type")?.value;
    if (p.responseStatusCode && p.responseStatusCode < 300 && p.responseStatusCode !== 204) {
      try { const body = await S("Fetch.getResponseBody", { requestId: rid }); const buf = Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8"); rec.sha256 = sha256(buf); rec.bytes = buf.length; } catch (e: any) { rec.sha256 = "unavailable: " + e.message; }
    }
    netAllowed.set(url, rec);
    const pin = Object.hasOwn(PINNED_CDN, url) ? PINNED_CDN[url] : undefined;
    if (pin) {
      rec.expected_sha256 = pin.sha256;
      rec.digest_match = rec.sha256 === pin.sha256;
      if (!rec.digest_match) {
        digestMismatches.push({ url, expected: pin.sha256, observed: rec.sha256 });
        await S("Fetch.failRequest", { requestId: rid, errorReason: "BlockedByClient" }); /* pinned URL, unpinned bytes: deny */
        return;
      }
    }
    await S("Fetch.continueRequest", { requestId: rid });
  } catch { /* request already gone */ }
});
await S("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }, { urlPattern: "*", requestStage: "Response" }] });
await S("Network.enable"); await S("Network.setCacheDisabled", { cacheDisabled: true });
function writeNetworkDisclosure() {
  const doc = { schema: "isoscope.render_proof.network_disclosure.v2", generated_at: new Date().toISOString(), mode: "default-deny (CDP Fetch interception, request+response stages); CDN access limited to an exact-match pinned URL list with response-body SHA-256 verification", allow_rules: { schemes: ALLOW_SCHEMES, exact_urls: Object.keys(PINNED_CDN) }, cookies_credentials: "none (fresh temporary profile; no sign-in; sync and background networking disabled)", cache: "disabled (every allowed response body hashed on each fetch)", allowed: [...netAllowed.values()], denied: [...netDenied.entries()].map(([url, count]) => ({ url, count })), digest_mismatches: digestMismatches, artifact_posture: "CDN-dependent, not self-contained (three@0.160.0 from jsDelivr)" };
  mkdirSync(resolve(NET_DISCLOSURE, ".."), { recursive: true });
  writeFileSync(NET_DISCLOSURE, JSON.stringify(doc, null, 1));
  return doc;
}
await S("Page.addScriptToEvaluateOnNewDocument", { source: `window.__rpReady=false;window.addEventListener("isoscope-ready",()=>{window.__rpReady=true;});` });

const evaluate = async (expression: string) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("page exception: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
async function setViewport(v: Viewport) {
  await S("Emulation.setDeviceMetricsOverride", { width: v.w, height: v.h, deviceScaleFactor: v.dsf, mobile: v.mobile, screenWidth: v.w, screenHeight: v.h });
  await S("Emulation.setTouchEmulationEnabled", { enabled: v.touch, maxTouchPoints: v.touch ? 5 : 1 });
  await S("Emulation.setEmitTouchEventsForMouse", { enabled: v.touch, configuration: v.touch ? "mobile" : "desktop" });
}
async function setReducedMotion(on: boolean) {
  await S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "" }] });
}
async function waitReady(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await evaluate("window.__rpReady===true")) { await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))"); await sleep(250); return true; } } catch {}
    await sleep(100);
  }
  return false;
}
async function navigate(url: string) { await S("Page.navigate", { url }); return waitReady(); }
async function reload() { await S("Page.reload"); return waitReady(); }
async function shot(path: string) {
  const r = await S("Page.captureScreenshot", { format: "png" });
  const bytes = Buffer.from(r.data, "base64");
  writeFileSync(path, bytes);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}
async function clickAt(x: number, y: number, touch: boolean) {
  if (touch) {
    await S("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await S("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await S("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await S("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await S("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  await sleep(120);
}

// ---------- in-page measurement (pure DOM reads; nothing mutated except sidebar scroll for R5) ----------
const MEASURE = `(() => {
  const iw = window.innerWidth, ih = window.innerHeight;
  const de = document.scrollingElement || document.documentElement;
  const lw = document.documentElement.clientWidth, scale = window.visualViewport ? window.visualViewport.scale : 1;
  const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < lw && r.top < ih; };
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const inter = (a, b, tol) => a.x < b.r - tol && a.r > b.x + tol && a.y < b.b - tol && a.b > b.y + tol;
  const desc = (el, sel) => [...el.querySelectorAll(sel)].filter(vis);
  const layer = el => el.closest(".introveil, .drawer") || document.body;
  const canvasWrap = document.getElementById("canvasWrap"), topbar = document.querySelector(".topbar");
  const panel = document.querySelector(".panel"), side = document.querySelector(".side"), hint = document.querySelector(".hint");
  const veil = document.getElementById("introVeil"), dismiss = document.getElementById("introDismiss");
  const out = { iw, ih, layoutWidth: lw, scale, scrollWidth: de.scrollWidth, coarse: matchMedia("(pointer: coarse)").matches, reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, title: document.title };
  const cw = canvasWrap ? box(canvasWrap) : null; out.canvas = cw;
  out.r2_intrusions = [];
  if (topbar && cw) for (const el of [topbar, ...desc(topbar, "*")]) { const b = box(el); if (inter(b, cw, 1)) out.r2_intrusions.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), id: el.id, box: b }); }
  out.topbar = topbar ? box(topbar) : null;
  const controls = [...document.querySelectorAll("button, a[href], input:not(.vh-toggle), select, textarea, summary, label[for], [role=button]")].filter(vis);
  const headings = [...document.querySelectorAll(".panel h1, .panel .eyebrow, .panel .sub, .drawer h3, .introcard h2, .introcard h3, .side .grouphead")].filter(vis);
  out.r3_overlaps = [];
  for (const c of controls) for (const h of headings) { if (h.contains(c) || c.contains(h) || layer(c) !== layer(h)) continue; const cb = box(c), hb = box(h); if (inter(cb, hb, 1)) out.r3_overlaps.push({ control: c.id || c.className, heading: h.id || h.className || h.tagName, cb, hb }); }
  out.veilVisible = vis(veil);
  if (out.veilVisible && dismiss) { const b = box(dismiss); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const hit = document.elementFromPoint(cx, cy); out.r4 = { box: b, inside: b.x >= 0 && b.y >= 0 && b.r <= iw + 0.5 && b.b <= ih + 0.5, hit: !!hit && (hit === dismiss || dismiss.contains(hit)), cx, cy }; }
  out.sideVisible = vis(side);
  out.r5 = [];
  if (out.sideVisible) {
    const fb = hint && vis(hint) ? box(hint) : null; out.footer = fb;
    for (const it of desc(side, ".item, .sidekey .row")) {
      it.scrollIntoView({ block: "nearest" });
      const b = box(it); const cx = b.x + Math.min(b.w / 2, 40), cy = b.y + b.h / 2; const hit = document.elementFromPoint(cx, cy);
      const ok = !!hit && (hit === it || it.contains(hit)) && (!fb || b.b <= fb.y + 0.5);
      if (!ok) out.r5.push({ text: (it.textContent || "").trim().slice(0, 40), box: b, hit: hit ? (hit.tagName + "." + String(hit.className).slice(0, 30)) : null });
    }
    if (side) side.scrollTop = 0;
  }
  out.singleColumn = !out.sideVisible;
  out.r7_small = [];
  for (const c of controls) { const b = box(c); if (b.w + 0.5 < 44 || b.h + 0.5 < 44) out.r7_small.push({ id: c.id || c.className || c.tagName, w: Math.round(b.w), h: Math.round(b.h), text: (c.textContent || c.getAttribute("aria-label") || "").trim().slice(0, 30) }); }
  out.r9_clipped = [];
  const roots = [topbar, side, panel, hint, document.querySelector(".introcard"), document.querySelector(".drawer")].filter(vis);
  for (const root of roots) for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!vis(el) || el.closest("#labels")) continue;
    if (el.classList.contains("panel")) continue; /* the sheet container clips by design; its handle is the affordance */
    const cs = getComputedStyle(el);
    const clipX = (cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1;
    const clipY = (cs.overflowY === "hidden" || cs.overflowY === "clip") && el.scrollHeight > el.clientHeight + 1;
    if ((clipX || clipY) && !(cs.textOverflow === "ellipsis" && el.title)) out.r9_clipped.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), id: el.id, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
  }
  out.animations = (document.getAnimations ? document.getAnimations() : []).filter(a => a.playState === "running").map(a => ({ type: a.constructor.name, dur: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null, target: a.effect && a.effect.target ? (a.effect.target.id || String(a.effect.target.className).slice(0, 30)) : null }));
  out.storageKeys = Object.keys(localStorage); out.introSeen = localStorage.getItem("isoscope.introSeen"); out.theme = localStorage.getItem("isoscope.theme");
  const sc = document.querySelector(".panel .scroll");
  out.panelScroll = sc && vis(sc) ? { box: box(sc), scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight } : null;
  const handle = document.querySelector(".sheet-handle");
  out.sheetHandle = handle && vis(handle) ? box(handle) : null;
  out.panelBox = panel && vis(panel) ? box(panel) : null;
  out.panelEyebrow = (document.getElementById("pEyebrow") || {}).textContent || "";
  out.drawerOpen = !!document.querySelector(".drawer.open");
  out.drawerBox = document.querySelector(".drawer.open") ? box(document.querySelector(".drawer.open")) : null;
  out.viewState = window.__isoViewState ? window.__isoViewState() : null;
  return out;
})()`;

type Verdict = "PASS_BOUNDED" | "FAIL" | "INCOMPLETE" | "NOT_APPLICABLE";
type Row = { artifact: string; viewport: string; state: string; verdicts: Record<string, Verdict>; notes: string[]; measure: any; screenshot: any; reducedMotion?: any };
const rows: Row[] = [];
const fmt = (n: number) => Math.round(n);

async function prepareState(url: string, v: Viewport, state: State) {
  const notes: string[] = [];
  const startVp = state === "after-resize-wide-to-narrow" ? { ...v, id: "pre", w: 1440, h: 900 } : state === "after-resize-narrow-to-wide" ? { ...v, id: "pre", w: 390, h: 844 } : v;
  await setViewport(startVp);
  if (!(await navigate(url))) notes.push("artifact did not signal isoscope-ready within 20s");
  if (state === "first-visit-intro") await evaluate(`localStorage.removeItem("isoscope.introSeen"); true`);
  else await evaluate(`localStorage.setItem("isoscope.introSeen","1"); true`);
  if (!(await reload())) notes.push("reload did not signal isoscope-ready");
  const before = await evaluate(`({keys:Object.keys(localStorage), theme:localStorage.getItem("isoscope.theme"), introSeen:localStorage.getItem("isoscope.introSeen")})`);
  if (startVp !== v) { await setViewport(v); await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))"); await sleep(300); }
  switch (state) {
    case "legend-open": break; /* legend is always open where the sidebar renders; single-column marks NOT_APPLICABLE */
    case "inspector-node-selected": { const ok = await evaluate(`(()=>{const b=document.querySelector(".side .item"); if(b){b.click(); return true;} return false;})()`); if (!ok) notes.push("no legend item to select"); break; }
    case "edge-selected": {
      const mid = await evaluate(`(()=>{ if(!window.__isoEdgeMid) return null; const spec=JSON.parse(document.getElementById("isospec").textContent); for(const e of spec.edges){ const k=e[0]+"-"+e[1]; const m=window.__isoEdgeMid(k); if(m){ const c=document.getElementById("canvasWrap").getBoundingClientRect(); if(m.x>c.left+4&&m.x<c.right-4&&m.y>c.top+4&&m.y<c.bottom-4) return {k, x:m.x, y:m.y}; } } return null; })()`);
      if (mid) { await clickAt(mid.x, mid.y, v.touch); await sleep(200); const eyebrow = await evaluate(`document.getElementById("pEyebrow").textContent`); if (!/^LINK/.test(eyebrow)) notes.push(`edge pick at ${fmt(mid.x)},${fmt(mid.y)} (${mid.k}) did not select an edge (forgiving selection is Stage C); layout measured on the resulting view`); }
      else notes.push("no on-screen edge midpoint found");
      break;
    }
    case "settings-open": await evaluate(`document.getElementById("btnSettings").click(); true`); await sleep(450); break;
    default: break;
  }
  return { notes, before };
}

for (const art of artifacts) {
  const artBytes = readFileSync(art); const artSha = sha256(artBytes); const url = pathToFileURL(art).href;
  const artName = basename(art, ".html");
  for (const v of viewports) {
    for (const state of states) {
      const verdicts: Record<string, Verdict> = {};
      try {
      const { notes, before } = await prepareState(url, v, state);
      let m = await evaluate(MEASURE);
      let veilShot: any = null;
      if (state === "first-visit-intro") {
        // R4 is judged on the veil-visible page (screenshot taken now); the remaining assertions run after a real dismiss.
        veilShot = await shot(join(OUT, `${artName}--${v.id}--${state}.png`));
        if (!m.veilVisible) { verdicts.R4 = "FAIL"; notes.push("R4 intro veil not visible on first visit"); }
        else if (!m.r4) { verdicts.R4 = "FAIL"; notes.push("R4 no dismiss control"); }
        else {
          let ok = m.r4.inside && m.r4.hit;
          if (!m.r4.inside) notes.push(`R4 dismiss box ${fmt(m.r4.box.x)},${fmt(m.r4.box.y)}-${fmt(m.r4.box.r)},${fmt(m.r4.box.b)} outside ${m.iw}x${m.ih}`);
          if (!m.r4.hit) notes.push("R4 elementFromPoint at dismiss centre is not the control");
          if (ok) { await clickAt(m.r4.cx, m.r4.cy, v.touch); const hidden = await evaluate(`document.getElementById("introVeil").hidden===true`); if (!hidden) { ok = false; notes.push(`R4 real ${v.touch ? "tap" : "click"} at dismiss centre did not dismiss`); } else notes.push(`R4 dismissed by real ${v.touch ? "touch tap" : "mouse click"} at ${fmt(m.r4.cx)},${fmt(m.r4.cy)}`); }
          else await evaluate(`document.getElementById("introDismiss").click(); true`);
          verdicts.R4 = ok ? "PASS_BOUNDED" : "FAIL";
        }
        await sleep(150); m = await evaluate(MEASURE);
      } else verdicts.R4 = "NOT_APPLICABLE";
      if (m.iw !== v.w || m.ih !== v.h) notes.push(`emulated viewport ${m.iw}x${m.ih} != requested ${v.w}x${v.h} (layout ${m.layoutWidth}, scale ${m.scale})`);
      verdicts.R1 = m.scrollWidth <= m.layoutWidth + 1 && m.scale > 0.999 ? "PASS_BOUNDED" : "FAIL"; if (verdicts.R1 === "FAIL") notes.push(`R1 scrollWidth ${m.scrollWidth} vs layout ${m.layoutWidth}, visual scale ${m.scale}`);
      verdicts.R2 = m.canvas ? (m.r2_intrusions.length ? "FAIL" : "PASS_BOUNDED") : "INCOMPLETE"; if (m.r2_intrusions.length) notes.push(`R2 topbar intrudes canvas: ${m.r2_intrusions.slice(0, 3).map((i: any) => i.tag + "." + i.cls + "@" + fmt(i.box.b)).join(" ")} canvasTop=${fmt(m.canvas.y)}`);
      verdicts.R3 = m.r3_overlaps.length ? "FAIL" : "PASS_BOUNDED"; if (m.r3_overlaps.length) notes.push(`R3 control/heading overlap: ${m.r3_overlaps.slice(0, 3).map((o: any) => o.control + "×" + o.heading).join(" ")}`);
      if (m.sideVisible) { verdicts.R5 = m.r5.length ? "FAIL" : "PASS_BOUNDED"; if (m.r5.length) notes.push(`R5 occluded/unhittable sidebar items: ${m.r5.slice(0, 3).map((i: any) => JSON.stringify(i.text) + "→" + i.hit).join(" ")}`); }
      else { verdicts.R5 = "NOT_APPLICABLE"; if (state === "legend-open") notes.push("legend-open: sidebar does not render in single-column layout (pre-existing behaviour)"); }
      if (!m.canvas) verdicts.R6 = "INCOMPLETE";
      else if (!m.singleColumn) { verdicts.R6 = m.canvas.w >= 480 ? "PASS_BOUNDED" : "FAIL"; if (verdicts.R6 === "FAIL") notes.push(`R6 map width ${fmt(m.canvas.w)} < 480`); }
      else { verdicts.R6 = m.canvas.h >= 0.5 * m.ih ? "PASS_BOUNDED" : "FAIL"; if (verdicts.R6 === "FAIL") notes.push(`R6 map height ${fmt(m.canvas.h)} < 50% of ${m.ih}`); }
      if (v.touch) { if (!m.coarse) { verdicts.R7 = "INCOMPLETE"; notes.push("R7 (pointer: coarse) did not match under emulation"); } else { verdicts.R7 = m.r7_small.length ? "FAIL" : "PASS_BOUNDED"; if (m.r7_small.length) notes.push(`R7 targets <44: ${m.r7_small.slice(0, 4).map((t: any) => `${t.id}(${t.w}x${t.h})`).join(" ")}`); } }
      else verdicts.R7 = "NOT_APPLICABLE";
      {
        let ps = m.panelScroll;
        const hb = m.sheetHandle;
        const handleHit = hb ? await evaluate(`(()=>{const e=document.elementFromPoint(${hb.x + hb.w / 2}, ${hb.y + hb.h / 2}); return !!e && !!e.closest(".sheet-handle");})()`) : false;
        if (hb && !handleHit) notes.push("sheet handle covered by an overlay at its centre; not tapped");
        if (hb && handleHit && (!ps || ps.clientHeight < 120)) {
          await clickAt(hb.x + hb.w / 2, hb.y + hb.h / 2, v.touch); await sleep(150);
          ps = await evaluate(`(()=>{const sc=document.querySelector(".panel .scroll"); if(!sc) return null; const r=sc.getBoundingClientRect(); return {box:{x:r.left,y:r.top,w:r.width,h:r.height}, scrollTop:sc.scrollTop, scrollHeight:sc.scrollHeight, clientHeight:sc.clientHeight};})()`);
          notes.push(`sheet expanded by real ${v.touch ? "tap" : "click"} on handle`);
        }
        const probe = ps ? await evaluate(`(()=>{const sc=document.querySelector(".panel .scroll"); const e=document.elementFromPoint(${ps.box.x + ps.box.w / 2}, ${ps.box.y + Math.min(ps.box.h / 2, ps.box.h - 20)}); return e ? (sc.contains(e) ? "panel" : (e.closest(".drawer") ? "drawer" : e.closest(".introveil") ? "veil" : e.tagName+"."+String(e.className).slice(0,30))) : "none";})()`) : "none";
        if (!ps || ps.scrollHeight <= ps.clientHeight + 2) { verdicts.R8 = "NOT_APPLICABLE"; if (ps) notes.push("R8 panel content fits; nothing to scroll"); }
        else if (probe === "drawer") { verdicts.R8 = "NOT_APPLICABLE"; notes.push("R8 panel is covered by the open settings drawer at this width; scroll judged in the other states"); }
        else if (probe !== "panel") { verdicts.R8 = "FAIL"; notes.push(`R8 panel scroll area is covered by ${probe}`); }
        else {
          // let any camera glide (home/blast) settle first, so the comparison isolates the scroll gesture
          // The engine's autopilot (home/blast/reset glide) legitimately moves the camera; wait for it to finish
          // (the public __isoSwapState().fly hook), then require the camera to hold still for 1.5 s (6 samples at
          // 250 ms, compared at 1e-9) before probing. Exact-float comparison is not used: OrbitControls damping and
          // glide snaps can leave sub-epsilon float noise that is not motion.
          const CAM = `(()=>{const s=window.__isoViewState&&window.__isoViewState(); const f=window.__isoSwapState?window.__isoSwapState().fly:false; return s?{v:[...s.cam.p,...s.cam.t,s.cam.zoom],fly:!!f}:null;})()`;
          const same = (a: any, b: any) => !!a && !!b && a.v.length === b.v.length && a.v.every((x: number, i: number) => Math.abs(x - b.v[i]) <= 1e-9);
          let cam0 = await evaluate(CAM);
          let still = 0, waited = 0;
          while ((still < 6 || (cam0 && cam0.fly)) && waited < 20000) { await sleep(250); waited += 250; const c = await evaluate(CAM); if (same(c, cam0) && !(c && c.fly)) still++; else still = 0; cam0 = c; }
          const x = ps.box.x + ps.box.w / 2, y = ps.box.y + Math.min(ps.box.h / 2, ps.box.h - 20);
          if (v.touch) await S("Input.synthesizeScrollGesture", { x, y, yDistance: -160, gestureSourceType: "touch", speed: 800 });
          else await S("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: 160 });
          await sleep(400);
          const after = await evaluate(`(()=>{const sc=document.querySelector(".panel .scroll"); const s=window.__isoViewState&&window.__isoViewState(); return {scrollTop: sc.scrollTop, cam: s?{v:[...s.cam.p,...s.cam.t,s.cam.zoom]}:null};})()`);
          const scrolled = after.scrollTop > ps.scrollTop + 1, camSame = same(after.cam, cam0);
          if (!scrolled) { verdicts.R8 = "FAIL"; notes.push(`R8 panel did not scroll (scrollTop ${ps.scrollTop}→${after.scrollTop})`); }
          else if (camSame) verdicts.R8 = "PASS_BOUNDED";
          else if (still < 6) { verdicts.R8 = "INCOMPLETE"; notes.push("R8 panel scrolled, but the camera was still gliding or in motion after a 20 s wait, so a camera change cannot be attributed to the gesture"); }
          else { verdicts.R8 = "FAIL"; notes.push("R8 camera changed while scrolling the panel"); }
        }
      }
      verdicts.R9 = m.r9_clipped.length ? "FAIL" : "PASS_BOUNDED"; if (m.r9_clipped.length) notes.push(`R9 clipped: ${m.r9_clipped.slice(0, 3).map((c: any) => `${c.tag}.${c.cls}${c.id ? "#" + c.id : ""}(${c.sw}/${c.cw},${c.sh}/${c.ch})`).join(" ")}`);
      let rm: any = null;
      if (state === "intro-dismissed") {
        await setReducedMotion(true); await reload(); await sleep(400);
        rm = await evaluate(`({reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, running: (document.getAnimations?document.getAnimations():[]).filter(a=>a.playState==="running").map(a=>({dur:a.effect&&a.effect.getTiming?a.effect.getTiming().duration:null,target:a.effect&&a.effect.target?(a.effect.target.id||String(a.effect.target.className).slice(0,30)):null}))})`);
        await setReducedMotion(false);
        verdicts.R10 = !rm.reduce ? "INCOMPLETE" : rm.running.filter((a: any) => (a.dur || 0) > 10).length ? "FAIL" : "PASS_BOUNDED";
        if (verdicts.R10 !== "PASS_BOUNDED") notes.push(`R10 ${JSON.stringify(rm).slice(0, 160)}`);
      } else verdicts.R10 = "NOT_APPLICABLE";
      {
        const now = await evaluate(`({keys:Object.keys(localStorage), theme:localStorage.getItem("isoscope.theme"), introSeen:localStorage.getItem("isoscope.introSeen")})`);
        const extra = now.keys.filter((k: string) => !ALLOWED_STORAGE_KEYS.includes(k));
        const themeSame = now.theme === before.theme;
        const introExpected = state === "first-visit-intro" ? (verdicts.R4 === "PASS_BOUNDED" ? "1" : null) : "1";
        verdicts.R11 = !extra.length && themeSame && now.introSeen === introExpected ? "PASS_BOUNDED" : "FAIL";
        if (verdicts.R11 === "FAIL") notes.push(`R11 keys=${JSON.stringify(now.keys)} theme ${before.theme}→${now.theme} introSeen→${now.introSeen}`);
        m.storageAfter = now;
      }
      const png = veilShot ? { ...veilShot, after_dismiss: await shot(join(OUT, `${artName}--${v.id}--${state}--dismissed.png`)) } : await shot(join(OUT, `${artName}--${v.id}--${state}.png`));
      verdicts.R12 = "PASS_BOUNDED";
      rows.push({ artifact: art, viewport: v.id, state, verdicts, notes, measure: { iw: m.iw, ih: m.ih, coarse: m.coarse, canvas: m.canvas, topbar: m.topbar, panel: m.panelBox, footer: m.footer, panelEyebrow: m.panelEyebrow, drawerOpen: m.drawerOpen, storage: m.storageAfter, r7_small: m.r7_small, r9_clipped: m.r9_clipped, r5: m.r5, r2: m.r2_intrusions, r3: m.r3_overlaps }, screenshot: { ...png, template_sha256: templateSha, artifact_sha256: artSha }, reducedMotion: rm });
      const fails = Object.entries(verdicts).filter(([, x]) => x === "FAIL").map(([k]) => k);
      const inc = Object.entries(verdicts).filter(([, x]) => x === "INCOMPLETE").map(([k]) => k);
      console.log(`${fails.length ? "FAIL" : inc.length ? "INC " : "PASS"}  ${artName.padEnd(22)} ${v.id.padEnd(20)} ${String(v.w + "x" + v.h).padEnd(9)} ${state.padEnd(27)} ${fails.length ? "fail:" + fails.join(",") : ""}${inc.length ? " inc:" + inc.join(",") : ""}${notes.length ? "  · " + notes.join(" · ") : ""}`);
      } catch (e: any) {
        // a harness/CDP failure is recorded as INCOMPLETE for the whole cell, never as a pass
        for (const k of ["R1","R2","R3","R4","R5","R6","R7","R8","R9","R10","R11","R12"]) if (!verdicts[k]) verdicts[k] = "INCOMPLETE";
        rows.push({ artifact: art, viewport: v.id, state, verdicts, notes: [`harness error: ${e.message}`], measure: null, screenshot: null });
        console.log(`INC   ${artName.padEnd(22)} ${v.id.padEnd(20)} ${String(v.w + "x" + v.h).padEnd(9)} ${state.padEnd(27)} harness error: ${e.message}`);
      }
    }
  }
}

const index = {
  schema: "isoscope.render_proof.index.v2",
  generated_at: new Date().toISOString(),
  chrome: CHROME, profile_dir: profile + " (temporary, deleted on exit)", navigation: "file:// only; CDP over --remote-debugging-pipe; no debugging port; no server",
  template: { path: TEMPLATE, sha256: templateSha },
  artifacts: artifacts.map(a => ({ path: a, sha256: sha256(readFileSync(a)), url: pathToFileURL(a).href })),
  user_current_chrome: userVp ? { viewport: userVp } : "not supplied",
  viewports, states, rows,
};
const net = writeNetworkDisclosure();
await cleanup();
(index as any).network_disclosure = { path: NET_DISCLOSURE, sha256: sha256(readFileSync(NET_DISCLOSURE)), allowed_urls: net.allowed.length, denied_urls: net.denied.length, digest_mismatches: digestMismatches.length };
(index as any).profile_cleanup = { path: profile, owned: "this process only (mkdtemp under system tmpdir)", method: "chrome.kill(), await close event (3s cap), then rmSync recursive force; SIGINT/SIGTERM do best-effort synchronous removal", absent_after_cleanup: profileRemoved };
const idxPath = join(OUT, "index.json");
writeFileSync(idxPath, JSON.stringify(index, null, 1));
const total = rows.length, failed = rows.filter(r => Object.values(r.verdicts).includes("FAIL")).length, incomplete = rows.filter(r => Object.values(r.verdicts).includes("INCOMPLETE")).length;
console.log(`network: ${net.allowed.length} allowed URL(s), ${net.denied.length} denied URL(s), ${digestMismatches.length} digest mismatch(es) → ${NET_DISCLOSURE}`);
console.log(`owned profile ${profile} absent after cleanup: ${profileRemoved}`);
console.log(`\n${total - failed}/${total} viewport×state cells without FAIL · ${incomplete} with INCOMPLETE · index ${idxPath} sha256 ${sha256(readFileSync(idxPath))}`);
process.exit(failed || digestMismatches.length ? 1 : 0);
