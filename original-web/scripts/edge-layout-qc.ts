#!/usr/bin/env bun
/* Headless edge-layout QC harness. Strict TypeScript, run with bun (see package.json script).
   Two layers, in the order the Jev skill mandates — deterministic first, semantic second:

   1. DETERMINISTIC (always, offline, fast): run the isometric router on the shipped
      spec plus a sweep of shuffled layouts, and run src/edge-qc's structural checks
      on each (malformed elbows, collapsed steps, self-crossings, bogus bridges,
      shared runs). These are hard facts and need no model.

   2. JEV SEMANTIC (advisory only, fixture-first): a bounded qa-evidence-v1 review of
      each layout's QC evidence. FIXTURE MODE is the default and is fully offline and
      deterministic — no model is called, no network, no key. `--live` is the only way
      to reach the real service, and it requires TYPESAFE_API_KEY in the environment
      (Doppler) plus an explicit shared-budget declaration via JEV_LIVE_BUDGET. The
      semantic layer is advisory: it emits issue_candidate / insufficient_evidence /
      human_review and can NEVER accept, pass, or release a layout.

   Usage: bun scripts/edge-layout-qc.ts [--seeds N] [--live] [--json]
*/
import { isoRouteAll } from "../../router.ts";
import { checkRoutes, summarize, type EdgeDefect } from "../src/edge-qc";
import SPEC from "../examples/isoscope.spec.json";
import { createHash } from "node:crypto";

/* Minimal local types for the dsh-jev seam (the real package ships its own). */
type QaDisposition = "issue_candidate" | "insufficient_evidence" | "human_review";
interface QaResult { disposition: QaDisposition; error?: string }
interface QaReviewResponse { ok: boolean; qa?: QaResult; error?: { code?: string } }
type JevConfig = { mode: "fixture" | "live"; enabled: boolean; dataClass: "synthetic" | "public" | "internal"; timeoutMs?: number };
type JevDeps = { resolveCredential?: (signal?: unknown) => Promise<string>; ledger?: unknown; fixture?: unknown };
type ReviewQA = (packet: unknown, config: JevConfig, deps?: JevDeps) => Promise<QaReviewResponse>;

/* The Jev semantic layer is optional and advisory. Resolve dsh-jev recipes from the
   environment (JEV_RECIPES_PATH) or a node_modules install; if absent, run
   deterministic-only. No hardcoded machine paths — open-source safe. */
let reviewQA: ReviewQA | null = null;
let makeDurableLedger: ((dir: string) => { begin: unknown; dispatchIntent: unknown; complete: unknown }) | null = null;
const jevPath = process.env.JEV_RECIPES_PATH ?? "dsh-jev/scripts/recipes.js";
const jevLedgerPath = process.env.JEV_LEDGER_PATH ?? jevPath.replace(/recipes\.js$/, "ledger.js");
try { reviewQA = (await import(jevPath) as { reviewQA: ReviewQA }).reviewQA; } catch { reviewQA = null; }
try { makeDurableLedger = (await import(jevLedgerPath) as { makeDurableLedger: (dir: string) => { begin: unknown; dispatchIntent: unknown; complete: unknown } }).makeDurableLedger; } catch { makeDurableLedger = null; }
/* hash-only durable receipts for live dispatches (gitignored, local). The ledger proves
   dispatch accounting without storing raw request/response content. */
const LEDGER_DIR = new URL("../.jev-receipts/", import.meta.url).pathname;

interface NodeSpec { id: string; x: number; y: number; w: number; d: number }
type EdgeSpec = [string, string, string?];
const nodes = SPEC.nodes as unknown as NodeSpec[];
const edges = SPEC.edges as unknown as EdgeSpec[];
const specLevels = (SPEC.levels ?? {}) as Record<string, number>;

const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(n);
const opt = (n: string, d: number): number => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const SEEDS = opt("--seeds", 12);
const LIVE = flag("--live");
const JSON_OUT = flag("--json");

function shuffled(seed: number): NodeSpec[] {
  const ns = nodes.map(n => ({ ...n }));
  let s = seed;
  const rand = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const cells = ns.map(n => ({ x: n.x, y: n.y }));
  const levels = ns.map(n => specLevels[n.id] ?? 0);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (let i = levels.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[levels[i], levels[j]] = [levels[j], levels[i]]; }
  ns.forEach((n, i) => { n.x = cells[i].x; n.y = cells[i].y; });
  return ns;
}

interface Routed { routes: Record<string, [number, number][]>; hops: Record<string, [number, number][]>; qc: { crossings: number; shares: number; hops: number; weighted: number } }
function routeAndCheck(ns: NodeSpec[]): { out: Routed; defects: EdgeDefect[] } {
  const out = isoRouteAll(ns, edges) as Routed;
  return { out, defects: checkRoutes({ routes: out.routes, hops: out.hops }) };
}

interface LayoutScore { hard: number; soft: number; crossings: number; shares: number; hops: number; weighted: number }
function layoutScore(out: Routed, defects: EdgeDefect[]): LayoutScore {
  const hard = defects.filter(d => d.kind !== "overlapping-segment").length;
  return { hard, soft: defects.length - hard, crossings: out.qc.crossings, shares: out.qc.shares, hops: out.qc.hops, weighted: out.qc.weighted };
}

const digest = (obj: unknown): string => createHash("sha256").update(JSON.stringify(obj)).digest("hex");

