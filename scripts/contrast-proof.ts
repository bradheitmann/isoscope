/* contrast-proof.ts — click through every theme in a built map and measure the
   REAL computed text/background pairs of the chrome (topbar metric labels,
   sidebar heads + counts, panel eyebrow/sub/refs, hint keys, drawer section
   heads, map labels) plus the token pairs (signal inks vs surface, fg1 vs
   callout surfaces). WCAG AA floors: 4.5 text · 3.0 quiet (label id tier).
   Also collects every uncaught exception / console.error during boot and theme
   switching (the "zero JS errors" gate), and screenshots one theme for eyes.
   Usage: bun scripts/contrast-proof.ts <built.html> [theme-id-to-screenshot] [shot.png]
   (defaults: theme tokyo-night · shot.png ./iso-contrast-<theme>.png)
   Exit 1 if any theme fails or any JS error fired.                            */
import { chromeProfileDir, fail, requireFile } from "./cli.ts";
import { spawn } from "child_process";
import { resolve } from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9335;
const USAGE = "bun scripts/contrast-proof.ts <built.html> [theme-id-to-screenshot] [shot.png]";
if (!Bun.argv[2]) fail(USAGE, "<built.html> is required");
const FILE = "file://" + resolve(requireFile(USAGE, "built html", Bun.argv[2]));
const SHOT = Bun.argv[3] ?? "tokyo-night";
const SHOT_OUT = Bun.argv[4];
const jsErrors: string[] = [];

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run",
  `--user-data-dir=${chromeProfileDir("contrast")}`, "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws: WebSocket = await new Promise((resolve, reject) => {
  const s = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
  s.onmessage = (ev) => { const m = JSON.parse(String(ev.data));
    if (m.method === "Runtime.exceptionThrown") jsErrors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text).slice(0, 160));
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") jsErrors.push("console.error: " + (m.params.args ?? []).map((a: any) => a.value ?? a.description).join(" ").slice(0, 160));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  s.onopen = () => resolve(s); s.onerror = reject;
});
const send = (method: string, params: any = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise<any>((res, rej) => pending.set(id, { resolve: res, reject: rej })); };

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: FILE });
await new Promise(r => setTimeout(r, 2500));

const res = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
  const parse = v => { const m = String(v).match(/rgba?\\(\\s*(\\d+)\\D+(\\d+)\\D+(\\d+)(?:\\D+([\\d.]+))?/); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    const h = String(v).trim().match(/^#([0-9a-f]{6})$/i); return h ? [1,3,5].map(i => parseInt(h[1].slice(i-1,i+1),16)).concat([1]) : null; };
  const lum = c => { const f = x => { x/=255; return x<=0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055,2.4); }; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
  const ratio = (a,b) => { const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
  const over = (fg,bg) => fg[3] >= 1 ? fg : [0,1,2].map(i => bg[i] + (fg[i]-bg[i])*fg[3]).concat([1]);
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) return c; } return parse(getComputedStyle(document.documentElement).getPropertyValue('--okoa-semantic-surface-default')) || [255,255,255,1]; };
  const tok = n => parse(getComputedStyle(document.documentElement).getPropertyValue(n));
  const SEL = [ ['.topbar .cell .k',4.5], ['.side .grouphead',4.5], ['.side .ct',4.5], ['.panel .eyebrow',4.5], ['.panel .sub',4.5],
    ['.panel .refs',4.5], ['.hint .keys',4.5], ['.dsec',4.5], ['.lbl',4.5], ['.lbl .id',3.0], ['.introveil .row',4.5] ];
  const rows = [...document.querySelectorAll('.trow')].filter(b => b.dataset.id);
  const out = [];
  for (const b of rows) {
    b.click();
    const surf = tok('--okoa-semantic-surface-default'), fg1 = tok('--okoa-semantic-fg1');
    const fails = [], worst = { r: 99, what: '' }; let n = 0;
    const note = (what, r, floor) => { n++; if (r < worst.r) { worst.r = r; worst.what = what; } if (r < floor - 0.005) fails.push(what + '=' + r.toFixed(2)); };
    for (const [sel, floor] of SEL) { const el = document.querySelector(sel); if (!el) continue;
      const fg = parse(getComputedStyle(el).color); const bg = bgOf(el); if (!fg || !bg) continue; note(sel, ratio(over(fg,bg), bg), floor); }
    for (const k of ['risk','caution','info','pass']) { const s = tok('--okoa-signal-'+k); if (s) note('signal-'+k, ratio(s, surf), 4.5);
      const cs = tok('--okoa-signal-'+k+'-surface'); if (cs) note('fg1/'+k+'-surface', ratio(fg1, cs), 4.5); }
    note('fg-accent', ratio(tok('--okoa-semantic-fg-accent'), surf), 4.5);
    out.push({ id: b.dataset.id, mode: document.documentElement.getAttribute('data-style') === b.dataset.id ? 'ok' : 'ATTR-MISMATCH', n, worst: worst.what + ' ' + worst.r.toFixed(2), fails });
  }
  return out;
})()` });
let shotPath = "";
if (SHOT) {
  await send("Runtime.evaluate", { expression: `document.querySelector('.trow[data-id="${SHOT}"]')?.click(); document.querySelector('.introveil')?.remove(); document.getElementById('drawer')?.classList.add('open');` });
  await new Promise(r => setTimeout(r, 600));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  shotPath = SHOT_OUT ?? `iso-contrast-${SHOT}.png`; await Bun.write(shotPath, Buffer.from(shot.data, "base64"));
}
chrome.kill();
if (res.exceptionDetails) { console.error(JSON.stringify(res.exceptionDetails, null, 1)); process.exit(2); }
const out = res.result.value as Array<{ id: string; mode: string; n: number; worst: string; fails: string[] }>;
let bad = 0;
for (const t of out) { const ok = t.fails.length === 0 && t.mode === 'ok'; if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.id.padEnd(18)} ${String(t.n).padStart(2)} pairs  worst ${t.worst.padEnd(26)} ${t.fails.join(' ')}${t.mode !== 'ok' ? ' ' + t.mode : ''}`); }
console.log(`\n${out.length - bad}/${out.length} themes PASS · JS errors: ${jsErrors.length}${shotPath ? ` · screenshot ${shotPath}` : ""}`);
jsErrors.forEach(e => console.log("  JS ERROR:", e));
process.exit(bad || jsErrors.length ? 1 : 0);
