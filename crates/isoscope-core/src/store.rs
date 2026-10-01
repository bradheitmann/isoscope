use crate::{
    github::{Result, canonical, hash},
    model::{Config, Raw, Snapshot},
    reduce::reduce,
};
use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub fn atomic_json(path: &Path, value: &Value) -> Result<()> {
    let parent = path.parent().ok_or("publication needs parent directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let bytes = canonical(value)?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| e.to_string())?;
    let outcome = (|| {
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())
    })();
    if outcome.is_err() {
        let _ = fs::remove_file(temp);
    }
    outcome
}
pub fn read_snapshot(state: &Path) -> Result<Snapshot> {
    let mut snapshot: Snapshot =
        serde_json::from_slice(&fs::read(state.join("current.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let at = DateTime::parse_from_rfc3339(&snapshot.collected_at).map_err(|e| e.to_string())?;
    if (Utc::now() - at.with_timezone(&Utc)).num_seconds() > snapshot.stale_after_seconds {
        snapshot.status = "stale".into();
    }
    Ok(snapshot)
}
pub struct RefreshLock {
    file: File,
}
impl RefreshLock {
    pub fn acquire(state: &Path) -> Result<Self> {
        fs::create_dir_all(state).map_err(|e| e.to_string())?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(state.join("refresh.lock"))
            .map_err(|e| e.to_string())?;
        file.try_lock_exclusive()
            .map_err(|_| "refresh already running; overlap skipped".to_string())?;
        Ok(Self { file })
    }
}
impl Drop for RefreshLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}
pub fn publish(state: &Path, raw: &Raw, config: &Config) -> Result<Snapshot> {
    if raw.repository != config.repository {
        return Err(
            "receipt repository does not match configured repository; publication refused".into(),
        );
    }
    let previous = read_snapshot(state).ok();
    if previous
        .as_ref()
        .is_some_and(|p| p.repository != config.repository)
    {
        return Err(
            "state is bound to a different repository; use a separate state directory".into(),
        );
    }
    let snapshot = reduce(raw, config, previous.as_ref())?;
    let raw_value = serde_json::to_value(raw).map_err(|e| e.to_string())?;
    let digest = hash(&canonical(&raw_value)?);
    let receipt = state.join("receipts").join(format!("{digest}.json"));
    if !receipt.exists() {
        atomic_json(&receipt, &raw_value)?;
    }
    atomic_json(
        &state.join("current.json"),
        &serde_json::to_value(&snapshot).map_err(|e| e.to_string())?,
    )?;
    atomic_json(
        &state.join("refresh-status.json"),
        &serde_json::json!({"attempted_at":Utc::now().to_rfc3339(),"result":"success","raw_sha256":digest,"snapshot_sha256":snapshot.content_sha256,"runtime":runtime_metadata(),"consecutive_failures":0}),
    )?;
    Ok(snapshot)
}
pub fn fail(state: &Path, message: &str) -> Result<()> {
    let previous: Value = fs::read(state.join("refresh-status.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null);
    let failures = previous["consecutive_failures"]
        .as_u64()
        .unwrap_or(0)
        .saturating_add(1);
    let delay = 60_i64.saturating_mul(1_i64 << failures.min(4)).min(900);
    if let Ok(mut snapshot) = read_snapshot(state) {
        snapshot.status = "stale".into();
        snapshot.last_error = Some(message.into());
        atomic_json(
            &state.join("current.json"),
            &serde_json::to_value(snapshot).map_err(|e| e.to_string())?,
        )?;
    }
    atomic_json(
        &state.join("refresh-status.json"),
        &serde_json::json!({"attempted_at":Utc::now().to_rfc3339(),"result":"failed","error":message,"consecutive_failures":failures,"retry_after":(Utc::now()+chrono::Duration::seconds(delay)).to_rfc3339(),"runtime":runtime_metadata()}),
    )
}
pub fn retry_due(state: &Path) -> bool {
    let value: Value = fs::read(state.join("refresh-status.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null);
    value["retry_after"]
        .as_str()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .is_none_or(|t| t.with_timezone(&Utc) <= Utc::now())
}
fn runtime_metadata() -> Value {
    let executable = std::env::current_exe().ok();
    let digest = executable
        .as_ref()
        .and_then(|p| fs::read(p).ok())
        .map(|b| hash(&b));
    let host = std::process::Command::new("hostname")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    serde_json::json!({"host":host,"pid":std::process::id(),"executable":executable,"executable_sha256":digest,"version":env!("CARGO_PKG_VERSION"),"source_commit":option_env!("ISOSCOPE_SOURCE_COMMIT"),"collector":"deterministic Rust; no model calls"})
}
pub fn isolated_state(root: &Path, requested: &Path) -> Result<PathBuf> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let path = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root.join(requested)
    };
    if path
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        return Err("state path traversal refused".into());
    }
    if !path.starts_with(&root) {
        return Err("state directory outside this worktree refused".into());
    }
    let mut existing = path.as_path();
    while !existing.exists() {
        existing = existing.parent().ok_or("invalid state parent")?;
    }
    if !existing
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(&root)
    {
        return Err("state symlink escapes this worktree".into());
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("state directory outside this worktree refused".into());
    }
    Ok(canonical)
}
