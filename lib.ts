/* isoscope core — SQLite graph store ⇄ spec. Shared by cli.ts and mcp.ts. Zero deps. */
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

export const DB_DEFAULT = "isoscope.db";
export type Spec = Record<string, any>;

export function open(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  return db;
}

/* One outer operation owns the transaction, timestamp, and net change log.
   Snapshot all affected tables: CI/ingest can clear items outside their targets.
   Nested helpers participate without producing intermediate or duplicate rows. */
const historyCalls = new WeakMap<Database, string>();
type HistoryNode = { row: Spec; items: Spec[]; paths: string[]; telemetry: Spec | null };
function historySnapshot(db: Database) {
  const nodes = new Map<string, HistoryNode>();
  for (const row of db.query("SELECT * FROM nodes ORDER BY id").all() as Spec[])
    nodes.set(row.id, { row, items: [], paths: [], telemetry: null });
  for (const { node_id, class: c, label } of db.query("SELECT node_id,class,label FROM status_items ORDER BY node_id,ord").all() as Spec[])
    nodes.get(node_id)?.items.push({ c, label });
  for (const { node_id, prefix } of db.query("SELECT node_id,prefix FROM node_paths ORDER BY node_id,prefix").all() as Spec[])
    nodes.get(node_id)?.paths.push(prefix);
  for (const row of db.query("SELECT * FROM telemetry ORDER BY node_id").all() as Spec[]) {
    if (row.wide_event_keys != null) row.wide_event_keys = JSON.parse(row.wide_event_keys);
    if (nodes.has(row.node_id)) nodes.get(row.node_id)!.telemetry = row;
  }
  const edges = new Map<string, Spec>();
  for (const row of db.query("SELECT * FROM edges ORDER BY src,dst").all() as Spec[])
    edges.set(JSON.stringify([row.src, row.dst]), row);
  return { nodes, edges };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function appendHistory(db: Database, before: ReturnType<typeof historySnapshot>, after: ReturnType<typeof historySnapshot>, at: string) {
  const insert = db.prepare("INSERT INTO node_history(node_id,at,session,kind,detail) VALUES(?,?,?,?,?)");
  const log = (id: string, kind: string, detail: string) => insert.run(id, at, at.slice(0,10), kind, detail);
  const edgeChanges = new Map<string, Map<string, string[]>>();
  for (const key of new Set([...before.edges.keys(), ...after.edges.keys()])) {
    const a = before.edges.get(key), b = after.edges.get(key);
    if (same(a,b)) continue;
    const kind = !a ? "edge_added" : !b ? "edge_removed" : "edge_changed", e = b ?? a!;
    for (const id of new Set<string>([e.src,e.dst])) {
      if (!before.nodes.has(id) || !after.nodes.has(id)) continue; // creation/deletion wins
      if (!edgeChanges.has(id)) edgeChanges.set(id,new Map());
      const kinds = edgeChanges.get(id)!;
      if (!kinds.has(kind)) kinds.set(kind,[]);
      kinds.get(kind)!.push(`${e.src}-${e.dst}`);
    }
  }
  for (const id of [...new Set([...before.nodes.keys(), ...after.nodes.keys()])].sort()) {
    const a = before.nodes.get(id), b = after.nodes.get(id);
    if (!a) { log(id,"created",id); continue; }
    if (!b) { log(id,"deleted",id); continue; }
    const changed = (fields: string[]) => fields.filter(f => !same(a.row[f],b.row[f]));
    const detail = (fields: string[]) => fields.map(f => `${f}:${a.row[f]}→${b.row[f]}`).join(" ");
    if (changed(["x","y"]).length) log(id,"moved",detail(["x","y"]));
    const resized = changed(["w","d","h","stack","level"]);
    if (resized.length) log(id,"resized",detail(resized));
    const renamed = changed(["name","short","tag","grp"]);
    if (renamed.length) log(id,"renamed",detail(renamed));
    const documented = changed(["does","built","refs","good","cond"]);
    if (documented.length) log(id,"redocumented","fields:"+documented.join(","));
    if (a.row.state !== b.row.state || !same(a.items,b.items))
      log(id,"status",`state:${b.row.state} items:${b.items.length} red:${b.items.filter(i => i.c === "red").length}`);
    for (const kind of ["edge_added","edge_removed","edge_changed"]) {
      const keys = edgeChanges.get(id)?.get(kind);
      if (keys?.length) log(id,kind,keys.sort().join(","));
    }
    if (!same(a.paths,b.paths)) log(id,"path",`${b.paths.length} prefixes`);
    if (!same(a.telemetry,b.telemetry)) log(id,"telemetry",b.telemetry ? `trace_boundary:${b.telemetry.trace_boundary}` : "removed");
  }
}
export function withHistory<T>(db: Database, mutate: (at: string) => T): T {
  const active = historyCalls.get(db);
  if (active) return mutate(active);
  return db.transaction(() => {
    const at = new Date().toISOString(), before = historySnapshot(db);
    historyCalls.set(db,at);
    try {
      const result = mutate(at);
      appendHistory(db,before,historySnapshot(db),at);
      return result;
    } finally { historyCalls.delete(db); }
  })();
}

export function overview(db: Database): Spec {
  const n = Number(Bun.env.ISOSCOPE_STABLE_N);
  const threshold = Number.isSafeInteger(n) && n > 0 ? n : 3;
  return db.transaction(() => {
    const counts = db.query(`SELECT (SELECT value FROM meta WHERE key='title') title,
      (SELECT count(*) FROM nodes) nodes,(SELECT count(*) FROM edges) edges,
      (SELECT count(*) FROM status_items) open,
      (SELECT count(*) FROM status_items WHERE class='red') blockers,
      (SELECT count(DISTINCT session) FROM node_history) sessions`).get() as Spec;
    const stable_seams = db.query(`WITH sessions AS (SELECT DISTINCT session FROM node_history),
      last_change AS (SELECT node_id,MAX(session) since_session FROM node_history WHERE kind<>'telemetry' GROUP BY node_id),
      seams AS (SELECT n.id,l.since_session,
        (SELECT count(*) FROM sessions s WHERE s.session>l.since_session) sessions_unchanged,
        (SELECT count(*) FROM edges e WHERE e.src=n.id OR e.dst=n.id) links
        FROM nodes n JOIN last_change l ON l.node_id=n.id
        WHERE NOT EXISTS (SELECT 1 FROM telemetry t WHERE t.node_id=n.id))
      SELECT * FROM seams WHERE links>0 AND sessions_unchanged>=?
      ORDER BY sessions_unchanged DESC,id`).all(threshold);
    return { ...counts, stable_seams };
  })();
}

export function markNode(db: Database, a: { id: string; state?: string; items?: { c: string; l: string }[]; clear?: boolean; append?: { c: string; l: string }[] }): void {
  withHistory(db,() => {
    if (!db.query("SELECT 1 FROM nodes WHERE id=?").get(a.id)) throw new Error(`no such module: ${a.id}`);
    if (a.state) db.prepare("UPDATE nodes SET state=? WHERE id=?").run(a.state,a.id);
    if (a.clear || a.items !== undefined) db.prepare("DELETE FROM status_items WHERE node_id=?").run(a.id);
    const si = db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)");
    let ord = (db.query("SELECT COALESCE(MAX(ord)+1,0) o FROM status_items WHERE node_id=?").get(a.id) as Spec).o;
    for (const it of [...(a.items ?? []),...(a.append ?? [])]) si.run(a.id,ord++,it.c,it.l);
  });
}

