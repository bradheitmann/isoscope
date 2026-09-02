/* overflow-diagnose.ts — at a given viewport, list the elements that escape
   the horizontal viewport (right edge > innerWidth) or self-scroll.
   Usage: bun scripts/overflow-diagnose.ts <url-path> <width> <height>       */
import { spawn } from "child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const [path = "/", w = "768", h = "1024"] = Bun.argv.slice(2);

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run",
  "--user-data-dir=/tmp/isoscope-chrome-diag", "--remote-allow-origins=*", "about:blank",
], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));

let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws: WebSocket = await new Promise((resolve, reject) => {
  const s = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
  s.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  s.onopen = () => resolve(s); s.onerror = reject;
});
const send = (method: string, params: any = {}) => {
  const id = ++msgId; ws.send(JSON.stringify({ id, method, params }));
  return new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:4180" + path });
await new Promise(r => setTimeout(r, 2600));
const res = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
  const iw = window.innerWidth, out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.right > iw + 1 || r.width > iw + 1) {
      out.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || "").trim().slice(0, 40) });
    }
  }
  const de = document.scrollingElement;
  return { innerWidth: iw, scrollWidth: de.scrollWidth, offenders: out.slice(0, 12) };
})()` });
console.log(JSON.stringify(res.result.value, null, 1));
chrome.kill();
