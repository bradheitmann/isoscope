#!/usr/bin/env bun
/* isoscope CLI — thin face over lib.ts.
     bun cli.ts init   [db]                    create an empty graph store
     bun cli.ts import <spec.json> [db]        spec → db (replaces graph content)
     bun cli.ts export [db] [--out spec.json]  db → spec
     bun cli.ts build  [db] <out.html>         db → spec → self-contained map      */
import { readFileSync, writeFileSync } from "fs";
import { buildHtml } from "./build.mjs";
import { DB_DEFAULT, open, importSpec, exportSpec } from "./lib.ts";

const [cmd, ...args] = Bun.argv.slice(2);
switch (cmd) {
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
    if (outIdx >= 0) { writeFileSync(args[outIdx + 1], json); console.log(`isoscope: exported ${dbPath} → ${args[outIdx + 1]}`); }
    else console.log(json);
    break;
  }
  case "build": {
    const [dbPath = DB_DEFAULT, outPath] = args;
    if (!outPath) { console.error("usage: cli.ts build [db] <out.html>"); process.exit(1); }
    const spec = exportSpec(open(dbPath));
    writeFileSync(outPath, buildHtml(spec, { specLabel: dbPath }));
    console.log(`isoscope: built ${outPath} from ${dbPath} · ${spec.nodes.length} modules · ${spec.edges.length} links`);
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
    console.log("isoscope · graph store CLI\n  init [db] · import <spec.json> [db] · export [db] [--out spec.json] · build [db] <out.html> · serve [db] [--port 4177]");
}
