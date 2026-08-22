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
  case "mark": {
    /* CI/agents: set a module's status — the live map repaints, red shows where it broke.
       bun cli.ts mark <db> <nodeId> [--state ok|attn|build] [--red msg] [--amber msg] [--you msg] [--clear] */
    const [dbPath, nodeId] = args;
    if (!dbPath || !nodeId) { console.error("usage: cli.ts mark <db> <nodeId> [--state s] [--red m] [--amber m] [--you m] [--clear]"); process.exit(2); }
    const db = open(dbPath);
    const exists = db.query("SELECT 1 FROM nodes WHERE id=?").get(nodeId);
    if (!exists) { console.error(`no such module: ${nodeId}`); process.exit(2); }
    const sIdx = args.indexOf("--state");
    if (sIdx >= 0) db.prepare("UPDATE nodes SET state=? WHERE id=?").run(args[sIdx+1], nodeId);
    if (args.includes("--clear")) db.prepare("DELETE FROM status_items WHERE node_id=?").run(nodeId);
    for (const cls of ["red","amber","you"] as const) {
      let i = -1;
      while ((i = args.indexOf(`--${cls}`, i+1)) >= 0) {
        const ord = (db.query("SELECT COALESCE(MAX(ord)+1,0) o FROM status_items WHERE node_id=?").get(nodeId) as any).o;
        db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)").run(nodeId, ord, cls, args[i+1]);
      }
    }
    db.close();
    console.log(`isoscope: marked ${nodeId} — every live map repaints`);
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
        if (url.pathname === "/mark" && req.method === "POST") {
          /* CI/CD → red building: POST {id,state?,items?:[{c,l}]}; optional ISOSCOPE_TOKEN auth */
          const token = Bun.env.ISOSCOPE_TOKEN;
          if (token && req.headers.get("authorization") !== `Bearer ${token}`)
            return new Response("unauthorized", { status: 401 });
          return req.json().then((b: any) => {
            const d = open(dbPath);
            if (!d.query("SELECT 1 FROM nodes WHERE id=?").get(b.id)) { d.close(); return new Response("no such module", { status: 404 }); }
            if (b.state) d.prepare("UPDATE nodes SET state=? WHERE id=?").run(b.state, b.id);
            if (Array.isArray(b.items)) {
              d.prepare("DELETE FROM status_items WHERE node_id=?").run(b.id);
              const si = d.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)");
              b.items.forEach((it: any, i: number) => si.run(b.id, i, it.c, it.l));
            }
            d.close();
            return Response.json({ marked: b.id });
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
    console.log("isoscope · graph store CLI\n  init [db] · import <spec.json> [db] · export [db] [--out spec.json] · build [db] <out.html> · serve [db] [--port 4177]\n  lint: bun drc.ts <spec.json|db> [--budget N]");
}
