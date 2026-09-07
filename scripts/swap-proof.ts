#!/usr/bin/env bun
/* Live R30 proof: isolated store + serve + Chrome on free ports; real CLI/MCP writes.
   bun scripts/swap-proof.ts [evidence-directory] [--headed]
   Headed mode permits an independent observer; numerical results are DEV evidence. */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dir, "..");
const out = resolve(Bun.argv.slice(2).find(x => !x.startsWith("--")) ?? `.odin/audit/2026-09-07-scp-isoscope/scratch-s3/run-${Date.now()}`);
mkdirSync(out, { recursive: true });
const db = resolve(out, "live.db"), errors: string[] = [], results: Record<string, any> = {};
const env = { ...process.env, ISOSCOPE_DB: db }; delete env.ISOSCOPE_TOKEN;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function assert(ok: any, message: string) { if (!ok) throw Error(message); }
function run(args: string[], input?: string) {
  const p = spawnSync(process.execPath, args, { cwd: root, env, input, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  assert(p.status === 0, `command failed: bun ${args.join(" ")}\n${p.stderr}\n${p.stdout}`);
  return p.stdout;
}
function mark(id: string, ...args: string[]) { run(["cli.ts", "mark", db, id, ...args]); }
function mcp(name: string, args: any) {
  const response = run(["mcp.ts"], JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) + "\n");
  const row = response.trim().split("\n").map(x => JSON.parse(x)).find(x => x.id === 1);
  assert(row && !row.error && !row.result?.isError, `MCP ${name}: ${response}`);
}
async function freePort(): Promise<number> {
  const server = createServer(); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port; await new Promise<void>(r => server.close(() => r())); return port;
}
async function until<T>(fn: () => Promise<T>, test: (v: T) => boolean, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms; let last: any;
  do { try { last = await fn(); if (test(last)) return last; } catch (e) { last = String(e); } await sleep(40); } while (Date.now() < deadline);
  throw Error(`timeout ${ms}ms: ${JSON.stringify(last)}`);
}
const port = await freePort(), chromePort = await freePort(), url = `http://127.0.0.1:${port}`;
run(["cli.ts", "import", "examples/isoscope.spec.json", db]);
const server = spawn(process.execPath, ["cli.ts", "serve", db, "--port", String(port)], { cwd: root, env, stdio: "ignore" });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  ...(Bun.argv.includes("--headed") ? [] : ["--headless=new"]), `--remote-debugging-port=${chromePort}`,
  `--user-data-dir=${resolve(out, "chrome")}`, "--no-first-run", "--remote-allow-origins=*", "about:blank"
], { stdio: "ignore" });
let ws: WebSocket | undefined;
try {
  await until(async () => (await fetch(url + "/spec.json")).status, x => x === 200);
  const targets: any = await until(async () => (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json(), x => x.some((t: any) => t.type === "page"));
  let seq = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  ws = await new Promise<WebSocket>((res, rej) => {
    const s = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
    s.onopen = () => res(s); s.onerror = rej;
    s.onmessage = ev => {
      const m = JSON.parse(String(ev.data));
      if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text));
      if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") errors.push("console.error: " + (m.params.args ?? []).map((a: any) => a.value ?? a.description).join(" "));
      const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    };
  });
  function send(method: string, params: any = {}): Promise<any> {
    const id = ++seq; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws!.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression: string): Promise<any> {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  const state = () => evaluate("window.__isoSwapState?.()");
  const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  const cameraDelta = (a: any, b: any) => Math.max(dist(a.p, b.p), dist(a.t, b.t), Math.abs(a.zoom - b.zoom));
  async function navigate(target: string) {
    await send("Page.navigate", { url: target });
    await until(state, s => !!s?.nodes?.length, 15000);
    await evaluate("document.querySelector('.introveil')?.remove()"); await sleep(1200);
  }
  function record(key: string, value: any) { results[key] = value; console.log(`${key} ${JSON.stringify(value)}`); }
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(url);
  await evaluate(`document.querySelector('[data-id="nord"]').click(); document.getElementById('btnStack').click(); window.odinView.inspect('DB'); window.odinView.look(0,0,1.3,0.8,0.85); window.__swapMarker=1`);
  await sleep(1500);
  const before = await state(), count = await evaluate("parseInt(document.querySelector('#li-CL .ct').textContent)||0");
  let started = Date.now(); mark("CL", "--amber", "swap test");
  await until(() => evaluate("parseInt(document.querySelector('#li-CL .ct').textContent)||0"), x => x === count + 1, Math.max(1, 2000 - (Date.now() - started)));
  const preserved = await state(), elapsed = Date.now() - started;
  assert(cameraDelta(before.cam, preserved.cam) <= 1e-6, `C1 camera moved ${cameraDelta(before.cam, preserved.cam)}`);
  assert(preserved.stacked && preserved.pinned === "DB", "C1 stack/pin lost");
  assert(await evaluate("window.__swapMarker===1 && document.documentElement.dataset.style==='nord'"), "C1 reloaded/theme lost");
  await evaluate("document.getElementById('li-CL').click()");
  assert(await evaluate("document.getElementById('paneBody').textContent.includes('swap test')"), "C1 click inspector missing label");
  await evaluate("window.odinView.look(0,0,1.3,0.8,0.85); window.odinView.inspect('DB')");
  assert((await state()).pinned === "DB", "C1 repin failed");
  record("C1", { elapsed_ms: elapsed, previous_count: count, count: count + 1, camera_delta: cameraDelta(before.cam, preserved.cam), marker: 1, theme: "nord", stacked: true, pinned: "DB" });

  const initialSpec = await (await fetch(url + "/spec.json")).json();
  async function cycle() {
    mcp("iso_upsert_node", { id: "ZZ", name: "Swap proof", g: initialSpec.groups[0].id, x: 2, y: 2 });
    mcp("iso_upsert_edge", { src: "ZZ", dst: "DB" });
    await until(state, s => s?.edges?.["ZZ-DB"]?.junctions === 2);
    assert(await evaluate("!!document.getElementById('lb-ZZ') && !!document.getElementById('li-ZZ')"), "C2 add DOM missing");
    mcp("iso_delete", { node: "ZZ" });
    await until(state, s => s && !s.nodes.some((n: any) => n.id === "ZZ") && !s.edges["ZZ-DB"]);
    assert(await evaluate("!document.getElementById('lb-ZZ') && !document.getElementById('li-ZZ')"), "C2 delete DOM remains");
    await sleep(250); return (await state()).memory;
  }
  const baseline = await cycle(), samples = [];
  for (let i = 0; i < 5; i++) { const s = await cycle(); samples.push(s); assert(s.geometries <= baseline.geometries && s.textures <= baseline.textures && s.programs <= baseline.programs, `C2 GPU growth ${JSON.stringify({ baseline, s })}`); }
  record("C2", { warmup_cycles: 1, measured_cycles: 5, baseline, samples });

  const t0 = (await state()).cam.t; started = Date.now(); mark("SP", "--red", "swap incident");
  const incident = await until(state, s => s?.cordon.includes("SP") && dist(s.cam.t, s.nodes.find((n: any) => n.id === "SP").anchor) <= 1, Math.max(1, 3000 - (Date.now() - started)));
  const expected = [...new Set(["SP", ...initialSpec.edges.filter((e: string[]) => e[0] === "SP" || e[1] === "SP").flatMap((e: string[]) => e.slice(0, 2))])].sort();
  assert(JSON.stringify([...incident.cordon].sort()) === JSON.stringify(expected), "C3 wrong blast radius");
  assert(await evaluate("document.getElementById('pEyebrow').textContent.includes('Incident') || document.getElementById('pTitle').textContent.includes('SP')"), "C3 panel missing incident");
  const incidentElapsed = Date.now() - started;
  const landed = await until(state, s => !s.fly, 10000), t1 = landed.cam.t;
  mark("SP", "--clear"); await until(state, s => s?.cordon.length === 0); await sleep(250);
  const healed = await state(); assert(dist(t1, healed.cam.t) <= 1e-6 && !healed.fly, "C3 healing moved camera");
  record("C3", { elapsed_ms: incidentElapsed, cordon: expected, T0: t0, T1: t1, healing_delta: dist(t1, healed.cam.t) });

  const shifted = await (await fetch(url + "/spec.json")).json(); shifted.nodes.forEach((n: any) => n.x += 20);
  await Bun.write(resolve(out, "shifted.json"), JSON.stringify(shifted));
  started = Date.now(); run(["cli.ts", "import", resolve(out, "shifted.json"), db]);
  const contained = await until(state, s => s?.center.x > 10 && Math.hypot(s.cam.t[0] - s.center.x, s.cam.t[2] - s.center.z) <= 0.5, Math.max(1, 3000 - (Date.now() - started)));
  const visible = await evaluate(`(()=>{const c=document.querySelector('canvas').getBoundingClientRect();return {width:c.width,labels:[...document.querySelectorAll('#labels [id^="lb-"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom}).length}})()`);
  assert(visible.width >= 50 && visible.labels > 0, "C4 no label in canvas");
  record("C4", { elapsed_ms: Date.now() - started, target: contained.cam.t, center: contained.center, ...visible });
  await until(state, s => !s.fly, 10000);

  await evaluate("window.odinView.inspect('CL')"); started = Date.now();
  for (let i = 0; i < 10; i++) mark("CL", "--clear", "--amber", `storm ${i % 2}:${i}`);
  const lastMark = Date.now(), stormMs = lastMark - started;
  assert(stormMs <= 1000, `C5 writes too slow: ${stormMs}ms`);
  await until(() => evaluate("document.getElementById('paneBody').textContent"), x => x.includes("storm 1:9"));
  await sleep(Math.max(0, lastMark + 2000 - Date.now()));
  const quiet = await evaluate(`new Promise(resolve=>{let mutations=0;const samples=[];const o=new MutationObserver(ms=>{mutations+=ms.length;for(const m of ms.slice(0,3))if(samples.length<8)samples.push({id:m.target.id,attr:m.attributeName,type:m.type})});for(const id of ['labels','legend'])o.observe(document.getElementById(id),{subtree:true,childList:true,attributes:true,characterData:true});setTimeout(()=>{o.disconnect();resolve({mutations,samples})},500)})`);
  const counts = await evaluate(`(()=>{const ids=[...document.querySelectorAll('#labels [id^="lb-"]')].map(e=>e.id);return {labels:ids.length,unique:new Set(ids).size,rows:document.querySelectorAll('#legend [id^="li-"]').length,open:document.querySelector('#li-CL .ct').textContent}})()`);
  const current = await state(); assert(counts.labels === current.nodes.length && counts.unique === counts.labels && counts.rows === counts.labels && counts.open === "1 open", "C5 wrong counts");
  assert(quiet.mutations === 0, `C5 DOM not quiet ${JSON.stringify(quiet)}`);
  record("C5", { writes: 10, writes_ms: stormMs, last_label: "storm 1:9", ...counts, ...quiet });

  // Preserve a surviving trace across a real update, then reset a removed trace.
  await evaluate("document.getElementById('btnTrace').click()");
  const traceBefore = await state();
  assert(traceBefore.ti >= 0, "trace fixture is empty");
  mark("CL", "--clear", "--amber", "trace preserved");
  await until(state, s => s?.nodes.find((n: any) => n.id === "CL")?.items.some((v: any) => v.l === "trace preserved"));
  assert((await state()).ti === traceBefore.ti && await evaluate("document.getElementById('pEyebrow').textContent.startsWith('Step ')"), "trace state or narration lost on swap");
  const withoutTrace = await (await fetch(url + "/spec.json")).json(); withoutTrace.trace = [];
  await Bun.write(resolve(out, "without-trace.json"), JSON.stringify(withoutTrace));
  run(["cli.ts", "import", resolve(out, "without-trace.json"), db]);
  await until(state, s => s?.ti === -1);
  record("trace_regression", { surviving_index: traceBefore.ti, removed_index: -1 });

  await navigate(url + "?reload=1");
  const center = (await state()).center;
  await evaluate(`window.odinView.look(${center.x},${center.z},1.1,0.75,0.8); window.__swapMarker=1; document.querySelector('[data-id="nord"]').click()`); await sleep(150);
  const fallbackBefore = await state(); mark("CL", "--amber", "reload test");
  await until(() => evaluate("window.__swapMarker===undefined && !!window.__isoSwapState"), x => x === true, 15000); await sleep(1200);
  const fallbackAfter = await state(); assert(cameraDelta(fallbackBefore.cam, fallbackAfter.cam) <= 1e-3, `C6 camera delta ${cameraDelta(fallbackBefore.cam, fallbackAfter.cam)}`);
  assert(await evaluate("document.documentElement.dataset.style==='nord'"), "C6 theme lost");
  record("C6", { marker_absent: true, theme: "nord", camera_delta: cameraDelta(fallbackBefore.cam, fallbackAfter.cam) });

  await navigate(url);
  for (let i = 0; i < 2; i++) { mark("CL", "--clear", "--amber", `final swap ${i}`); await until(state, s => s?.nodes.find((n: any) => n.id === "CL")?.items.some((v: any) => v.l === `final swap ${i}`)); }
  await sleep(600); const swapped = await state();
  assert(await evaluate("document.querySelectorAll('#labels [id^=\"lb-\"]').length") === swapped.nodes.length, "C7 labels mismatch");
  const finalSpec = await (await fetch(url + "/spec.json")).json(); assert(Object.keys(swapped.edges).length === finalSpec.edges.length, "C7 edge count mismatch");
  await evaluate("document.querySelector('.introveil')?.remove()");
  const png = resolve(out, "live-after-two-swaps.png"), shot = await send("Page.captureScreenshot", { format: "png" });
  const bytes = Buffer.from(shot.data, "base64"); await Bun.write(png, bytes);
  await navigate(url); const fresh = await state(); assert(swapped.children === fresh.children, `C7 children ${swapped.children} != ${fresh.children}`);
  const contrast = run(["run", "proof:contrast"]); await Bun.write(resolve(out, "contrast.txt"), contrast);
  assert(contrast.includes("18/18") && /JS errors: 0/.test(contrast), "C7 contrast failed");
  const drc: Record<string, string> = {};
  for (const name of ["isoscope", "odin", "lumbr"]) { drc[name] = run(["drc.ts", `examples/${name}.spec.json`]); await Bun.write(resolve(out, `drc-${name}.txt`), drc[name]); }
  record("C7", { children_after_swaps: swapped.children, children_fresh: fresh.children, labels: swapped.nodes.length, edges: Object.keys(swapped.edges).length, png, png_sha256: createHash("sha256").update(bytes).digest("hex"), live_url: url, contrast: "18/18", drc_examples: Object.keys(drc), js_errors: errors });
  assert(errors.length === 0, `JS errors: ${JSON.stringify(errors)}`);
  await Bun.write(resolve(out, "results.json"), JSON.stringify({ status: "DEV_PROOF_PASS", results, errors }, null, 2) + "\n");
  console.log(`DEV_PROOF_PASS ${out}`);
} catch (error) {
  await Bun.write(resolve(out, "results.json"), JSON.stringify({ status: "FAIL", error: String(error), results, errors }, null, 2) + "\n");
  console.error(String(error)); process.exitCode = 1;
} finally { ws?.close(); chrome.kill(); server.kill(); }
