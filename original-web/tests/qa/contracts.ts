import { join } from "node:path";
import { Session } from "./cdp";
import { groupsFixture, sectionsFixture, type Fixture } from "./fixtures";
import { sleep } from "./procs";
import type { Recorder } from "./report";

export interface Ctx {
  chromePort: number;
  appUrl: string;
  outDir: string;
  rec: Recorder;
}

export const VIEWPORTS: ReadonlyArray<readonly [number, number]> = [
  [390, 844], [768, 1024], [1024, 768], [1280, 600], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]
];

const READY = "window.odinView && window.__isoSwapState && window.__isoApplySpec";

interface Cam { p: number[]; t: number[]; zoom: number; fly: boolean }

async function camState(s: Session): Promise<Cam> {
  const st = await s.eval<{ cam: { p: number[]; t: number[]; zoom: number }; fly: boolean }>("(() => { const x = window.__isoSwapState(); return { cam: x.cam, fly: x.fly }; })()");
  return { ...st.cam, fly: st.fly };
}

const sameCam = (a: Cam, b: Cam): boolean =>
  Math.abs(a.zoom - b.zoom) < 1e-4 && a.p.every((v, i) => Math.abs(v - (b.p[i] ?? 0)) < 1e-3) && a.t.every((v, i) => Math.abs(v - (b.t[i] ?? 0)) < 1e-3);

/** Wait for the startup camera flight to finish: no flight in progress and the camera unchanged across 4 polls. */
export async function settle(s: Session, timeoutMs = 40000): Promise<Cam> {
  const deadline = Date.now() + timeoutMs;
  let prev = await camState(s);
  let stable = 0;
  while (Date.now() < deadline) {
    await sleep(250);
    const now = await camState(s);
    stable = !now.fly && sameCam(prev, now) ? stable + 1 : 0;
    prev = now;
    if (stable >= 4) return now;
  }
  throw new Error("camera never settled");
}

export async function openApp(ctx: Ctx, width: number, height: number, reducedMotion = false): Promise<Session> {
  const s = await Session.open(ctx.chromePort);
  await s.setViewport(width, height);
  await s.setReducedMotion(reducedMotion);
  await s.navigate(ctx.appUrl, READY);
  await settle(s);
  return s;
}

async function withApp(ctx: Ctx, w: number, h: number, rm: boolean, fn: (s: Session) => Promise<void>): Promise<void> {
  const s = await openApp(ctx, w, h, rm);
  try { await fn(s); } finally { await s.close(); }
}

const shot = (ctx: Ctx, s: Session, name: string): Promise<void> => s.screenshot(join(ctx.outDir, `${name}.png`));

/* ---------------------------------------------------------------- navigation */

interface NavSnapshot { results: string; rows: string[]; headings: string[]; moreHidden: boolean }

const NAV_SNAPSHOT = `(() => ({
  results: document.getElementById("moduleResults").textContent,
  rows: [...document.querySelectorAll("#legend .dp-list-row")].map(r => r.id.slice(3)),
  headings: [...document.querySelectorAll("#legend .module-group > h3")].map(h => h.textContent),
  moreHidden: document.getElementById("moduleMore").hidden
}))()`;

