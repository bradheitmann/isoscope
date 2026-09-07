#!/usr/bin/env bun
/* isoscope MCP server — agents maintain the living map as they build.
   Hand-rolled stdio JSON-RPC (newline-delimited); zero dependencies.
   DB path: ISOSCOPE_DB env or first arg (default ./isoscope.db).
   Pair with `bun cli.ts serve` in another pane: every tool call repaints the browser. */
import { open, importSpec, exportSpec, proposeSensor, setSensor, withHistory, markNode, overview, DB_DEFAULT, type Spec } from "./lib.ts";
import { buildHtml } from "./build.mjs";
import { writeFileSync } from "fs";

const DB = Bun.env.ISOSCOPE_DB ?? Bun.argv[2] ?? DB_DEFAULT;
const db = () => open(DB);

const TOOLS = [
  { name: "iso_overview", description: "Project title, node/edge/open-item counts, distinct write sessions and stable_seams eligible for sensor offers.",
    inputSchema: { type: "object", properties: {} } },
  { name: "iso_get_spec", description: "The full spec JSON (nodes, edges, status, docs, trace) exported from the graph store.",
    inputSchema: { type: "object", properties: {} } },
  { name: "iso_upsert_node", description: "Create or update a module. Minimal: id,name,g(group id),x,y. Optional: tag,short,w,d,h,stack,level(-1|0|1),does,built,refs,good,cond. Creates the group if new (label defaults to id).",
    inputSchema: { type: "object", required: ["id","name","g","x","y"], properties: {
      id:{type:"string"},name:{type:"string"},g:{type:"string"},x:{type:"number"},y:{type:"number"},
      tag:{type:"string"},short:{type:"string"},w:{type:"number"},d:{type:"number"},h:{type:"number"},
      stack:{type:"number"},level:{type:"number"},does:{type:"string"},built:{type:"string"},
      refs:{type:"string"},good:{type:"string"},cond:{type:"string"} } } },
  { name: "iso_upsert_edge", description: "Create or update a link (links are entities). src,dst required; type data|auth|intended; health degraded|broken|null; title/carries/refs document what flows.",
    inputSchema: { type: "object", required: ["src","dst"], properties: {
      src:{type:"string"},dst:{type:"string"},type:{type:"string",enum:["data","auth","intended"]},
      health:{type:["string","null"],enum:["degraded","broken",null]},
      title:{type:"string"},carries:{type:"string"},refs:{type:"string"} } } },
  { name: "iso_set_status", description: "Set a module's state (ok|attn|build) and open items [{c:red|amber|you, l:label}]. Any red item renders the whole building blocked — this is 'what is broken and what to work on next'.",
    inputSchema: { type: "object", required: ["id"], properties: {
      id:{type:"string"},state:{type:"string",enum:["ok","attn","build"]},
      items:{type:"array",items:{type:"object",required:["c","l"],properties:{
        c:{type:"string",enum:["red","amber","you"]},l:{type:"string"}}}} } } },
  { name: "iso_delete", description: "Delete a node (and its edges) or a single edge.",
    inputSchema: { type: "object", properties: {
      node:{type:"string"}, src:{type:"string"}, dst:{type:"string"} } } },
  { name: "iso_build", description: "Build the self-contained HTML map to a path.",
    inputSchema: { type: "object", required: ["out"], properties: { out:{type:"string"} } } },
  { name: "iso_propose_sensor", description: "Seam→sensor offer (docs/INSTRUMENTATION.md): when a module's boundary has stabilised, offer a trace boundary there. Records telemetry.trace_boundary=offered and puts a YOUR-CALL item on the building so the operator decides on the map. Returns already-installed / declined-earlier without changes (force:true re-offers a declined one).",
    inputSchema: { type: "object", required: ["id"], properties: {
      id:{type:"string"}, rationale:{type:"string",description:"why this seam earned a sensor; if empty or omitted, generated for stable_seams only (otherwise rationale-required)"},
      event_stream:{type:"string",description:"where wide events would go, e.g. lumbr://billing/*"},
      wide_event_keys:{type:"array",items:{type:"string"}}, force:{type:"boolean"} } } },
  { name: "iso_set_sensor", description: "Move a module's sensor binding: proposed|offered|installed|verified|declined. installed/verified/declined clear the offer item. installed_by defaults to 'agent'; verified_at defaults to today.",
    inputSchema: { type: "object", required: ["id","trace_boundary"], properties: {
      id:{type:"string"}, trace_boundary:{type:"string",enum:["proposed","offered","installed","verified","declined"]},
      event_stream:{type:"string"}, wide_event_keys:{type:"array",items:{type:"string"}},
      installed_by:{type:"string"}, verified_at:{type:"string"}, rationale:{type:"string"} } } },
];

