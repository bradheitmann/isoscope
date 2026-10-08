#!/usr/bin/env bun
/* Codebase-to-graph spec generator. Strict TypeScript, run with bun.

   Derives an isoscope spec (nodes + edges) from the REAL module structure of
   this repository instead of hand-authoring the map:

   1. Walks the target source trees (default: original-web/src + original-web/scripts
      plus the repo-root *.ts / *.mjs tools). Override with --src <dir> (repeatable)
      and --root-files.
   2. Regex-parses `import ... from`, `export ... from` and `import(...)` specifiers,
      resolves relative paths to module files, and treats bare specifiers
      (three, vite, node:*, bun:*) as external/vendored nodes.
   3. Groups files into higher-level modules via the GROUPING rule table below so
      the map stays readable (target: 10-25 nodes).
   4. Emits spec JSON matching examples/isoscope.spec.json's core schema
      (title/asOf/groups/nodes/edges/edgeDocs/status). Placement is topological:
      columns = dependency depth (longest import chain), rows within a column.
   5. --check loads the hand-authored spec and reports drift both directions;
      exits non-zero when total drift exceeds --threshold (default: report only).

   Usage:
     bun scripts/codebase-graph.ts [--out <path>] [--src <dir> ...]
                                   [--check [--spec <path>] [--threshold N]] [--json]
*/
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ types */

interface ModuleDef {
  id: string;
  tag: string;
  g: string;
  name: string;
  blurb: string;
}

interface FileRec {
  abs: string;
  rel: string; // repo-relative, posix
  lines: number;
  comment: string; // first leading comment line, if any
  exports: string[];
  imports: string[]; // raw specifiers
}

interface ModAgg {
  def: ModuleDef;
  files: FileRec[];
  deps: Set<string>; // module ids this module imports
}

interface SpecNode {
  id: string;
  tag: string;
  g: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  does: string;
  built: string;
  refs: string;
}

type Edge = [string, string, string?];

/* ------------------------------------------------------------- cli parsing */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, "../..");

interface Cli {
  out: string | null;
  check: boolean;
  specPath: string;
  threshold: number; // Infinity = report-only
  srcs: string[];
  rootFiles: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    out: null,
    check: false,
    specPath: join(REPO, "original-web/examples/isoscope.spec.json"),
    threshold: Number.POSITIVE_INFINITY,
    srcs: [],
    rootFiles: true,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out") cli.out = argv[++i] ?? null;
    else if (a === "--check") cli.check = true;
    else if (a === "--spec") cli.specPath = resolve(argv[++i] ?? "");
    else if (a === "--threshold") cli.threshold = Number(argv[++i]);
    else if (a === "--src") cli.srcs.push(resolve(argv[++i] ?? ""));
    else if (a === "--no-root-files") cli.rootFiles = false;
    else if (a === "--json") cli.json = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (cli.srcs.length === 0) {
    cli.srcs = [join(REPO, "original-web/src"), join(REPO, "original-web/scripts")];
  }
  return cli;
}

/* --------------------------------------------------------------- discovery */

const CODE_EXTS = new Set([".ts", ".mjs", ".tsx"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (CODE_EXTS.has(extname(entry))) out.push(abs);
  }
  return out;
}

function toRel(abs: string): string {
  return relative(REPO, abs).split("\\").join("/");
}

/* ----------------------------------------------------------------- parsing */

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const EXPORT_NAME_RE = /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type)\s+([A-Za-z0-9_]+)/g;

function parseFile(abs: string): FileRec {
  const text = readFileSync(abs, "utf8");
  const imports: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec) imports.push(spec);
  }
  const exports: string[] = [];
  for (const m of text.matchAll(EXPORT_NAME_RE)) exports.push(m[1]!);
  let comment = "";
  for (const raw of text.split("\n").slice(0, 40)) {
    const line = raw.trim();
    if (line.startsWith("//")) comment = line.replace(/^\/\/\s*/, "");
    else if (line.startsWith("/*")) comment = line.replace(/^\/\*+\s*/, "").trimEnd();
    else if (line.startsWith("*") && comment) comment += " " + line.replace(/^\*\s?/, "").replace(/\*\/$/, "").trimEnd();
    else if (comment || line.length > 0) break;
  }
  return {
    abs,
    rel: toRel(abs),
    lines: text.split("\n").length,
    comment: comment.trim(),
    exports,
    imports,
  };
}