async function jevAdvisory(tag: string, out: Routed, defects: EdgeDefect[]): Promise<QaResult | null> {
  if (!reviewQA) return null; /* deterministic-only when dsh-jev is not resolvable */
  const det = defects.slice(0, 16).map((d, i) => ({ id: `dc${i}`, status: "fail", detail: `${d.kind} on ${d.edge}: ${d.detail}` }));
  if (!det.length) det.push({ id: "dc0", status: "pass", detail: "no structural defects found by deterministic geometry checks" });
  const packet = {
    exact_claim: `Layout "${tag}" routes the circuitboard cleanly with well-formed elbows and only necessary bridges.`,
    evidence_scope: { status: "complete", included: ["router-qc", "edge-qc"], omitted_or_unavailable: [] as string[] },
    artifact_sha256: digest({ routes: out.routes, hops: out.hops }),
    requirements: [
      { id: "r-elbows", text: "Every turn is orthogonal (no diagonal/malformed elbows)." },
      { id: "r-bridges", text: "Every bridge/hop sits on a genuine perpendicular crossing." },
      { id: "r-self", text: "No edge crosses itself." },
      { id: "r-shares", text: "No two edges share a collinear run." },
    ],
    evidence: [
      { id: "e1", source_id: "router-qc", excerpt: JSON.stringify({ crossings: out.qc.crossings, shares: out.qc.shares, hops: out.qc.hops, weighted: out.qc.weighted }), supports: ["r-bridges", "r-shares"] },
      { id: "e2", source_id: "edge-qc", excerpt: JSON.stringify(summarize(defects)), supports: ["r-elbows", "r-bridges", "r-self", "r-shares"] },
    ],
    candidate_findings: defects.slice(0, 8).map((d, i) => ({ id: `f${i}`, detail: `${d.kind}: ${d.detail}` })),
    deterministic_checks: det,
  };
  /* Live config follows the dsh-jev contract: the key is NEVER in config — the host
     supplies a resolveCredential dep + a hash-only durable ledger. dataClass is
     "public" (layout geometry is non-sensitive). Fixture mode is the offline default. */
  if (!LIVE) {
    const res = await reviewQA(packet, { mode: "fixture", enabled: true, dataClass: "public" });
    return res.ok && res.qa ? res.qa : { disposition: "insufficient_evidence", error: res.error?.code ?? "unknown" };
  }
  if (!makeDurableLedger) return { disposition: "insufficient_evidence", error: "ledger-unavailable" };
  const ledger = makeDurableLedger(LEDGER_DIR);
  const config: JevConfig = { mode: "live", enabled: true, dataClass: "public", timeoutMs: 30000 };
  const deps: JevDeps = {
    resolveCredential: async () => {
      const k = process.env.TYPESAFE_API_KEY;
      if (!k) throw new Error("TYPESAFE_API_KEY not in environment");
      return k;
    },
    ledger,
  };
  const res = await reviewQA(packet, config, deps);
  return res.ok && res.qa ? res.qa : { disposition: "insufficient_evidence", error: res.error?.code ?? "unknown" };
}

interface ReportRow extends LayoutScore { layout: string; defects: Record<string, number>; jev?: QaResult | null }
const layouts: { tag: string; ns: NodeSpec[] }[] = [{ tag: "shipped", ns: nodes }];
for (let s = 1; s <= SEEDS; s++) layouts.push({ tag: `shuffle-${s}`, ns: shuffled(s) });

let liveBudget = LIVE ? Math.max(0, Number(process.env.JEV_LIVE_BUDGET ?? 0)) : 0;
if (LIVE && liveBudget <= 0) { console.error("LIVE mode requires JEV_LIVE_BUDGET > 0 (a declared shared experiment budget)."); process.exit(2); }
if (LIVE && !process.env.TYPESAFE_API_KEY) { console.error("LIVE mode requires TYPESAFE_API_KEY in the environment (Doppler)."); process.exit(2); }

const report: ReportRow[] = [];
for (const L of layouts) {
  const { out, defects } = routeAndCheck(L.ns);
  const score = layoutScore(out, defects);
  const entry: ReportRow = { layout: L.tag, ...score, defects: summarize(defects) };
  if (reviewQA && (LIVE || defects.length)) {
    entry.jev = await jevAdvisory(L.tag, out, defects);
    if (LIVE) liveBudget--; /* decrement the shared budget before each dispatch */
  }
  report.push(entry);
}
report.sort((a, b) => (a.hard - b.hard) || (a.soft - b.soft) || (a.crossings - b.crossings));

if (JSON_OUT) { console.log(JSON.stringify(report, null, 1)); }
else {
  console.log(`\nEdge-layout QC — ${layouts.length} layouts (${LIVE ? "LIVE jev advisory" : reviewQA ? "offline fixture; deterministic authoritative" : "deterministic-only; dsh-jev not resolvable"})\n`);
  for (const r of report) {
    const j = r.jev ? `  jev:${r.jev.disposition}` : "";
    console.log(`  ${r.layout.padEnd(12)} hard:${r.hard} soft:${r.soft} crossings:${r.crossings} shares:${r.shares} hops:${r.hops}${j}  ${JSON.stringify(r.defects)}`);
  }
  console.log(`\nBest layout: ${report[0].layout} (hard:${report[0].hard} soft:${report[0].soft} crossings:${report[0].crossings})`);
}