function call(name: string, a: any): string {
  const d = db();
  try {
    switch (name) {
      case "iso_overview": {
        return JSON.stringify(overview(d));
      }
      case "iso_get_spec": return JSON.stringify(exportSpec(d));
      case "iso_upsert_node": {
        return withHistory(d,() => {
          d.prepare("INSERT INTO groups(id,label,ord) VALUES(?,?,(SELECT COALESCE(MAX(ord)+1,0) FROM groups)) ON CONFLICT(id) DO NOTHING").run(a.g, a.g);
          d.prepare(`INSERT INTO nodes(id,tag,grp,name,short,x,y,w,d,h,stack,level,does,built,refs,good,cond)
            VALUES($id,$tag,$g,$name,$short,$x,$y,COALESCE($w,1),COALESCE($d2,1),COALESCE($h,1),$stack,COALESCE($level,0),$does,$built,$refs,$good,$cond)
            ON CONFLICT(id) DO UPDATE SET tag=COALESCE($tag,tag),grp=$g,name=$name,short=COALESCE($short,short),
              x=$x,y=$y,w=COALESCE($w,w),d=COALESCE($d2,d),h=COALESCE($h,h),stack=COALESCE($stack,stack),
              level=COALESCE($level,level),does=COALESCE($does,does),built=COALESCE($built,built),
              refs=COALESCE($refs,refs),good=COALESCE($good,good),cond=COALESCE($cond,cond)`)
            .run({ $id:a.id,$tag:a.tag??null,$g:a.g,$name:a.name,$short:a.short??null,$x:a.x,$y:a.y,
                   $w:a.w??null,$d2:a.d??null,$h:a.h??null,$stack:a.stack??null,$level:a.level??null,
                   $does:a.does??null,$built:a.built??null,$refs:a.refs??null,$good:a.good??null,$cond:a.cond??null });
          return `node ${a.id} upserted`;
        });
      }
      case "iso_upsert_edge": {
        return withHistory(d,() => {
          d.prepare(`INSERT INTO edges(src,dst,type,health,title,carries,refs)
            VALUES($src,$dst,COALESCE($type,'data'),$health,$title,$carries,$refs)
            ON CONFLICT(src,dst) DO UPDATE SET type=COALESCE($type,type),health=$health,
              title=COALESCE($title,title),carries=COALESCE($carries,carries),refs=COALESCE($refs,refs)`)
            .run({ $src:a.src,$dst:a.dst,$type:a.type??null,$health:a.health??null,
                   $title:a.title??null,$carries:a.carries??null,$refs:a.refs??null });
          return `edge ${a.src}->${a.dst} upserted`;
        });
      }
      case "iso_set_status": {
        markNode(d,{ id: a.id, state: a.state, items: a.items });
        return `status ${a.id} set`;
      }
      case "iso_delete": {
        return withHistory(d,() => {
          if (a.node) { d.prepare("DELETE FROM nodes WHERE id=?").run(a.node); return `node ${a.node} deleted`; }
          d.prepare("DELETE FROM edges WHERE src=? AND dst=?").run(a.src, a.dst);
          return `edge ${a.src}->${a.dst} deleted`;
        });
      }
      case "iso_build": {
        writeFileSync(a.out, buildHtml(exportSpec(d), { specLabel: DB }));
        return `built ${a.out}`;
      }
      case "iso_propose_sensor": return JSON.stringify(proposeSensor(d, a));
      case "iso_set_sensor": return JSON.stringify(setSensor(d, a));
      default: throw new Error(`unknown tool ${name}`);
    }
  } finally { d.close(); }
}

const reply = (id: any, result: any) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id: any, message: string) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");

let buf = "";
process.stdin.on("data", chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg: any; try { msg = JSON.parse(line); } catch { continue; }
    const { id, method, params } = msg;
    if (method === "initialize")
      reply(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} },
                  serverInfo: { name: "isoscope", version: "0.1.0" } });
    else if (method === "tools/list") reply(id, { tools: TOOLS });
    else if (method === "tools/call") {
      try { reply(id, { content: [{ type: "text", text: call(params.name, params.arguments ?? {}) }] }); }
      catch (e: any) { fail(id, e.message); }
    }
    else if (id !== undefined) reply(id, {});
  }
});