export function importSpec(db: Database, spec: Spec): void {
  withHistory(db,() => {
    for (const t of ["trace_steps", "edges", "status_items", "node_paths", "telemetry", "nodes", "groups", "meta"])
      db.exec(`DELETE FROM ${t};`);
    const meta = db.prepare("INSERT INTO meta(key,value) VALUES(?,?)");
    const flat: Record<string, string> = {
      title: spec.title ?? "", wordmark: spec.wordmark ?? "", asOf: spec.asOf ?? "",
      "brand.k": spec.brand?.k ?? "", "brand.v": spec.brand?.v ?? "",
      "intro.eyebrow": spec.intro?.eyebrow ?? "", "intro.title": spec.intro?.title ?? "",
      "intro.sub": spec.intro?.sub ?? "", "intro.proseHTML": spec.intro?.proseHTML ?? "",
      metrics: JSON.stringify(spec.metrics ?? []),
      drcBudget: JSON.stringify(spec.drcBudget ?? null),
      ci: JSON.stringify(spec.ci ?? null),
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
      const t = spec.telemetry?.[x.id];
      if (t) db.prepare(`INSERT INTO telemetry(node_id,trace_boundary,event_stream,wide_event_keys,installed_by,offered_at,verified_at,rationale)
                         VALUES(?,?,?,?,?,?,?,?)`)
        .run(x.id, t.trace_boundary ?? "proposed", t.event_stream ?? null,
             t.wide_event_keys ? JSON.stringify(t.wide_event_keys) : null,
             t.installed_by ?? null, t.offered_at ?? null, t.verified_at ?? null, t.rationale ?? null);
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
}

export function telemetryOut(t: any): Spec {
  const o: Spec = { trace_boundary: t.trace_boundary };
  if (t.event_stream) o.event_stream = t.event_stream;
  if (t.wide_event_keys) o.wide_event_keys = JSON.parse(t.wide_event_keys);
  if (t.installed_by) o.installed_by = t.installed_by;
  if (t.offered_at) o.offered_at = t.offered_at;
  if (t.verified_at) o.verified_at = t.verified_at;
  if (t.rationale) o.rationale = t.rationale;
  return o;
}

/* ————— seams → sensors (docs/INSTRUMENTATION.md) —————
   The offer loop: an agent that sees a seam stabilise proposes a trace boundary; the
   proposal lands on the map as a YOUR-CALL item (the existing decision vocabulary) and
   as a telemetry row. Accepting = installing; the item clears on install/verify/decline. */
export const OFFER_PREFIX = "Sensor offered — ";
export function proposeSensor(db: Database, a: { id: string; rationale?: string; event_stream?: string; wide_event_keys?: string[]; force?: boolean }): Spec {
 return withHistory(db,(at) => {
  const node = db.query("SELECT id,name FROM nodes WHERE id=?").get(a.id) as any;
  if (!node) throw new Error(`no such module: ${a.id}`);
  const cur = db.query("SELECT * FROM telemetry WHERE node_id=?").get(a.id) as any;
  if (cur && (cur.trace_boundary === "installed" || cur.trace_boundary === "verified"))
    return { outcome: "already-" + cur.trace_boundary, telemetry: telemetryOut(cur) };
  if (cur && cur.trace_boundary === "declined" && !a.force)
    return { outcome: "declined-earlier", hint: "operator declined this sensor; pass force:true to re-offer", telemetry: telemetryOut(cur) };
  let rationale = a.rationale?.trim() ?? "";
  if (!rationale) {
    const seam = overview(db).stable_seams.find((s: Spec) => s.id === a.id);
    if (!seam) return { outcome: "rationale-required" };
    rationale = `stable since ${seam.since_session}; unchanged for ${seam.sessions_unchanged} sessions; ${seam.links} links cross it`;
  }
  const today = at.slice(0, 10);
  db.prepare(`INSERT INTO telemetry(node_id,trace_boundary,event_stream,wide_event_keys,offered_at,rationale)
              VALUES($id,'offered',$stream,$keys,$today,$why)
              ON CONFLICT(node_id) DO UPDATE SET trace_boundary='offered',event_stream=COALESCE($stream,event_stream),
                wide_event_keys=COALESCE($keys,wide_event_keys),offered_at=$today,rationale=$why`)
    .run({ $id: a.id, $stream: a.event_stream ?? null, $keys: a.wide_event_keys ? JSON.stringify(a.wide_event_keys) : null, $today: today, $why: rationale });
  const label = `${OFFER_PREFIX}trace boundary at ${node.name}: ${rationale}` +
    (a.event_stream ? ` (events → ${a.event_stream})` : "") + ". Accept and an agent installs it; decline with iso_set_sensor.";
  db.prepare(`DELETE FROM status_items WHERE node_id=? AND label LIKE ?`).run(a.id, OFFER_PREFIX + "%");
  const ord = (db.query("SELECT COALESCE(MAX(ord)+1,0) o FROM status_items WHERE node_id=?").get(a.id) as any).o;
  db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,'you',?)").run(a.id, ord, label);
  return { outcome: "offered", item: label, telemetry: telemetryOut(db.query("SELECT * FROM telemetry WHERE node_id=?").get(a.id)) };
 });
}
export function setSensor(db: Database, a: { id: string; trace_boundary: string; event_stream?: string; wide_event_keys?: string[]; installed_by?: string; verified_at?: string; rationale?: string }): Spec {
 return withHistory(db,(at) => {
  if (!db.query("SELECT 1 FROM nodes WHERE id=?").get(a.id)) throw new Error(`no such module: ${a.id}`);
  const today = at.slice(0, 10);
  const by = a.installed_by ?? ((a.trace_boundary === "installed" || a.trace_boundary === "verified") ? "agent" : null);
  const vAt = a.verified_at ?? (a.trace_boundary === "verified" ? today : null);
  db.prepare(`INSERT INTO telemetry(node_id,trace_boundary,event_stream,wide_event_keys,installed_by,verified_at,rationale)
              VALUES($id,$tb,$stream,$keys,$by,$vAt,$why)
              ON CONFLICT(node_id) DO UPDATE SET trace_boundary=$tb,event_stream=COALESCE($stream,event_stream),
                wide_event_keys=COALESCE($keys,wide_event_keys),installed_by=COALESCE($by,installed_by),
                verified_at=COALESCE($vAt,verified_at),rationale=COALESCE($why,rationale)`)
    .run({ $id: a.id, $tb: a.trace_boundary, $stream: a.event_stream ?? null, $keys: a.wide_event_keys ? JSON.stringify(a.wide_event_keys) : null,
           $by: by, $vAt: vAt, $why: a.rationale?.trim() ?? null });
  if (a.trace_boundary !== "offered")
    db.prepare(`DELETE FROM status_items WHERE node_id=? AND label LIKE ?`).run(a.id, OFFER_PREFIX + "%");
  return { outcome: a.trace_boundary, telemetry: telemetryOut(db.query("SELECT * FROM telemetry WHERE node_id=?").get(a.id)) };
 });
}

/* ————— CI provider adapters: failing jobs → red buildings, passing jobs → healed —————
   One normalized event shape; providers differ only in how their webhook payloads
   are read. Job→module mapping is authored in the spec (`ci.jobs`, `ci.default`)
   with sensible fallbacks; events that carry file paths (review comments) attribute
   through node_paths like `ingest` does. */
export type CiEvent = { job: string; ok: boolean | null; message: string; url?: string; path?: string; source: string; mark?: "red" | "amber" };
export const CI_PROVIDERS = ["github", "gitlab", "buildkite", "signal"] as const;
export function normalizeCi(provider: string, p: any): CiEvent[] {
  const ev: CiEvent[] = [];
  const done = (c: string | null | undefined) => c == null ? null : ["success", "passed", "neutral"].includes(c) ? true
    : ["failure", "failed", "timed_out", "cancelled", "canceled", "action_required", "startup_failure", "broken"].includes(c) ? false : null;
  if (provider === "github") {
    const src = "gha";
    if (p.workflow_run) { const r = p.workflow_run; const ok = done(r.conclusion); if (ok !== null)
      ev.push({ job: r.name, ok, message: `${r.name} ${r.conclusion} on ${r.head_branch} (run #${r.run_number})`, url: r.html_url, source: src }); }
    if (p.workflow_job) { const j = p.workflow_job; const ok = done(j.conclusion); if (ok !== null) {
      const step = (j.steps ?? []).find((s: any) => s.conclusion === "failure");
      ev.push({ job: j.name, ok, message: `${j.workflow_name ?? "job"} › ${j.name} ${j.conclusion}${step ? ` at step "${step.name}"` : ""} on ${j.head_branch}`, url: j.html_url, source: src }); } }
    if (p.check_run) { const c = p.check_run; const ok = done(c.conclusion); if (ok !== null)
      ev.push({ job: c.name, ok, message: `${c.name} ${c.conclusion}${c.output?.title ? ` — ${c.output.title}` : ""}`, url: c.html_url ?? c.details_url, source: c.app?.slug ?? src }); }
    if (p.comment && p.comment.path) { /* review bots (Greptile, CodeRabbit, …) speak as PR review comments */
      const c = p.comment, who = String(c.user?.login ?? "review").replace(/\[bot\]$/, "");
      const body = String(c.body ?? "");
      const red = /\b(critical|blocker|vulnerab|security|crash|data loss|bug)\b/i.test(body);
      ev.push({ job: c.path, ok: red ? false : null, mark: red ? "red" : "amber", path: c.path, message: body.split("\n")[0].slice(0, 160), url: c.html_url, source: who }); }
    if (p.review && p.pull_request && !p.comment) { const r = p.review; const st = String(r.state ?? "").toLowerCase();
      if (st === "changes_requested" || st === "approved")
        ev.push({ job: `review:${String(r.user?.login ?? "review").replace(/\[bot\]$/, "")}`, ok: st === "approved",
          message: `${r.user?.login ?? "review"} ${st.replace("_", " ")} on PR #${p.pull_request.number}${r.body ? " — " + String(r.body).split("\n")[0].slice(0, 120) : ""}`, url: r.html_url, source: "review" }); }
  } else if (provider === "gitlab") {
    const src = "gitlab", base = p.project?.web_url;
    if (p.object_kind === "pipeline") {
      const ref = p.object_attributes?.ref, pid = p.object_attributes?.id;
      const builds = (p.builds ?? []).filter((b: any) => done(b.status) !== null);
      if (builds.length) builds.forEach((b: any) => ev.push({ job: b.name, ok: done(b.status)!, message: `${b.stage ? b.stage + " › " : ""}${b.name} ${b.status} on ${ref} (pipeline #${pid})`, url: base && b.id ? `${base}/-/jobs/${b.id}` : undefined, source: src }));
      else { const ok = done(p.object_attributes?.status); if (ok !== null) ev.push({ job: "pipeline", ok, message: `pipeline ${p.object_attributes.status} on ${ref} (#${pid})`, url: base ? `${base}/-/pipelines/${pid}` : undefined, source: src }); }
    } else if (p.object_kind === "build" || p.object_kind === "job") {
      const ok = done(p.build_status); if (ok !== null)
        ev.push({ job: p.build_name, ok, message: `${p.build_stage ? p.build_stage + " › " : ""}${p.build_name} ${p.build_status} on ${p.ref}`, url: base && p.build_id ? `${base}/-/jobs/${p.build_id}` : undefined, source: src });
    }
  } else if (provider === "buildkite") {
    const src = "buildkite";
    if (p.event === "job.finished" && p.job) { const ok = done(p.job.state); if (ok !== null)
      ev.push({ job: p.job.name ?? p.job.step_key ?? "job", ok, message: `${p.pipeline?.slug ?? "pipeline"} › ${p.job.name} ${p.job.state} on ${p.build?.branch} (build #${p.build?.number})`, url: p.job.web_url ?? p.build?.web_url, source: src }); }
    if (p.event === "build.finished" && p.build) { const ok = done(p.build.state); if (ok !== null)
      ev.push({ job: p.pipeline?.slug ?? "build", ok, message: `${p.pipeline?.slug ?? "build"} ${p.build.state} on ${p.build.branch} (build #${p.build.number})`, url: p.build.web_url, source: src }); }
  } else if (provider === "signal") {
    /* telemetry → map, provider-agnostic (lumbr's signals, alertmanager, a cron, anything):
       { source?, events:[{ job|service|signal, ok?:bool, severity?:"red"|"amber"|"ok", message, url?, path? }] } or one event */
    const list = Array.isArray(p) ? p : Array.isArray(p.events) ? p.events : [p];
    for (const e of list) {
      const job = e.job ?? e.signal ?? e.service; if (!job || !e.message) continue;
      const ok = typeof e.ok === "boolean" ? e.ok : e.severity === "ok" ? true : e.severity === "red" ? false : e.severity === "amber" ? null : false;
      ev.push({ job, ok, mark: ok === false ? "red" : ok === null ? "amber" : undefined, message: e.message, url: e.url, path: e.path, source: e.source ?? p.source ?? "signal" });
    }
  } else throw new Error(`unknown CI provider: ${provider} (github|gitlab|buildkite|signal)`);
  return ev;
}
/* ————— blast radius: the incident scope the engine opens with, as data —————
   Same rule as the map (any red item → red modules + their 1-hop neighbours), so a
   remediation agent (lumbr's mcp-worker) works exactly the scope the operator sees. */
export function blastRadius(db: Database): Spec {
  const reds = (db.query("SELECT DISTINCT node_id FROM status_items WHERE class='red'").all() as any[]).map(r => r.node_id);
  const scope = new Set<string>(reds);
  const edges = db.query("SELECT src,dst,type,health FROM edges").all() as any[];
  for (const e of edges) { if (reds.includes(e.src)) scope.add(e.dst); if (reds.includes(e.dst)) scope.add(e.src); }
  const modules = [...scope].map(id => {
    const n = db.query("SELECT id,name,state,refs FROM nodes WHERE id=?").get(id) as any;
    const items = (db.query("SELECT class,label FROM status_items WHERE node_id=? ORDER BY ord").all(id) as any[]).map(i => ({ c: i.class, l: i.label }));
    const paths = (db.query("SELECT prefix FROM node_paths WHERE node_id=?").all(id) as any[]).map(p => p.prefix);
    const t = db.query("SELECT trace_boundary,event_stream FROM telemetry WHERE node_id=?").get(id) as any;
    return { id, name: n?.name, state: n?.state, red: reds.includes(id), items, paths, refs: n?.refs, sensor: t ?? null };
  });
  const links = edges.filter(e => scope.has(e.src) && scope.has(e.dst)).map(e => ({ src: e.src, dst: e.dst, type: e.type, health: e.health }));
  const worst = reds.map(id => ({ id, reds: (db.query("SELECT count(*) c FROM status_items WHERE node_id=? AND class='red'").get(id) as any).c })).sort((a, b) => b.reds - a.reds)[0]?.id ?? null;
  return { reds, worst, scope: [...scope], modules, links, allowedPaths: modules.flatMap(m => m.paths) };
}
export function detectCiProvider(headers: Headers): string | null {
  if (headers.get("x-github-event")) return "github";
  if (headers.get("x-gitlab-event")) return "gitlab";
  if (headers.get("x-buildkite-event")) return "buildkite";
  return null;
}
export function applyCi(db: Database, events: CiEvent[]): Spec {
 return withHistory(db,() => {
  const ci = JSON.parse((db.query("SELECT value FROM meta WHERE key='ci'").get() as any)?.value || "null") ?? {};
  const jobs: Record<string, string> = ci.jobs ?? {};
  const nodes = db.query("SELECT id,short,tag FROM nodes").all() as any[];
  const prefixes = db.query("SELECT node_id,prefix FROM node_paths").all() as any[];
  const byPath = (p: string) => { let best: any = null; for (const r of prefixes) if (p.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r; return best?.node_id ?? null; };
  const byJob = (job: string) => {
    if (jobs[job]) return jobs[job];
    const k = Object.keys(jobs).find(k => job.toLowerCase().startsWith(k.toLowerCase()) || new RegExp("^" + k.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i").test(job));
    if (k) return jobs[k];
    const lo = job.toLowerCase();
    const n = nodes.find(n => n.id.toLowerCase() === lo || (n.short ?? "").toLowerCase() === lo || (n.tag ?? "").toLowerCase() === lo);
    return n?.id ?? ci.default ?? null;
  };
  const marked: string[] = [], cleared: string[] = [], orphans: string[] = [];
    for (const e of events) {
      const id = e.path ? (byPath(e.path) ?? byJob(e.job)) : byJob(e.job);
      const tag = `[${e.source}:${e.job}]`;
      if (!id) { orphans.push(e.job); continue; }
      if (e.ok === false || (e.ok === null && (e.mark === "amber" || e.path))) {
        db.prepare("DELETE FROM status_items WHERE label LIKE ?").run(tag + "%"); /* one live item per job, wherever it sat */
        const ord = (db.query("SELECT COALESCE(MAX(ord)+1,0) o FROM status_items WHERE node_id=?").get(id) as any).o;
        db.prepare("INSERT INTO status_items(node_id,ord,class,label) VALUES(?,?,?,?)")
          .run(id, ord, e.ok === false ? "red" : "amber", `${tag} ${e.message}${e.url ? " → " + e.url : ""}`);
        marked.push(`${id} ← ${e.job}`);
      } else if (e.ok === true) {
        const n = db.prepare("DELETE FROM status_items WHERE label LIKE ?").run(tag + "%").changes;
        if (n) cleared.push(`${id} ← ${e.job}`);
      }
    }
  return { marked, cleared, orphans };
 });
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
    nodes: [], short: {}, status: {}, levels: {}, paths: {}, telemetry: {},
    edges: [], edgeStatus: {}, edgeDocs: {}, trace: [], traceText: {},
  };
  // The routing budget is authored, not derived — it must survive a round trip
  // or export→edit→import silently disarms the DRC lint.
  const budget = JSON.parse(meta.drcBudget || "null");
  if (budget) spec.drcBudget = budget;
  const ci = JSON.parse(meta.ci || "null");
  if (ci) spec.ci = ci;
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
    const pp = (db.query("SELECT prefix FROM node_paths WHERE node_id=? ORDER BY rowid").all(r.id) as any[]).map(p => p.prefix);
    if (pp.length) spec.paths[r.id] = pp;
    const t = db.query("SELECT * FROM telemetry WHERE node_id=?").get(r.id) as any;
    if (t) spec.telemetry[r.id] = telemetryOut(t);
  }
  if (!Object.keys(spec.telemetry).length) delete spec.telemetry;
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
