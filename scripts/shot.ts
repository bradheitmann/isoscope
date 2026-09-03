/* shot.ts — screenshot a built isoscope artifact (intro veil dismissed) with
   headless Chrome over CDP. Optional JS to run first (e.g. zoom, theme, stack).
   Usage: bun scripts/shot.ts <built.html> <out.png> [w] [h] [js-expression]
   Exit 1 on any uncaught exception or console.error during boot.             */
import { spawn } from "child_process";
import { resolve } from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9336;
const [html, out, w = "1440", h = "900", js = ""] = Bun.argv.slice(2);
if (!html || !out) { console.error("usage: shot.ts <built.html> <out.png> [w] [h] [js]"); process.exit(2); }
const errors: string[] = [];
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run",
  "--user-data-dir=/tmp/isoscope-chrome-shot", "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws: WebSocket = await new Promise((res, rej) => {
  const s = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
  s.onmessage = (ev) => { const m = JSON.parse(String(ev.data));
    if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text).slice(0, 200));
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") errors.push("console.error: " + (m.params.args ?? []).map((a: any) => a.value ?? a.description).join(" ").slice(0, 200));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  s.onopen = () => res(s); s.onerror = rej;
});
const send = (method: string, params: any = {}) => { const id = ++msgId; ws.send(JSON.stringify({ id, method, params })); return new Promise<any>((res, rej) => pending.set(id, { resolve: res, reject: rej })); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file://" + resolve(html) });
await new Promise(r => setTimeout(r, 2200));
const ev = await send("Runtime.evaluate", { expression: `document.querySelector('.introveil')?.remove(); ${js}` });
if (ev.exceptionDetails) errors.push("js arg: " + String(ev.exceptionDetails.exception?.description ?? ev.exceptionDetails.text).slice(0, 200));
await new Promise(r => setTimeout(r, Number(Bun.env.SHOT_WAIT ?? 900))); /* SHOT_WAIT=ms if the JS reloads the page */
await send("Runtime.evaluate", { expression: `document.querySelector('.introveil')?.remove()` });
const shot = await send("Page.captureScreenshot", { format: "png" });
await Bun.write(out, Buffer.from(shot.data, "base64"));
chrome.kill();
console.log(`${out} · ${w}x${h} · JS errors: ${errors.length}`);
errors.forEach(e => console.log("  JS ERROR:", e));
process.exit(errors.length ? 1 : 0);
