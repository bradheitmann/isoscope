#!/usr/bin/env bun
/* isoscope CLI — thin face over lib.ts.
     bun cli.ts init   [db]                    create an empty graph store
     bun cli.ts import <spec.json> [db]        spec → db (replaces graph content)
     bun cli.ts export [db] [--out spec.json]  db → spec
     bun cli.ts build  [db] <out.html>         db → spec → self-contained map      */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { buildHtml } from "./build.mjs";
import { DB_DEFAULT, open, importSpec, exportSpec, proposeSensor, setSensor, normalizeCi, applyCi, detectCiProvider, blastRadius, withHistory, markNode, overview } from "./lib.ts";

/* write a file, creating its parent directory first (fresh clones have no out/) */
const writeOut = (path: string, data: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };

const [cmd, ...args] = Bun.argv.slice(2);
switch (cmd) {
  case "overview": {
    const db = open(args[0] ?? DB_DEFAULT);
    try { console.log(JSON.stringify(overview(db))); } finally { db.close(); }
    break;
  }
  case "init": {
    open(args[0] ?? DB_DEFAULT).close();
    console.log(`isoscope: graph store ready at ${args[0] ?? DB_DEFAULT}`);
    break;
  }
  case "import": {
    const [specPath, dbPath = DB_DEFAULT] = args;
    if (!specPath) { console.error("usage: cli.ts import <spec.json> [db]"); process.exit(1); }
    const db = open(dbPath);
    importSpec(db, JSON.parse(readFileSync(specPath, "utf8")));
    const counts = db.query("SELECT (SELECT count(*) FROM nodes) n,(SELECT count(*) FROM edges) e").get() as any;
    console.log(`isoscope: imported ${specPath} → ${dbPath} · ${counts.n} nodes · ${counts.e} edges`);
    db.close();
    break;
  }
  case "export": {
    const dbPath = args.find(a => !a.startsWith("--")) ?? DB_DEFAULT;
    const outIdx = args.indexOf("--out");
    const spec = exportSpec(open(dbPath));
    const json = JSON.stringify(spec, null, 1);
    if (outIdx >= 0) { writeOut(args[outIdx + 1], json); console.log(`isoscope: exported ${dbPath} → ${args[outIdx + 1]}`); }
    else console.log(json);
    break;
  }
  case "build": {
    const [dbPath = DB_DEFAULT, outPath] = args;
    if (!outPath) { console.error("usage: cli.ts build [db] <out.html>"); process.exit(1); }
    const spec = exportSpec(open(dbPath));
    writeOut(outPath, buildHtml(spec, { specLabel: dbPath }));
    console.log(`isoscope: built ${outPath} from ${dbPath} · ${spec.nodes.length} modules · ${spec.edges.length} links`);
    break;
  }
  case "render": {
    /* spec → map in one step, through a per-run temporary store that is removed afterwards.
       bun cli.ts render <spec.json> <out.html> */
    const [specPath, outPath] = args;
    if (!specPath || !outPath) { console.error("usage: cli.ts render <spec.json> <out.html>"); process.exit(1); }
    const dir = mkdtempSync(join(tmpdir(), "isoscope-"));
    const dbPath = join(dir, "render.db");
    try {
      const db = open(dbPath);
      importSpec(db, JSON.parse(readFileSync(specPath, "utf8")));
      db.close();
      const rdb = open(dbPath);
      const spec = exportSpec(rdb);
      rdb.close();
      writeOut(outPath, buildHtml(spec, { specLabel: specPath }));
      console.log(`isoscope: rendered ${outPath} from ${specPath} · ${spec.nodes.length} modules · ${spec.edges.length} links`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    break;
  }
  case "ingest": {
    /* Review/scan reports → the map (Greptile, CodeRabbit, CodeQL, semgrep, …).
       bun cli.ts ingest <db> <findings.json> [--sarif] [--source name] [--replace]
       Normalized findings: [{path, severity: "error"|"warn"|"note", message, source?}]
       --sarif reads a SARIF 2.x log instead. Attribution: longest node_paths prefix match. */
    const [dbPath, file] = args;
    if (!dbPath || !file) { console.error("usage: cli.ts ingest <db> <findings.json> [--sarif] [--source name] [--replace]"); process.exit(2); }
    const srcIdx = args.indexOf("--source");
    const defSource = srcIdx >= 0 ? args[srcIdx + 1] : "review";
    const raw = JSON.parse(readFileSync(file, "utf8"));
    let findings: { path: string; severity: string; message: string; source?: string }[];
    if (args.includes("--sarif")) {
      findings = (raw.runs ?? []).flatMap((run: any) => {
        const tool = run.tool?.driver?.name ?? defSource;
        return (run.results ?? []).map((r: any) => ({
          path: r.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "",
          severity: r.level === "error" ? "error" : r.level === "warning" ? "warn" : "note",
          message: r.message?.text ?? "", source: tool,
        }));
      });
    } else findings = raw;
    const db = open(dbPath);
    let placed = 0, orphans = 0;
    withHistory(db,() => {
      const prefixes = db.query("SELECT node_id,prefix FROM node_paths").all() as any[];
      const attribute = (p: string) => {
        let best: any = null;
        for (const row of prefixes)
          if (p.startsWith(row.prefix) && (!best || row.prefix.length > best.prefix.length)) best = row;
        return best?.node_id ?? null;
      };
      if (args.includes("--replace"))
        db.prepare("DELETE FROM status_items WHERE label LIKE ?").run(`[${defSource}]%`);
      for (const f of findings) {
        const id = attribute(f.path);
        if (!id) { orphans++; continue; }
        const cls = f.severity === "error" ? "red" : "amber";
        const ord = (db.query("SELECT COALESCE(MAX(ord)+1,0) o FROM status_items WHERE node_id=?").get(id) as any).o;
        db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)")
          .run(id, ord, cls, `[${f.source ?? defSource}] ${f.message} (${f.path})`);
        placed++;
      }
    });
    db.close();
    console.log(`isoscope: ingested ${placed} finding(s) onto the map` + (orphans ? ` · ${orphans} unattributed (no owning module — extend paths in the spec)` : ""));
    break;
  }
  case "mark": {
    /* CI/agents: set a module's status — the live map repaints, red shows where it broke.
       bun cli.ts mark <db> <nodeId> [--state ok|attn|build] [--red msg] [--amber msg] [--you msg] [--clear] */
    const [dbPath, nodeId] = args;
    if (!dbPath || !nodeId) { console.error("usage: cli.ts mark <db> <nodeId> [--state s] [--red m] [--amber m] [--you m] [--clear]"); process.exit(2); }
    const db = open(dbPath);
    const exists = db.query("SELECT 1 FROM nodes WHERE id=?").get(nodeId);
    if (!exists) { console.error(`no such module: ${nodeId}`); process.exit(2); }
    const sIdx = args.indexOf("--state");
    const append: { c: string; l: string }[] = [];
    for (const cls of ["red","amber","you"] as const) {
      let i = -1;
      while ((i = args.indexOf(`--${cls}`, i+1)) >= 0) {
        append.push({ c: cls, l: args[i+1] });
      }
    }
    markNode(db,{ id: nodeId, state: sIdx >= 0 ? args[sIdx+1] : undefined, clear: args.includes("--clear"), append });
    db.close();
    console.log(`isoscope: marked ${nodeId} — every live map repaints`);
    break;
  }
  case "ci": {
    /* CI/CD webhook payload → the map. Failing job = red on its module; passing = healed.
       bun cli.ts ci <db> <payload.json> --provider github|gitlab|buildkite [--dry]
       Job→module mapping: spec `ci.jobs` {"job name or glob*": "ID"} · `ci.default` · fallbacks: node id/short/tag. */
    const [dbPath, file] = args;
    const pIdx = args.indexOf("--provider");
    if (!dbPath || !file || pIdx < 0) { console.error("usage: cli.ts ci <db> <payload.json> --provider github|gitlab|buildkite|signal [--dry]"); process.exit(2); }
    const events = normalizeCi(args[pIdx + 1], JSON.parse(readFileSync(file, "utf8")));
    if (args.includes("--dry")) { console.log(JSON.stringify(events, null, 1)); break; }
    const db = open(dbPath);
    const r = applyCi(db, events);
    db.close();
    console.log(`isoscope: ci ${events.length} event(s) · marked ${r.marked.length} · healed ${r.cleared.length}` + (r.orphans.length ? ` · unmapped: ${r.orphans.join(", ")} (add ci.jobs to the spec)` : ""));
    break;
  }
  case "blast-radius": {
    /* the incident scope as JSON — what a remediation agent may touch. bun cli.ts blast-radius <db> */
    const db = open(args[0] ?? DB_DEFAULT); console.log(JSON.stringify(blastRadius(db), null, 1)); db.close(); break;
  }
  case "sensor": {
    /* seams → sensors for non-MCP harnesses.
       bun cli.ts sensor <db> <nodeId> --offer "why" [--stream s] [--keys a,b] [--force]
       bun cli.ts sensor <db> <nodeId> --state installed|verified|declined|proposed [--stream s] [--keys a,b] [--by who] */
    const [dbPath, nodeId] = args;
    if (!dbPath || !nodeId) { console.error("usage: cli.ts sensor <db> <nodeId> (--offer why | --state s) [--stream s] [--keys a,b] [--by who] [--force]"); process.exit(2); }
    const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : undefined; };
    const keys = opt("--keys")?.split(",").map(s => s.trim()).filter(Boolean);
    const db = open(dbPath);
    let r: any;
    if (opt("--offer")) r = proposeSensor(db, { id: nodeId, rationale: opt("--offer")!, event_stream: opt("--stream"), wide_event_keys: keys, force: args.includes("--force") });
    else if (opt("--state")) r = setSensor(db, { id: nodeId, trace_boundary: opt("--state")!, event_stream: opt("--stream"), wide_event_keys: keys, installed_by: opt("--by"), rationale: opt("--why") });
    else { console.error("sensor: need --offer <why> or --state <s>"); process.exit(2); }
    db.close();
    console.log(`isoscope: sensor ${nodeId} → ${r.outcome}`);
    break;
  }
  case "install-hook": {
    /* bun cli.ts install-hook <target-repo> <db-path> [--spec-out path] — post-commit keeps the map true */
    const [repo, dbPath] = args;
    if (!repo || !dbPath) { console.error("usage: cli.ts install-hook <target-repo> <db-path> [--spec-out path]"); process.exit(2); }
    const specIdx = args.indexOf("--spec-out");
    const here = new URL(".", import.meta.url).pathname;
    const specLine = specIdx >= 0 ? `bun ${here}cli.ts export ${dbPath} --out ${args[specIdx+1]}\n` : "";
    const hook = `#!/bin/sh\n# isoscope post-commit — the map never trails reality\n${specLine}touch ${dbPath}\n`;
    const path = `${repo}/.git/hooks/post-commit`;
    writeFileSync(path, hook, { mode: 0o755 });
    console.log(`isoscope: hook installed at ${path}`);
    break;
  }
  case "serve": {
    const dbPath = args.find(a => !a.startsWith("--")) ?? DB_DEFAULT;
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 4177;
    open(dbPath).close(); // ensure store exists
    const clients = new Set<ReadableStreamDefaultController>();
    const { watch } = await import("fs");
    let debounce: ReturnType<typeof setTimeout> | null = null;
    watch(dbPath, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        for (const c of clients) { try { c.enqueue("event: update\ndata: {}\n\n"); } catch {} }
      }, 150);
    });
    Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/spec.json")
          return Response.json(exportSpec(open(dbPath)));
        if (url.pathname === "/blast-radius") { const d = open(dbPath); const r = blastRadius(d); d.close(); return Response.json(r); }
        if (url.pathname === "/mark" && req.method === "POST") {
          /* CI/CD → red building: POST {id,state?,items?:[{c,l}]}; optional ISOSCOPE_TOKEN auth */
          const token = Bun.env.ISOSCOPE_TOKEN;
          if (token && req.headers.get("authorization") !== `Bearer ${token}`)
            return new Response("unauthorized", { status: 401 });
          return req.json().then((b: any) => {
            const d = open(dbPath);
            if (!d.query("SELECT 1 FROM nodes WHERE id=?").get(b.id)) { d.close(); return new Response("no such module", { status: 404 }); }
            try { markNode(d,{ id: b.id, state: b.state, items: Array.isArray(b.items) ? b.items : undefined }); }
            finally { d.close(); }
            return Response.json({ marked: b.id });
          });
        }
        if (url.pathname === "/ci" && req.method === "POST") {
          /* CI/CD webhooks straight in: provider from ?provider= or the X-GitHub-Event / X-Gitlab-Event / X-Buildkite-Event header */
          const token = Bun.env.ISOSCOPE_TOKEN;
          if (token && req.headers.get("authorization") !== `Bearer ${token}`)
            return new Response("unauthorized", { status: 401 });
          const provider = url.searchParams.get("provider") ?? detectCiProvider(req.headers);
          if (!provider) return new Response("provider? (?provider=github|gitlab|buildkite|signal or provider event header)", { status: 400 });
          return req.json().then((b: any) => {
            let events; try { events = normalizeCi(provider, b); } catch (e: any) { return new Response(e.message, { status: 400 }); }
            const d = open(dbPath); const r = applyCi(d, events); d.close();
            return Response.json({ provider, events: events.length, ...r });
          });
        }
        if (url.pathname === "/events") {
          let ctrl: ReadableStreamDefaultController;
          const stream = new ReadableStream({
            start(c) { ctrl = c; clients.add(c); c.enqueue("event: hello\ndata: {}\n\n"); },
            cancel() { clients.delete(ctrl); },
          });
          return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
        }
        const html = buildHtml(exportSpec(open(dbPath)), { specLabel: dbPath })
          .replace("<head>", "<head>\n<script>window.__ISOSCOPE_LIVE=1<\/script>");
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    });
    console.log(`isoscope: live at http://localhost:${port} · watching ${dbPath} — every store change repaints the map`);
    break;
  }
  default:
    console.log("isoscope · graph store CLI\n  init [db] · import <spec.json> [db] · export [db] [--out spec.json] · overview <db> · build [db] <out.html> · render <spec.json> <out.html> · serve [db] [--port 4177]\n  incident loop: mark <db> <id> … · ingest <db> <findings.json> [--sarif] · ci <db> <payload.json> --provider github|gitlab|buildkite|signal · blast-radius <db> · sensor <db> <id> --offer|--state\n  install-hook <repo> <db> · lint: bun drc.ts <spec.json|db> [--budget N]");
}
