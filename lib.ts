/* isoscope core — SQLite graph store ⇄ spec. Shared by cli.ts and mcp.ts. Zero deps. */
import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync } from "fs";
import { buildHtml } from "./build.mjs";

export const DB_DEFAULT = "isoscope.db";
export type Spec = Record<string, any>;

export function open(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  return db;
}

export function importSpec(db: Database, spec: Spec): void {
  const tx = db.transaction(() => {
    for (const t of ["trace_steps", "edges", "status_items", "node_paths", "nodes", "groups", "meta"])
      db.exec(`DELETE FROM ${t};`);
    const meta = db.prepare("INSERT INTO meta(key,value) VALUES(?,?)");
    const flat: Record<string, string> = {
      title: spec.title ?? "", wordmark: spec.wordmark ?? "", asOf: spec.asOf ?? "",
      "brand.k": spec.brand?.k ?? "", "brand.v": spec.brand?.v ?? "",
      "intro.eyebrow": spec.intro?.eyebrow ?? "", "intro.title": spec.intro?.title ?? "",
      "intro.sub": spec.intro?.sub ?? "", "intro.proseHTML": spec.intro?.proseHTML ?? "",
      metrics: JSON.stringify(spec.metrics ?? []),
      drcBudget: JSON.stringify(spec.drcBudget ?? null),
    };
    for (const [k, v] of Object.entries(flat)) meta.run(k, v);
    const g = db.prepare("INSERT INTO groups(id,label,ord) VALUES(?,?,?)");
    (spec.groups ?? []).forEach((x: any, i: number) => g.run(x.id, x.label, i));
    const n = db.prepare(`INSERT INTO nodes(id,tag,grp,name,short,x,y,w,d,h,stack,level,state,does,built,refs,good,cond)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const si = db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)");
    for (const x of spec.nodes ?? []) {
      n.run(x.id, x.tag ?? null, x.g, x.name, spec.short?.[x.id] ?? null,
            x.x, x.y, x.w ?? 1, x.d ?? 1, x.h ?? 1, x.stack ?? null,
            spec.levels?.[x.id] ?? 0, spec.status?.[x.id]?.state ?? "ok",
            x.does ?? null, x.built ?? null, x.refs ?? null, x.good ?? null, x.cond ?? null);
      (spec.status?.[x.id]?.items ?? []).forEach((it: any, i: number) =>
        si.run(x.id, i, it.c === "you" ? "you" : it.c, it.l));
      for (const p of spec.paths?.[x.id] ?? [])
        db.prepare("INSERT INTO node_paths(node_id,prefix) VALUES(?,?)").run(x.id, p);
    }
    const e = db.prepare("INSERT INTO edges(src,dst,type,health,title,carries,refs) VALUES(?,?,?,?,?,?,?)");
    for (const [src, dst, type] of spec.edges ?? []) {
      const k = `${src}-${dst}`, d = spec.edgeDocs?.[k] ?? {};
      e.run(src, dst, type ?? "data", spec.edgeStatus?.[k] ?? null,
            d.title ?? null, d.carries ?? null, d.refs ?? null);
    }
    const t = db.prepare("INSERT INTO trace_steps(ord,src,dst,narration) VALUES(?,?,?,?)");
    (spec.trace ?? []).forEach((k: string, i: number) => {
      const [src, dst] = k.split("-");
      t.run(i, src, dst, spec.traceText?.[k] ?? "");
    });
  });
  tx();
}

export function exportSpec(db: Database): Spec {
  const meta = Object.fromEntries(
    (db.query("SELECT key,value FROM meta").all() as any[]).map(r => [r.key, r.value]));
  const spec: Spec = {
    title: meta.title, wordmark: meta.wordmark, asOf: meta.asOf,
    brand: { k: meta["brand.k"], v: meta["brand.v"] },
    metrics: JSON.parse(meta.metrics || "[]"),
    intro: { eyebrow: meta["intro.eyebrow"], title: meta["intro.title"],
             sub: meta["intro.sub"], proseHTML: meta["intro.proseHTML"] },
    groups: (db.query("SELECT id,label FROM groups ORDER BY ord").all() as any[]),
    nodes: [], short: {}, status: {}, levels: {}, paths: {},
    edges: [], edgeStatus: {}, edgeDocs: {}, trace: [], traceText: {},
  };
  // The routing budget is authored, not derived — it must survive a round trip
  // or export→edit→import silently disarms the DRC lint.
  const budget = JSON.parse(meta.drcBudget || "null");
  if (budget) spec.drcBudget = budget;
  for (const r of db.query("SELECT * FROM nodes").all() as any[]) {
    const node: Spec = { id: r.id, tag: r.tag, g: r.grp, name: r.name,
      x: r.x, y: r.y, w: r.w, d: r.d, h: r.h,
      does: r.does, built: r.built, refs: r.refs };
    if (r.stack != null) node.stack = r.stack;
    if (r.good) node.good = r.good;
    if (r.cond) node.cond = r.cond;
    spec.nodes.push(node);
    if (r.short) spec.short[r.id] = r.short;
    if (r.level) spec.levels[r.id] = r.level;
    const items = (db.query("SELECT class,label FROM status_items WHERE node_id=? ORDER BY ord")
      .all(r.id) as any[]).map(i => ({ c: i.class, l: i.label }));
    spec.status[r.id] = { state: r.state, items };
    const pp = (db.query("SELECT prefix FROM node_paths WHERE node_id=?").all(r.id) as any[]).map(p => p.prefix);
    if (pp.length) spec.paths[r.id] = pp;
  }
  for (const r of db.query("SELECT * FROM edges").all() as any[]) {
    spec.edges.push([r.src, r.dst, r.type]);
    const k = `${r.src}-${r.dst}`;
    if (r.health) spec.edgeStatus[k] = r.health;
    if (r.title || r.carries || r.refs) {
      const d: Spec = {};
      if (r.title) d.title = r.title;
      if (r.carries) d.carries = r.carries;
      if (r.refs) d.refs = r.refs;
      spec.edgeDocs[k] = d;
    }
  }
  for (const r of db.query("SELECT * FROM trace_steps ORDER BY ord").all() as any[]) {
    const k = `${r.src}-${r.dst}`;
    spec.trace.push(k);
    if (r.narration) spec.traceText[k] = r.narration;
  }
  return spec;
}

