//! Replacement architecture graph operations; never writes the source repository.
use crate::{
    github::{Result, hash},
    store::{RefreshLock, atomic_json},
};
use chrono::Utc;
use clap::Subcommand;
use serde_json::{Value, json};
use std::{
    collections::{BTreeSet, VecDeque},
    fs,
    path::{Path, PathBuf},
};
#[derive(Subcommand)]
pub enum Action {
    Import {
        file: PathBuf,
    },
    Export,
    Overview,
    Node {
        file: PathBuf,
    },
    Edge {
        file: PathBuf,
    },
    Delete {
        id: String,
    },
    Mark {
        id: String,
        #[arg(long)]
        state: String,
        #[arg(long)]
        message: Option<String>,
    },
    Ingest {
        file: PathBuf,
        #[arg(long, default_value = "normalized")]
        source: String,
    },
    Sensor {
        id: String,
        #[arg(long)]
        state: String,
        #[arg(long)]
        rationale: String,
    },
    BlastRadius,
    Build {
        output: PathBuf,
        #[arg(long, default_value = "replacement/web/dist")]
        assets: PathBuf,
    },
    Lint,
}
fn read(file: &Path) -> Result<Value> {
    serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn id(v: &Value) -> String {
    v["id"].as_str().unwrap_or_default().into()
}
pub fn validate(v: &Value) -> Result<()> {
    if !v.is_object() {
        return Err("graph must be object".into());
    }
    for key in [
        "status",
        "paths",
        "telemetry",
        "edgeDocs",
        "edgeStatus",
        "short",
        "levels",
    ] {
        if let Some(value) = v.get(key)
            && !value.is_object()
        {
            return Err(format!("{key} must be object"));
        }
    }
    let nodes = v["nodes"].as_array().ok_or("graph nodes must be array")?;
    let mut ids = BTreeSet::new();
    for n in nodes {
        let ident = id(n);
        if ident.is_empty() || !ids.insert(ident) {
            return Err("empty or duplicate node id".into());
        }
    }
    for e in v["edges"].as_array().into_iter().flatten() {
        let a = e.as_array().ok_or("edge must be [src,dst,type]")?;
        if a.len() != 3 {
            return Err("edge must have exactly three values".into());
        }
        for end in a.iter().take(2) {
            if !end.as_str().is_some_and(|s| ids.contains(s)) {
                return Err("edge references absent node".into());
            }
        }
        if !a
            .get(2)
            .and_then(Value::as_str)
            .is_some_and(|s| ["data", "auth", "intended"].contains(&s))
        {
            return Err("invalid edge type".into());
        }
    }
    Ok(())
}
fn array<'a>(v: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>> {
    if v.get(key).is_none() {
        v[key] = json!([]);
    }
    v[key]
        .as_array_mut()
        .ok_or_else(|| format!("{key} must be array"))
}
fn upsert(v: &mut Value, key: &str, entry: Value, ident: &str) -> Result<()> {
    let values = array(v, key)?;
    if let Some(index) = values.iter().position(|v| id(v) == ident) {
        values[index] = entry;
    } else {
        values.push(entry);
    }
    values.sort_by_key(id);
    Ok(())
}
fn save(state: &Path, v: &Value, before: &Value, kind: &str) -> Result<()> {
    validate(v)?;
    if v != before {
        let at = Utc::now().to_rfc3339();
        let record = json!({"at":at,"kind":kind,"before_sha256":hash(&serde_json::to_vec(before).map_err(|e|e.to_string())?),"after":v});
        let digest = hash(&serde_json::to_vec(&record).map_err(|e| e.to_string())?);
        atomic_json(
            &state.join("graph-history").join(format!("{digest}.json")),
            &record,
        )?;
        atomic_json(&state.join("graph.json"), v)?;
    }
    Ok(())
}
pub fn blast_radius(v: &Value) -> Value {
    let statuses = v["status"].as_object();
    let mut affected: BTreeSet<String> = statuses
        .into_iter()
        .flatten()
        .filter(|(_, s)| {
            s["items"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|i| i["c"] == "red")
        })
        .map(|(k, _)| k.clone())
        .collect();
    let mut pending: VecDeque<String> = affected.iter().cloned().collect();
    while let Some(src) = pending.pop_front() {
        for edge in v["edges"].as_array().into_iter().flatten() {
            if edge.get(0).and_then(Value::as_str) == Some(&src)
                && let Some(dst) = edge.get(1).and_then(Value::as_str)
                && affected.insert(dst.into())
            {
                pending.push_back(dst.into());
            }
        }
    }
    json!({"affected_nodes":affected,"strength":"directed reachability from red incidents; advisory, not remediation authority"})
}
pub fn run(state: &Path, action: Action) -> Result<()> {
    let _lock = RefreshLock::acquire(state)?;
    let path = state.join("graph.json");
    let mut v = if path.exists() {
        read(&path)?
    } else {
        json!({"title":"Architecture","nodes":[],"edges":[],"groups":[],"status":{},"paths":{},"telemetry":{}})
    };
    validate(&v)?;
    let before = v.clone();
    let kind = match action {
        Action::Import { file } => {
            v = read(&file)?;
            "import"
        }
        Action::Export => {
            println!(
                "{}",
                serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?
            );
            return Ok(());
        }
        Action::Overview => {
            let n = v["nodes"].as_array().map_or(0, Vec::len);
            let e = v["edges"].as_array().map_or(0, Vec::len);
            println!(
                "{}",
                json!({"title":v["title"],"nodes":n,"edges":e,"telemetry":v["telemetry"],"history_receipts":fs::read_dir(state.join("graph-history")).map_or(0,|s|s.count()),"stable_seams":"UNKNOWN: no equivalent qualified session heuristic yet"})
            );
            return Ok(());
        }
        Action::Node { file } => {
            let entry = read(&file)?;
            let ident = id(&entry);
            if ident.is_empty() {
                return Err("node requires id".into());
            }
            upsert(&mut v, "nodes", entry, &ident)?;
            "node"
        }
        Action::Edge { file } => {
            let entry = read(&file)?;
            let e = entry.as_array().ok_or("edge must be array")?;
            if e.len() != 3 {
                return Err("edge needs [src,dst,type]".into());
            }
            let src = e.first().cloned();
            let dst = e.get(1).cloned();
            let edges = array(&mut v, "edges")?;
            edges.retain(|e| !(e.get(0) == src.as_ref() && e.get(1) == dst.as_ref()));
            edges.push(entry);
            edges.sort_by_key(Value::to_string);
            "edge"
        }
        Action::Delete { id: ident } => {
            array(&mut v, "nodes")?.retain(|n| id(n) != ident);
            array(&mut v, "edges")?.retain(|e| {
                e.get(0).and_then(Value::as_str) != Some(&ident)
                    && e.get(1).and_then(Value::as_str) != Some(&ident)
            });
            for key in ["status", "paths", "telemetry", "short", "levels"] {
                if let Some(map) = v[key].as_object_mut() {
                    map.remove(&ident);
                }
            }
            "delete"
        }
        Action::Mark {
            id: ident,
            state: status,
            message,
        } => {
            if !["ok", "attn", "build"].contains(&status.as_str()) {
                return Err("invalid status".into());
            }
            if !array(&mut v, "nodes")?.iter().any(|n| id(n) == ident) {
                return Err("absent node".into());
            }
            let items = message
                .map(|m| json!([{"c":if status=="attn"{"red"}else{"amber"},"l":m}]))
                .unwrap_or_else(|| json!([]));
            v["status"][&ident] = json!({"state":status,"items":items});
            "mark"
        }
        Action::Ingest { file, source } => {
            let findings = read(&file)?;
            let findings = findings
                .as_array()
                .ok_or("normalized findings require array of {path,message,severity}")?;
            let mut orphans = Vec::new();
            for f in findings {
                let filename = f["path"].as_str().ok_or("finding path required")?;
                let mut matches = Vec::new();
                for (ident, prefixes) in v["paths"].as_object().into_iter().flatten() {
                    for prefix in prefixes
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                    {
                        if filename.starts_with(prefix) {
                            matches.push((prefix.len(), ident.clone()));
                        }
                    }
                }
                matches.sort();
                if let Some((_, ident)) = matches.last() {
                    let status = &mut v["status"][ident];
                    if status.is_null() {
                        *status = json!({"state":"attn","items":[]});
                    }
                    array(status,"items")?.push(json!({"c":if f["severity"]=="error"{"red"}else{"amber"},"l":f["message"],"source":source}));
                    status["state"] = json!("attn");
                } else {
                    orphans.push(f.clone());
                }
            }
            v["unattributed_findings"] = json!(orphans);
            "findings"
        }
        Action::Sensor {
            id: ident,
            state: status,
            rationale,
        } => {
            if !["proposed", "offered", "installed", "verified", "declined"]
                .contains(&status.as_str())
            {
                return Err("invalid sensor state".into());
            }
            if !array(&mut v, "nodes")?.iter().any(|n| id(n) == ident) {
                return Err("absent node".into());
            }
            v["telemetry"][&ident] = json!({"trace_boundary":status,"rationale":rationale,"offered_at":Utc::now().to_rfc3339()});
            "sensor"
        }
        Action::BlastRadius => {
            println!("{}", blast_radius(&v));
            return Ok(());
        }
        Action::Lint => {
            validate(&v)?;
            println!(
                "{}",
                json!({"graph_valid":true,"routing_collision_lint":"UNKNOWN: legacy routing budget not enforced by replacement yet"})
            );
            return Ok(());
        }
        Action::Build { output, assets } => {
            let snapshot = crate::store::read_snapshot(state)?;
            let html = fs::read_to_string(assets.join("index.html")).map_err(|e| e.to_string())?;
            let payload = format!(
                "<script id=\"isoscope-snapshot\" type=\"application/json\">{}</script><script id=\"isoscope-graph\" type=\"application/json\">{}</script>",
                serde_json::to_string(&snapshot)
                    .map_err(|e| e.to_string())?
                    .replace('<', "\\u003c"),
                serde_json::to_string(&v)
                    .map_err(|e| e.to_string())?
                    .replace('<', "\\u003c")
            );
            let html = html.replace("<head>", &format!("<head>{payload}"));
            fs::create_dir_all(&output).map_err(|e| e.to_string())?;
            copy_assets(&assets, &output)?;
            fs::write(output.join("index.html"), html).map_err(|e| e.to_string())?;
            println!("Frozen export {}", output.display());
            return Ok(());
        }
    };
    save(state, &v, &before, kind)
}
fn copy_assets(from: &Path, to: &Path) -> Result<()> {
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = to.join(entry.file_name());
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            copy_assets(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