/* ---------------------------------------------------------------- grouping */

interface GroupDef {
  id: string;
  label: string;
}

const GROUPS: GroupDef[] = [
  { id: "surface", label: "The web surface (original-web/src)" },
  { id: "tools", label: "Repo-root tools" },
  { id: "vendor", label: "Vendored & external deps" },
  { id: "platform", label: "Runtime platform" },
  { id: "data", label: "Data & specs" },
];

interface Rule {
  match: RegExp; // tested against repo-relative path, or "<ext>:name" for externals
  mod: ModuleDef;
}

const MOD = (id: string, tag: string, g: string, name: string, blurb: string): ModuleDef =>
  ({ id, tag, g, name, blurb });

const RULES: Rule[] = [
  { match: /^original-web\/src\/(main|original-renderer|editable-target)/, mod: MOD("RENDER", "UI", "surface", "Renderer", "Isometric three.js city renderer, editable-target picking, and the app entrypoint.") },
  { match: /^original-web\/src\/annotations/, mod: MOD("ANNOT", "NOTES", "surface", "Annotations", "Per-module notes, faces and media surfaced on buildings.") },
  { match: /^original-web\/src\/telemetry/, mod: MOD("TELEM", "WIDE", "surface", "Telemetry", "Wide events and edge-health feed from the live store.") },
  { match: /^original-web\/src\/edge-qc/, mod: MOD("EQC", "QC", "surface", "Edge QC", "Structural checks on routed edges: malformed elbows, collapsed steps, self-crossings.") },
  { match: /^original-web\/scripts\//, mod: MOD("QCCLI", "QC", "surface", "QC harness", "Headless bun harnesses (edge-layout QC, this generator).") },
  { match: /^original-web\/src\/navigation/, mod: MOD("NAV", "NAV", "surface", "Navigation", "Page navigation tree over the spec.") },
  { match: /^original-web\/src\/theme-order/, mod: MOD("THEME", "THEME", "surface", "Theme order", "Deterministic theme presentation order.") },
  { match: /^original-web\/src\/(router\.d|vite-env|window\.d)/, mod: MOD("TYPES", "TYPES", "surface", "Ambient types", "Type declarations for the .mjs router and DOM env.") },
  { match: /^original-web\/src\//, mod: MOD("RENDER", "UI", "surface", "Renderer", "Isometric three.js city renderer, styles, editable-target picking, and the app entrypoint.") },
  { match: /^router\.mjs$/, mod: MOD("ROUTER", "ROUTE", "tools", "Iso router", "Manhattan isometric edge router shared by web and harnesses.") },
  { match: /^lib\.ts$/, mod: MOD("LIB", "STORE", "tools", "Graph store lib", "SQLite graph store: import/export spec, sensors, CI, history, blast radius.") },
  { match: /^cli\.ts$/, mod: MOD("CLI", "CLI", "tools", "CLI", "Command-line front end to the graph store.") },
  { match: /^mcp\.ts$/, mod: MOD("MCP", "MCP", "tools", "MCP server", "Model-Context-Protocol surface over the store.") },
  { match: /^okoa\.ts$/, mod: MOD("OKOA", "OKOA", "tools", "Okoa", "Okoa tooling entrypoint.") },
  { match: /^drc\.ts$/, mod: MOD("DRC", "DRC", "tools", "DRC", "Design-rule checks over the spec graph.") },
  { match: /^build\.mjs$/, mod: MOD("BUILD", "BUILD", "tools", "Build", "Self-contained HTML build pipeline.") },
  { match: /^original-web\/vendor\/desert-pants/, mod: MOD("VENDOR", "DESERT", "vendor", "desert-pants (vendored)", "Vendored design system: themes, tokens, icons.") },
  { match: /^original-web\/examples\//, mod: MOD("DATA", "DATA", "data", "Example data", "Shipped spec JSON and annotation fixtures.") },
  { match: /^<ext>:(three|three\/)/, mod: MOD("THREE", "3D", "vendor", "three.js", "External 3D engine dependency.") },
  { match: /^<ext>:(node:|bun:|[a-z]+$)/, mod: MOD("PLAT", "RT", "platform", "Runtime builtins", "Node/Bun builtin modules (fs, path, crypto, bun:sqlite, ...).") },
  { match: /^<ext>:/, mod: MOD("EXT", "PKG", "vendor", "External packages", "Other bare-specifier package dependencies.") },
];

const FALLBACK = (rel: string): ModuleDef => {
  const top = rel.split("/").slice(0, 2).join("/");
  return MOD(
    "M" + top.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase(),
    "SRC",
    "surface",
    top,
    `Sources under ${top}.`,
  );
};

function moduleFor(rel: string): ModuleDef {
  for (const r of RULES) if (r.match.test(rel)) return r.mod;
  return FALLBACK(rel);
}

/* ------------------------------------------------------- import resolution */

const RESOLVE_EXTS = ["", ".ts", ".mjs", ".js", ".tsx", ".d.ts", ".json", ".css", ".svg"];

function resolveSpecifier(spec: string, fromAbs: string): { kind: "internal" | "external"; key: string } {
  const clean = spec.replace(/\?.*$/, ""); // strip ?raw etc.
  if (!clean.startsWith(".")) return { kind: "external", key: clean };
  const base = resolve(dirname(fromAbs), clean);
  for (const ext of RESOLVE_EXTS) {
    const cand = base + ext;
    if (existsSync(cand) && statSync(cand).isFile()) {
      return { kind: "internal", key: toRel(cand) };
    }
  }
  for (const idx of ["index.ts", "index.mjs"]) {
    const cand = join(base, idx);
    if (existsSync(cand)) return { kind: "internal", key: toRel(cand) };
  }
  return { kind: "internal", key: toRel(base) }; // unresolved, keep as-is
}

/* --------------------------------------------------------------- topo place */

function depthOf(id: string, deps: Map<string, Set<string>>, memo: Map<string, number>, stack: Set<string>): number {
  const hit = memo.get(id);
  if (hit !== undefined) return hit;
  if (stack.has(id)) return 0; // cycle guard
  stack.add(id);
  let d = 0;
  for (const dep of deps.get(id) ?? []) {
    if (dep === id) continue;
    d = Math.max(d, 1 + depthOf(dep, deps, memo, stack));
  }
  stack.delete(id);
  memo.set(id, d);
  return d;
}

/* ------------------------------------------------------------------- build */

function buildSpec(cli: Cli): { spec: Record<string, unknown>; modules: Map<string, ModAgg>; edges: Edge[] } {
  const files: string[] = [];
  for (const dir of cli.srcs) files.push(...walk(dir, []));
  if (cli.rootFiles) {
    for (const entry of readdirSync(REPO)) {
      const abs = join(REPO, entry);
      if (statSync(abs).isFile() && CODE_EXTS.has(extname(entry))) files.push(abs);
    }
  }
  files.sort();

  const recs = files.map(parseFile);
  const modules = new Map<string, ModAgg>();
  const fileModule = new Map<string, string>(); // rel path -> module id
  const usedIds = new Set<string>();

  const uniqId = (base: string): string => {
    let id = base;
    let n = 2;
    while (usedIds.has(id)) id = `${base}${n++}`;
    usedIds.add(id);
    return id;
  };

  for (const rec of recs) {
    const def = moduleFor(rec.rel);
    let agg = modules.get(def.name);
    if (!agg) {
      agg = { def: { ...def, id: uniqId(def.id) }, files: [], deps: new Set() };
      modules.set(def.name, agg);
    }
    agg.files.push(rec);
    fileModule.set(rec.rel, agg.def.id);
  }

  // module-level dependency edges
  for (const rec of recs) {
    const fromMod = fileModule.get(rec.rel)!;
    const agg = [...modules.values()].find((m) => m.def.id === fromMod)!;
    for (const spec of rec.imports) {
      const r = resolveSpecifier(spec, rec.abs);
      let targetId: string | undefined;
      if (r.kind === "internal") {
        targetId = fileModule.get(r.key);
        if (!targetId) {
          // internal but not scanned (vendor, examples, d.ts shim target) — group via rules
          const def = moduleFor(r.key);
          let m2 = modules.get(def.name);
          if (!m2) {
            m2 = { def: { ...def, id: uniqId(def.id) }, files: [], deps: new Set() };
            modules.set(def.name, m2);
          }
          targetId = m2.def.id;
        }
      } else {
        const def = moduleFor(`<ext>:${r.key}`);
        let m2 = modules.get(def.name);
        if (!m2) {
          m2 = { def: { ...def, id: uniqId(def.id) }, files: [], deps: new Set() };
          modules.set(def.name, m2);
        }
        targetId = m2.def.id;
      }
      if (targetId && targetId !== fromMod) agg.deps.add(targetId);
    }
  }

  // edges: importer -> imported
  const edges: Edge[] = [];
  for (const agg of modules.values()) {
    for (const dep of [...agg.deps].sort()) edges.push([agg.def.id, dep, "data"]);
  }
  edges.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));

  // placement: column = topo depth (leaves left), rows within column
  const depMap = new Map<string, Set<string>>();
  for (const agg of modules.values()) depMap.set(agg.def.id, agg.deps);
  const memo = new Map<string, number>();
  const byDepth = new Map<number, string[]>();
  for (const agg of modules.values()) {
    const d = depthOf(agg.def.id, depMap, memo, new Set());
    const list = byDepth.get(d) ?? [];
    list.push(agg.def.id);
    byDepth.set(d, list);
  }

  const nodes: SpecNode[] = [];
  const occupied = new Set<string>();
  for (const [depth, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    ids.sort();
    ids.forEach((id, row) => {
      const agg = [...modules.values()].find((m) => m.def.id === id)!;
      let x = depth * 3;
      let y = row * 2;
      while (occupied.has(`${x},${y}`)) y += 2;
      occupied.add(`${x},${y}`);
      const lines = agg.files.reduce((n, f) => n + f.lines, 0);
      const exports = [...new Set(agg.files.flatMap((f) => f.exports))].slice(0, 6);
      const does = agg.files.map((f) => f.comment).find((c) => c.length > 24) ?? agg.def.blurb;
      const builtParts = [
        agg.files.length > 0
          ? `${agg.files.length} file${agg.files.length === 1 ? "" : "s"}, ~${lines} lines`
          : "external / not scanned",
      ];
      if (exports.length > 0) builtParts.push(`exports: ${exports.join(", ")}`);
      nodes.push({
        id,
        tag: agg.def.tag,
        g: agg.def.g,
        name: agg.def.name,
        x, y,
        w: 1, d: 1,
        h: Math.max(1, Math.min(4, Math.round(lines / 400) || 1)),
        does: does.slice(0, 280),
        built: builtParts.join(" · "),
        refs: agg.files.length > 0 ? agg.files.map((f) => f.rel).join(" · ") : "(external)",
        media: [],   /* no surfaces assigned in the derived view */
        tags: [],    /* no curated tags in the derived view */
      });
    });
  }

  const usedGroups = new Set(nodes.map((n) => n.g));
  const status: Record<string, { state: string; items: unknown[] }> = {};
  for (const n of nodes) status[n.id] = { state: "ok", items: [] };

  const today = new Date().toISOString().slice(0, 10);
  /* edgeDocs is a Record keyed "A-B" (the renderer reads EDGEDOCS[key].title), and
     the full schema must be present so no renderer read ever hits undefined. */
  const edgeDocs: Record<string, { title?: string; carries?: string; refs?: string }> = {};
  for (const e of edges) edgeDocs[`${e[0]}-${e[1]}`] = { title: "import", carries: "module dependency", refs: "" };
  const short: Record<string, string> = {};
  /* levels come from dependency depth so the 3-level Stack view separates the tiers:
     leaf/foundation modules low, mid-tier in the middle, the app's own top last. */
  const levels: Record<string, number> = {};
  const depthOfNode = new Map<string, number>();
  for (const [d, ids] of byDepth.entries()) for (const id of ids) depthOfNode.set(id, d);
  const maxDepth = Math.max(1, ...[...depthOfNode.values()]);
  for (const n of nodes) {
    short[n.id] = n.name;
    const d = depthOfNode.get(n.id) ?? 0;
    levels[n.id] = Math.min(2, Math.round((d / maxDepth) * 2)); /* collapse depth to 3 tiers */
  }
  const spec = {
    title: "Isoscope — derived from the actual codebase",
    wordmark: "ISOSCOPE",
    asOf: `As of ${today} · generated by scripts/codebase-graph.ts`,
    brand: { k: "View", v: "codebase · derived from imports" },
    metrics: [],
    intro: { eyebrow: "codebase view", title: "The codebase, as it actually is", sub: "modules and import edges, derived from the source — not hand-drawn", proseHTML: "" },
    groups: GROUPS.filter((g) => usedGroups.has(g.id)),
    nodes,
    short,
    status,
    levels,
    paths: {},
    edges,
    edgeStatus: {},
    edgeDocs,
    trace: [],
    traceText: {},
    telemetry: {},
    mediaLibrary: [],
  };
  return { spec, modules, edges };
}

/* ------------------------------------------------------------------- check */

interface Drift {
  missingNodes: string[]; // in code graph, not in spec
  extraNodes: string[]; // in spec, not in code graph
  missingEdges: string[];
  extraEdges: string[];
  total: number;
}

function checkDrift(cli: Cli, nodes: SpecNode[], edges: Edge[]): Drift {
  const spec = JSON.parse(readFileSync(cli.specPath, "utf8")) as {
    nodes: Array<{ id: string }>;
    edges: Edge[];
  };
  const specNodes = new Set(spec.nodes.map((n) => n.id));
  const codeNodes = new Set(nodes.map((n) => n.id));
  const specEdges = new Set(spec.edges.map((e) => `${e[0]}->${e[1]}`));
  const codeEdges = new Set(edges.map((e) => `${e[0]}->${e[1]}`));
  const missingNodes = [...codeNodes].filter((n) => !specNodes.has(n)).sort();
  const extraNodes = [...specNodes].filter((n) => !codeNodes.has(n)).sort();
  const missingEdges = [...codeEdges].filter((e) => !specEdges.has(e)).sort();
  const extraEdges = [...specEdges].filter((e) => !codeEdges.has(e)).sort();
  return {
    missingNodes,
    extraNodes,
    missingEdges,
    extraEdges,
    total: missingNodes.length + extraNodes.length + missingEdges.length + extraEdges.length,
  };
}

/* -------------------------------------------------------------------- main */

const cli = parseArgs(process.argv.slice(2));
const { spec, modules, edges } = buildSpec(cli);

if (cli.out) {
  writeFileSync(cli.out, JSON.stringify(spec, null, 1) + "\n");
} else {
  process.stdout.write(JSON.stringify(spec, null, 1) + "\n");
}

const summary = {
  filesScanned: [...modules.values()].reduce((n, m) => n + m.files.length, 0),
  modules: modules.size,
  edges: edges.length,
  moduleIds: [...modules.values()].map((m) => m.def.id).sort(),
};
process.stderr.write(
  `codebase-graph: ${summary.filesScanned} files -> ${summary.modules} modules, ${summary.edges} edges` +
    (cli.out ? ` -> ${cli.out}` : " (stdout)") + "\n",
);

if (cli.check) {
  const nodes = (spec as { nodes: SpecNode[] }).nodes;
  const drift = checkDrift(cli, nodes, edges);
  const report = {
    spec: toRel(cli.specPath),
    threshold: Number.isFinite(cli.threshold) ? cli.threshold : "report-only",
    ...drift,
  };
  process.stderr.write(`drift vs ${basename(cli.specPath)}: total=${drift.total}\n`);
  process.stderr.write(`  missing nodes (in code, not in spec): ${drift.missingNodes.join(", ") || "-"}\n`);
  process.stderr.write(`  extra nodes   (in spec, not in code): ${drift.extraNodes.join(", ") || "-"}\n`);
  process.stderr.write(`  missing edges: ${drift.missingEdges.length}  extra edges: ${drift.extraEdges.length}\n`);
  if (cli.json) process.stdout.write(JSON.stringify(report, null, 1) + "\n");
  if (drift.total > cli.threshold) {
    process.stderr.write(`drift ${drift.total} exceeds threshold ${cli.threshold}\n`);
    process.exit(1);
  }
}
