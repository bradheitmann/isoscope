use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub repository: String,
    pub plan_path: String,
    #[serde(default = "freshness")]
    pub stale_after_seconds: i64,
    #[serde(default)]
    pub owner_observations: Vec<Observation>,
}
fn freshness() -> i64 {
    600
}
impl Default for Config {
    fn default() -> Self {
        Self {
            repository: "bradheitmann/leitting".into(),
            plan_path: "plan-views/build-dag.json".into(),
            stale_after_seconds: 600,
            owner_observations: vec![],
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub dimension: String,
    pub value: String,
    pub provenance: String,
    pub observed_at: String,
    pub source_url: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub endpoint: String,
    pub pages: usize,
    pub count: usize,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Raw {
    pub repository: String,
    pub collected_at: String,
    pub plan_commit: String,
    pub plan: Value,
    pub items: Vec<Value>,
    pub sources: Vec<Source>,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Planned,
    Ready,
    Claimed,
    Running,
    Blocked,
    Delivered,
    Qa,
    Guard,
    Merged,
    Closed,
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: String,
    pub at: String,
    pub edited_at: String,
    pub kind: String,
    pub source_url: String,
    pub sha256: String,
    pub body: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub number: u64,
    pub kind: String,
    pub title: String,
    pub url: String,
    pub unit: Option<String>,
    pub category: String,
    pub stage: Stage,
    pub labels: Vec<String>,
    pub head_sha: Option<String>,
    pub dependency_eligible: Option<bool>,
    pub blockers: Vec<String>,
    pub responsible_seat: String,
    pub next_action: String,
    pub candidate_ready_at: Option<String>,
    pub stage_since: Option<String>,
    pub stage_age_seconds: Option<i64>,
    pub current_head_pass: bool,
    pub history: Vec<Evidence>,
    pub warnings: Vec<String>,
    pub observed_dimensions: Vec<Observation>,
    pub metrics_seconds: BTreeMap<String, i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanNode {
    pub id: String,
    pub title: String,
    pub planned: String,
    pub dependencies: Vec<String>,
    pub critical_path: bool,
    pub issue_number: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub schema: String,
    pub repository: String,
    pub collected_at: String,
    pub plan_commit: String,
    pub content_sha256: String,
    pub status: String,
    pub stale_after_seconds: i64,
    pub last_error: Option<String>,
    pub coverage: Vec<Source>,
    pub warnings: Vec<String>,
    pub items: Vec<Item>,
    pub plan_nodes: Vec<PlanNode>,
    pub queues: BTreeMap<String, usize>,
    pub owner_observations: Vec<Observation>,
    pub native_runtime_status: String,
    pub token_cost_status: String,
}
