//! Native stdio MCP adapter, newline-delimited JSON-RPC. Mutation scope is the local graph only.
use crate::{
    github::Result,
    graph,
    store::{RefreshLock, atomic_json},
};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, BufRead, Write},
    path::Path,
};
const TOOLS: &[(&str, &str)] = &[
    (
        "iso_overview",
        "Read graph node/edge counts and incident reachability",
    ),
    (
        "iso_get_spec",
        "Read the complete architecture graph interchange spec",
    ),
    (
        "iso_upsert_node",
        "Merge a node by id; preserves its identity and unmentioned fields",
    ),
    (
        "iso_upsert_edge",
        "Create or replace directed [src,dst,type] edge and associated documentation",
    ),
    (
        "iso_set_status",
        "Set the visible local map state and incident items",
    ),
    (
        "iso_delete",
        "Delete a node and incident edges, or a directed edge",
    ),
    (
        "iso_build",
        "Export a frozen web view; assets and output are explicit local paths",
    ),
    (
        "iso_propose_sensor",
        "Record a proposed instrumentation boundary; not installation evidence",
    ),
    (
        "iso_set_sensor",
        "Record an explicitly reported local instrumentation state",
    ),
];
fn read(state: &Path) -> Result<Value> {
    if !state.join("graph.json").exists() {
        return Ok(
            json!({"title":"Architecture","nodes":[],"edges":[],"groups":[],"status":{},"paths":{},"telemetry":{}}),
        );
    }
    serde_json::from_slice(&fs::read(state.join("graph.json")).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
fn string<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing {key}"))
}
fn array<'a>(v: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>> {
    if v.get(key).is_none() {
        v[key] = json!([]);
    }
    v[key]
        .as_array_mut()
        .ok_or_else(|| format!("{key} must be array"))
}
fn call(state: &Path, name: &str, args: &Value) -> Result<Value> {
    if name == "iso_build" {
        let assets = string(args, "assets")?;
        let output = string(args, "out")?;
        let child = std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
            .args([
                "--state",
                state.to_str().ok_or("state path must be UTF-8")?,
                "graph",
                "build",
                output,
                "--assets",
                assets,
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !child.status.success() {
            return Err("frozen export failed; inspect CLI prerequisites".into());
        }
        return Ok(json!({"frozen_export":output}));
    }
    let _lock = RefreshLock::acquire(state)?;
    let mut v = read(state)?;
    graph::validate(&v)?;
    let before = v.clone();
    match name {
        "iso_get_spec" => return Ok(v),
        "iso_overview" => {
            return Ok(
                json!({"title":v["title"],"nodes":v["nodes"].as_array().map_or(0,Vec::len),"edges":v["edges"].as_array().map_or(0,Vec::len),"blast_radius":graph::blast_radius(&v),"stable_seams":"UNKNOWN: unported qualified-session heuristic"}),
            );
        }
        "iso_upsert_node" => {
            let id = string(args, "id")?;
            let nodes = array(&mut v, "nodes")?;
            if let Some(node) = nodes.iter_mut().find(|n| n["id"] == id) {
                for (key, value) in args.as_object().ok_or("node must be object")? {
                    node[key] = value.clone();
                }
            } else {
                nodes.push(args.clone());
            }
            nodes.sort_by_key(|n| n["id"].as_str().unwrap_or_default().to_string());
        }
        "iso_upsert_edge" => {
            let src = string(args, "src")?;
            let dst = string(args, "dst")?;
            let edge_type = args["type"].as_str().unwrap_or("data");
            let edges = array(&mut v, "edges")?;
            edges.retain(|e| {
                !(e.get(0).and_then(Value::as_str) == Some(src)
                    && e.get(1).and_then(Value::as_str) == Some(dst))
            });
            edges.push(json!([src, dst, edge_type]));
            edges.sort_by_key(Value::to_string);
            let key = format!("{src}-{dst}");
            if !args["docs"].is_null() {
                v["edgeDocs"][&key] = args["docs"].clone();
            }
        }
        "iso_set_status" => {
            let id = string(args, "id")?;
            if !array(&mut v, "nodes")?.iter().any(|n| n["id"] == id) {
                return Err("absent node".into());
            }
            let status = args["state"].as_str().unwrap_or("attn");
            if !["ok", "attn", "build"].contains(&status) {
                return Err("invalid status".into());
            }
            v["status"][id] = json!({"state":status,"items":args["items"].as_array().cloned().unwrap_or_default()});
        }
        "iso_delete" => {
            let id = string(args, "id")?;
            if args["kind"] == "edge" {
                array(&mut v, "edges")?.retain(|e| {
                    format!(
                        "{}-{}",
                        e.get(0).and_then(Value::as_str).unwrap_or_default(),
                        e.get(1).and_then(Value::as_str).unwrap_or_default()
                    ) != id
                });
            } else {
                array(&mut v, "nodes")?.retain(|n| n["id"] != id);
                array(&mut v, "edges")?.retain(|e| {
                    e.get(0).and_then(Value::as_str) != Some(id)
                        && e.get(1).and_then(Value::as_str) != Some(id)
                });
                for key in ["status", "paths", "telemetry", "short", "levels"] {
                    if let Some(map) = v[key].as_object_mut() {
                        map.remove(id);
                    }
                }
            }
        }
        "iso_propose_sensor" | "iso_set_sensor" => {
            let id = string(args, "id")?;
            if !array(&mut v, "nodes")?.iter().any(|n| n["id"] == id) {
                return Err("absent node".into());
            }
            let status = if name == "iso_propose_sensor" {
                "offered"
            } else {
                string(args, "trace_boundary")?
            };
            if !["proposed", "offered", "installed", "verified", "declined"].contains(&status) {
                return Err("invalid trace boundary".into());
            }
            if name == "iso_propose_sensor"
                && ["installed", "verified", "declined"].contains(
                    &v["telemetry"][id]["trace_boundary"]
                        .as_str()
                        .unwrap_or_default(),
                )
                && args["force"] != true
            {
                return Ok(json!({"outcome":"already-installed-or-declined"}));
            }
            v["telemetry"][id] = args.clone();
            v["telemetry"][id]["trace_boundary"] = json!(status);
        }
        _ => return Err("unknown tool".into()),
    }
    graph::validate(&v)?;
    if v != before {
        let record =
            json!({"kind":name,"before":before,"after":v,"at":chrono::Utc::now().to_rfc3339()});
        let digest = crate::github::hash(&serde_json::to_vec(&record).map_err(|e| e.to_string())?);
        atomic_json(
            &state.join("graph-history").join(format!("{digest}.json")),
            &record,
        )?;
        atomic_json(&state.join("graph.json"), &v)?;
    }
    Ok(json!({"updated":v!=before}))
}
pub fn serve(state: &Path) -> Result<()> {
    let stdin = io::stdin();
    let mut out = io::stdout();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.len() > 4_194_304 {
            return Err("MCP message exceeds 4 MiB".into());
        }
        let request: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        let Some(id) = request.get("id") else {
            continue;
        };
        let result: Result<Value> = match request["method"].as_str().unwrap_or_default() {
            "initialize" => Ok(
                json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"isoscope-rust","version":"0.2.0"}}),
            ),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(
                json!({"tools":TOOLS.iter().map(|(name,description)|json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":{},"additionalProperties":true}})).collect::<Vec<_>>()}),
            ),
            "tools/call" => {
                let args = &request["params"]["arguments"];
                let name = string(&request["params"], "name")?;
                match call(state, name, args) {
                    Ok(value) => Ok(json!({"content":[{"type":"text","text":value.to_string()}]})),
                    Err(e) => Ok(json!({"isError":true,"content":[{"type":"text","text":e}]})),
                }
            }
            _ => Err("unsupported method".into()),
        };
        let response = match result {
            Ok(value) => json!({"jsonrpc":"2.0","id":id,"result":value}),
            Err(e) => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":e}}),
        };
        writeln!(out, "{response}").map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}