async function search(s: Session, query: string): Promise<NavSnapshot> {
  await s.eval(`(() => { const i = document.getElementById("moduleSearch"); i.value = ${JSON.stringify(query)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  return s.eval<NavSnapshot>(NAV_SNAPSHOT);
}

async function navigationContract(ctx: Ctx, fx: Fixture, label: string): Promise<void> {
  const C = `navigation:${label}`;
  const { rec } = ctx;
  await withApp(ctx, 1440, 900, false, async s => {
    const before = s.exceptions.length;
    const t0 = Date.now();
    await s.eval(`window.__isoApplySpec(${JSON.stringify(fx.spec)})`);
    const applyMs = Date.now() - t0;
    await settle(s);
    const total = fx.spec.nodes.length;
    rec.check(C, "spec applies with no exception", s.exceptions.length === before, `apply ${applyMs} ms, ${total} nodes, ${fx.spec.groups.length} groups, ${fx.spec.edges.length} edges`);

    const first = await s.eval<NavSnapshot>(NAV_SNAPSHOT);
    rec.check(C, "first page is bounded", first.rows.length === fx.pageSize && first.results === `Showing 1–${fx.pageSize} of ${total} modules`, `${first.rows.length} rows; "${first.results}"`);

    /* page through "Show more modules" until it hides; every module is reachable exactly once */
    const seen = new Set<string>(first.rows);
    let pages = 1;
    let snap = first;
    while (!snap.moreHidden && pages < 50) {
      await s.eval(`document.getElementById("moduleMore").click()`);
      snap = await s.eval<NavSnapshot>(NAV_SNAPSHOT);
      snap.rows.forEach(r => seen.add(r));
      pages++;
    }
    const expectedPages = Math.ceil(total / fx.pageSize);
    rec.check(C, "paging reaches every module", pages === expectedPages && seen.size === total && snap.results === `Showing ${(expectedPages - 1) * fx.pageSize + 1}–${total} of ${total} modules`,
      `${pages}/${expectedPages} pages, ${seen.size}/${total} distinct ids; last "${snap.results}"`);

    /* searches derive from the fixture itself */
    const byId = await search(s, fx.lastNodeId);
    rec.check(C, "search by module id", byId.rows.length === 1 && byId.rows[0] === fx.lastNodeId, `"${fx.lastNodeId}" -> ${byId.rows.join(",")}`);
    const byName = await search(s, fx.lastNodeName);
    rec.check(C, "search by module name", byName.rows.length === 1 && byName.rows[0] === fx.lastNodeId, `"${fx.lastNodeName}" -> ${byName.rows.join(",")}`);
    const byGroup = await search(s, fx.lastGroupLabel);
    const wantGroup = fx.lastGroupNodeIds.length;
    const expectShown = Math.min(wantGroup, fx.pageSize);
    rec.check(C, "search by group label", byGroup.results.endsWith(`of ${wantGroup} modules`) && byGroup.rows.length === expectShown && byGroup.headings.every(h => h === fx.lastGroupLabel),
      `"${fx.lastGroupLabel}" -> "${byGroup.results}", headings ${[...new Set(byGroup.headings)].join("|")}, expected ${wantGroup} modules`);
    const none = await search(s, "no such thing qq");
    rec.check(C, "empty search reports no results", none.rows.length === 0 && none.results.startsWith("No sections"), `"${none.results}"`);

    await search(s, fx.lastNodeId);
    await s.eval(`document.getElementById("li-${fx.lastNodeId}").click()`);
    await sleep(400);
    const pressed = await s.eval<string | null>(`document.getElementById("li-${fx.lastNodeId}")?.getAttribute("aria-pressed") ?? null`);
    rec.check(C, "selecting a result pins it", pressed === "true", `aria-pressed=${pressed}`);
    rec.check(C, "no uncaught exceptions during navigation", s.exceptions.length === before, `${s.exceptions.length - before} new: ${s.exceptions.slice(before, before + 2).join("; ")}`);
  });
}

export async function navigationContracts(ctx: Ctx): Promise<void> {
  await navigationContract(ctx, sectionsFixture(), "100-sections");
  await navigationContract(ctx, groupsFixture(), "100-groups");
}

/* ---------------------------------------------------------------- viewport matrix */

interface ViewportProbe {
  iw: number; ih: number; overflowX: number; canvas: [number, number]; wrap: [number, number];
  controls: Record<string, [number, number, number, number] | null>; labelsTotal: number; labelsOff: number; labelsUnrendered: number;
}

export async function viewportMatrix(ctx: Ctx): Promise<void> {
  const C = "viewport-matrix";
  for (const [w, h] of VIEWPORTS) {
    await withApp(ctx, w, h, false, async s => {
      const p = await s.eval<ViewportProbe>(`(() => {
        const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
        const labels = [...document.querySelectorAll("#labels .lbl")];
        const off = labels.filter(l => { const b = l.getBoundingClientRect(); return b.width > 0 && (b.right < 0 || b.left > innerWidth || b.bottom < 0 || b.top > innerHeight || b.left < 0 || b.right > innerWidth); });
        const canvas = document.getElementById("gl"), wrap = document.getElementById("canvasWrap");
        return { iw: innerWidth, ih: innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth,
          canvas: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
          wrap: [wrap.getBoundingClientRect().width, wrap.getBoundingClientRect().height],
          controls: { btnReset: r("btnReset"), btnReadMap: r("btnReadMap"), btnSettings: r("btnSettings"), railToggle: r("railToggle") },
          labelsTotal: labels.length, labelsOff: off.length, labelsUnrendered: labels.filter(l => l.getBoundingClientRect().width === 0).length };
      })()`);
      const tag = `${w}x${h}`;
      await shot(ctx, s, `viewport-${tag}`);
      ctx.rec.check(C, `${tag} viewport applied`, p.iw === w && p.ih === h, `innerWidth x innerHeight = ${p.iw}x${p.ih}`);
      ctx.rec.check(C, `${tag} no horizontal overflow`, p.overflowX <= 0, `scrollWidth-innerWidth = ${p.overflowX}`);
      ctx.rec.check(C, `${tag} canvas fills its wrap`, Math.abs(p.canvas[0] - p.wrap[0]) <= 1 && p.canvas[1] > 0, `canvas ${p.canvas.map(Math.round).join("x")} wrap ${p.wrap.map(Math.round).join("x")}`);
      /* the rail is hidden behind railToggle on small screens; require at least one entry point to the controls in view */
      const inView = (b: [number, number, number, number] | null): boolean => b !== null && b[2] > b[0] && b[0] >= 0 && b[1] >= 0 && b[2] <= p.iw && b[3] <= p.ih;
      const reachable = inView(p.controls["btnReset"] ?? null) || inView(p.controls["railToggle"] ?? null);
      ctx.rec.check(C, `${tag} controls reachable in viewport`, reachable, JSON.stringify(p.controls));
      ctx.rec.observe(C, `${tag} home-view labels off-canvas`, `${p.labelsOff}/${p.labelsTotal} labels outside the viewport, ${p.labelsUnrendered} not rendered (width 0; not counted as off-canvas) (drain item D6, ruled: fit)`);
      ctx.rec.check(C, `${tag} no uncaught exceptions`, s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
    });
  }
}

/* ---------------------------------------------------------------- modal (reader sheet) */

interface PanelProbe {
  hidden: boolean; inert: boolean; expanded: string | null; role: string | null; cls: string; height: number;
  active: string; focusInPanel: boolean; trayHidden: boolean;
}
const PANEL = `(() => { const p = document.getElementById("readingPanel"), a = document.activeElement;
  return { hidden: p.hidden, inert: p.inert, expanded: document.getElementById("btnReadMap").getAttribute("aria-expanded"), role: p.getAttribute("role"),
    cls: p.className, height: Math.round(p.getBoundingClientRect().height), active: a ? (a.id || a.tagName) : "none",
    focusInPanel: p.contains(a), trayHidden: document.getElementById("trayHandle").hidden }; })()`;

export async function modalContracts(ctx: Ctx): Promise<void> {
  for (const [w, h] of [[390, 844], [1024, 768]] as const) {
    const C = `modal:${w}x${h}`;
    await withApp(ctx, w, h, false, async s => {
      const closed = await s.eval<PanelProbe>(PANEL);
      ctx.rec.check(C, "starts closed, hidden and inert", closed.hidden && closed.inert && closed.expanded === "false" && !closed.trayHidden, JSON.stringify(closed));
      await s.eval(`(() => { const b = document.getElementById("btnReadMap"); b.focus(); b.click(); })()`);
      await sleep(500);
      const open = await s.eval<PanelProbe>(PANEL);
      await shot(ctx, s, `modal-open-${w}x${h}`);
      ctx.rec.check(C, "open: visible, not inert, aria-expanded=true, role=dialog", !open.hidden && !open.inert && open.expanded === "true" && open.role === "dialog", JSON.stringify(open));
      ctx.rec.check(C, "open: focus moves into the sheet", open.focusInPanel, `activeElement=${open.active}`, "D4");

      /* Escape: asserted. Owner ruling D5: Escape closes the reader sheet fully. */
      await s.key("Escape", "Escape", 27);
      await sleep(500);
      const esc = await s.eval<PanelProbe>(PANEL);
      await shot(ctx, s, `modal-escape-${w}x${h}`);
      const closedByEsc = esc.hidden && esc.inert && esc.expanded === "false";
      ctx.rec.check(C, "Escape closes the reader sheet", closedByEsc, JSON.stringify(esc), "D5");

      /* reopen if Escape left it open, then assert the explicit Close button */
      if (closedByEsc) await s.eval(`document.getElementById("btnReadMap").click()`);
      await sleep(400);
      await s.eval(`document.getElementById("closeReadingPanel").click()`);
      await sleep(500);
      const closeProbe = await s.eval<PanelProbe>(PANEL);
      const closedByBtn = closeProbe.hidden && closeProbe.inert && closeProbe.expanded === "false";
      ctx.rec.check(C, "Close button closes the reader sheet", closedByBtn, JSON.stringify(closeProbe), "D5");
      ctx.rec.check(C, "no uncaught exceptions", s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
    });
  }
}

/* ---------------------------------------------------------------- resize (compact/wide handshake) */

export async function resizeContract(ctx: Ctx): Promise<void> {
  const C = "resize";
  await withApp(ctx, 1440, 900, false, async s => {
    const step = async (w: number, h: number): Promise<PanelProbe> => { await s.setViewport(w, h); await sleep(600); return s.eval<PanelProbe>(PANEL); };
    const wide = await s.eval<PanelProbe>(PANEL);
    ctx.rec.check(C, "wide: reader docked (visible, not inert, role=complementary)", !wide.hidden && !wide.inert && wide.role === "complementary" && wide.trayHidden, JSON.stringify(wide));
    const compact = await step(900, 800);
    ctx.rec.check(C, "wide -> compact: reader collapses (hidden, inert, tray handle shown)", compact.hidden && compact.inert && !compact.trayHidden && compact.role === "dialog" && compact.expanded === "false", JSON.stringify(compact));
    await s.eval(`document.getElementById("btnReadMap").click()`);
    await sleep(500);
    const opened = await s.eval<PanelProbe>(PANEL);
    ctx.rec.check(C, "compact: reader opens", !opened.hidden && !opened.inert && opened.expanded === "true", JSON.stringify(opened));
    const back = await step(1440, 900);
    ctx.rec.check(C, "compact(open) -> wide: reader docks, focus lands in panel, aria-expanded=false", !back.hidden && !back.inert && back.role === "complementary" && back.expanded === "false" && back.focusInPanel, JSON.stringify(back));
    const again = await step(900, 800);
    ctx.rec.check(C, "wide -> compact again: collapses with no stale open state", again.hidden && again.inert && again.expanded === "false", JSON.stringify(again));
    ctx.rec.check(C, "no uncaught exceptions", s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
  });
}

/* ---------------------------------------------------------------- gestures (synthetic wheel + R reset) */

export async function gestureContract(ctx: Ctx): Promise<void> {
  const C = "gestures";
  await withApp(ctx, 1440, 900, false, async s => {
    const home = await settle(s);
    const wheel = (dy: number): Promise<void> => s.eval(`(() => { const c = document.getElementById("gl"); const b = c.getBoundingClientRect();
      c.dispatchEvent(new WheelEvent("wheel", { deltaY: ${dy}, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true })); })()`);
    await wheel(-400);
    const zoomed = await settle(s);
    ctx.rec.check(C, "synthetic wheel-in increases zoom", zoomed.zoom > home.zoom, `zoom ${home.zoom.toFixed(3)} -> ${zoomed.zoom.toFixed(3)}`);
    await wheel(800);
    const out = await settle(s);
    ctx.rec.check(C, "synthetic wheel-out decreases zoom", out.zoom < zoomed.zoom, `zoom ${zoomed.zoom.toFixed(3)} -> ${out.zoom.toFixed(3)}`);
    await s.eval(`window.odinView.set(0.7, 1.0, 40, 1.5)`);
    await sleep(300);
    await s.key("r", "KeyR", 82);
    const reset = await settle(s);
    ctx.rec.check(C, "R returns the camera to the settled home view", sameCam(home, reset), `home zoom ${home.zoom.toFixed(3)} target ${home.t.map(v => v.toFixed(2))} | after R zoom ${reset.zoom.toFixed(3)} target ${reset.t.map(v => v.toFixed(2))}`);
    ctx.rec.check(C, "no uncaught exceptions", s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
  });
}

/* ---------------------------------------------------------------- reduced motion */

export async function reducedMotionContract(ctx: Ctx): Promise<void> {
  const C = "reduced-motion";
  await withApp(ctx, 1920, 1200, true, async s => {
    const matches = await s.eval<boolean>(`matchMedia("(prefers-reduced-motion: reduce)").matches`);
    ctx.rec.check(C, "prefers-reduced-motion emulation active", matches, `matches=${matches}`);
    const home = await camState(s);
    ctx.rec.observe(C, "home anchor (observed)", `target ${home.t.map(v => v.toFixed(3)).join("/")} zoom ${home.zoom.toFixed(3)} @1920x1200 (old reference 266.104/666.043 zoom 1.12 was for a previous build)`);
    await s.eval(`window.odinView.set(0.7, 1.0, 40, 1.5)`);
    await sleep(300);
    await s.key("r", "KeyR", 82);
    await s.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
    const snapped = await camState(s);
    ctx.rec.check(C, "R snaps to home within 2 frames (no glide)", sameCam(home, snapped) && !snapped.fly, `after 2 rAF: zoom ${snapped.zoom.toFixed(3)} fly=${snapped.fly} target ${snapped.t.map(v => v.toFixed(2))}`);
    ctx.rec.check(C, "no uncaught exceptions", s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
  });
}

/* ---------------------------------------------------------------- 100-node scene */

export async function scene100Contract(ctx: Ctx): Promise<void> {
  const C = "scene-100";
  const fx = sectionsFixture();
  await withApp(ctx, 1920, 1080, false, async s => {
    await s.eval(`window.__isoApplySpec(${JSON.stringify(fx.spec)})`);
    await settle(s);
    const st = await s.eval<{ nodes: number; edges: number; under: number; labels: number; frames: number }>(`(async () => {
      const x = window.__isoSwapState();
      const panel = document.getElementById("readingPanel").getBoundingClientRect();
      const labels = [...document.querySelectorAll("#labels .lbl")];
      const under = labels.filter(l => { const b = l.getBoundingClientRect(); return b.width > 0 && b.right > panel.left && b.left < panel.right; }).length;
      let frames = 0; const t0 = performance.now();
      await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(true); }; requestAnimationFrame(f); });
      return { nodes: x.nodes.length, edges: Object.keys(x.edges).length, under, labels: labels.length, frames: Math.round(frames / ((performance.now() - t0) / 1000)) };
    })()`);
    await shot(ctx, s, "scene-100");
    ctx.rec.check(C, "scene holds 100 nodes and 99 edges", st.nodes === 100 && st.edges === 99, `${st.nodes} nodes, ${st.edges} edges`);
    ctx.rec.observe(C, "labels under the reading panel (observed)", `${st.under}/${st.labels} labels overlap the panel at 1920x1080 (drain item D6, ruled: fit)`);
    ctx.rec.observe(C, "frame rate (observed)", `${st.frames} fps via software GL (SwiftShader); informational only`);
    ctx.rec.check(C, "no uncaught exceptions", s.exceptions.length === 0, s.exceptions.slice(0, 2).join("; ") || "none");
  });
}
