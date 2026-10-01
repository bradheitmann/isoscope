//! Conservative, deterministic projection. Parsed statements are forge reports, not runtime telemetry.
use crate::{
    github::{Result, canonical, hash},
    model::*,
};
use chrono::DateTime;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}
fn list(v: &Value, k: &str) -> Vec<Value> {
    v[k].as_array().cloned().unwrap_or_default()
}
fn seconds(a: &str, b: &str) -> Option<i64> {
    Some(
        (DateTime::parse_from_rfc3339(b).ok()? - DateTime::parse_from_rfc3339(a).ok()?)
            .num_seconds()
            .max(0),
    )
}
fn unit(v: &Value) -> Option<String> {
    let body = s(v, "body");
    for marker in ["<!-- leit-slice: ", "<!-- leit-story: "] {
        if let Some(rest) = body.strip_prefix(marker) {
            return rest.split(" -->").next().map(str::to_string);
        }
    }
    let title = s(v, "title");
    let candidate = title.split(':').next()?;
    if candidate.starts_with("WP-")
        && candidate
            .bytes()
            .all(|b| b.is_ascii_digit() || b"WP-./S".contains(&b))
    {
        Some(candidate.to_string())
    } else {
        None
    }
}
fn head_field(body: &str) -> Option<String> {
    for line in body.lines() {
        for prefix in ["Head reviewed:", "Head:", "head:"] {
            if let Some(rest) = line.strip_prefix(prefix) {
                let value = rest.trim().trim_matches('`');
                if value.len() == 40 && value.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Some(value.to_ascii_lowercase());
                }
            }
        }
    }
    None
}
fn verdict(body: &str) -> Option<&str> {
    match body.lines().next()?.trim() {
        "VERDICT: PASS" => Some("PASS"),
        "VERDICT: FAIL" => Some("FAIL"),
        _ => None,
    }
}
fn claim_head(body: &str) -> Option<&str> {
    body.lines()
        .next()?
        .split_whitespace()
        .find_map(|w| w.strip_prefix("head="))
}
fn dimensions(history: &[Evidence]) -> Vec<Observation> {
    let mut found: BTreeMap<String, Observation> = BTreeMap::new();
    for e in history {
        for line in e.body.lines() {
            if let Some(agent) = line.strip_prefix("Agent:") {
                let parts: Vec<&str> = agent.trim().split('/').collect();
                for (key, index) in [("harness", 0), ("model", 1), ("lineage", 2)] {
                    if let Some(value) = parts.get(index) {
                        found.insert(
                            key.into(),
                            Observation {
                                dimension: key.into(),
                                value: (*value).into(),
                                provenance: "forge_reported".into(),
                                observed_at: e.at.clone(),
                                source_url: Some(e.source_url.clone()),
                            },
                        );
                    }
                }
            }
            for (prefix, key) in [("Provider:", "provider"), ("Reasoning:", "reasoning")] {
                if let Some(value) = line.strip_prefix(prefix) {
                    found.insert(
                        key.into(),
                        Observation {
                            dimension: key.into(),
                            value: value.trim().into(),
                            provenance: "forge_reported".into(),
                            observed_at: e.at.clone(),
                            source_url: Some(e.source_url.clone()),
                        },
                    );
                }
            }
        }
    }
    found.into_values().collect()
}
fn evidence(v: &Value, kind: &str) -> Evidence {
    Evidence {
        id: s(v, "id"),
        at: v["createdAt"]
            .as_str()
            .or(v["submittedAt"].as_str())
            .unwrap_or_default()
            .into(),
        edited_at: s(v, "updatedAt"),
        kind: kind.into(),
        source_url: s(v, "url"),
        sha256: hash(s(v, "body").as_bytes()),
        body: s(v, "body"),
    }
}
fn effective_at(e: &Evidence) -> &str {
    if e.edited_at.as_str() > e.at.as_str() {
        &e.edited_at
    } else {
        &e.at
    }
}
fn stage_key(stage: &Stage) -> String {
    serde_json::to_value(stage)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".into())
}
pub fn reduce(raw: &Raw, config: &Config, previous: Option<&Snapshot>) -> Result<Snapshot> {
    let mut plan = BTreeMap::new();
    let critical: BTreeSet<String> = list(&raw.plan, "critical_path")
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    for (key, is_slice) in [("nodes", false), ("slices", true)] {
        for v in list(&raw.plan, key) {
            let id = if is_slice { s(&v, "node") } else { s(&v, "id") };
            let id = if id.is_empty() { s(&v, "node") } else { id };
            if id.is_empty() {
                continue;
            }
            let deps = list(&v, "depends_on")
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect();
            plan.insert(
                id.clone(),
                PlanNode {
                    id: id.clone(),
                    title: s(&v, "title"),
                    planned: s(&v, "planned"),
                    dependencies: deps,
                    critical_path: critical.contains(id.split('/').next().unwrap_or_default()),
                    issue_number: None,
                },
            );
        }
    }
    // Story edges are used where nodes do not carry their dependencies.
    for e in list(&raw.plan, "edges") {
        let from = s(&e, "from");
        let to = s(&e, "to");
        if let Some(node) = plan.get_mut(&to) {
            node.dependencies.push(from);
            node.dependencies.sort();
            node.dependencies.dedup();
        }
    }
    let completed: BTreeSet<String> = raw
        .items
        .iter()
        .filter(|v| {
            s(v, "state") == "MERGED"
                || (s(v, "state") == "CLOSED" && s(v, "__typename") == "Issue")
        })
        .filter_map(unit)
        .filter(|u| plan.get(u).is_some_and(|n| n.planned == "done"))
        .collect();
    let mut items = Vec::new();
    let mut warnings = raw.warnings.clone();
    for v in &raw.items {
        let number = v["number"].as_u64().ok_or("item missing number")?;
        let kind = if s(v, "__typename") == "PullRequest" {
            "pr"
        } else {
            "issue"
        }
        .to_string();
        let unit = unit(v);
        if kind == "issue"
            && let Some(n) = unit.as_ref().and_then(|u| plan.get_mut(u))
        {
            n.issue_number = Some(number);
        }
        let mut labels: Vec<String> = v["labels"]["nodes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v["name"].as_str().map(str::to_string))
            .collect();
        labels.sort();
        labels.dedup();
        let mut history: Vec<Evidence> = list(v, "comments")
            .iter()
            .map(|v| evidence(v, "comment"))
            .chain(list(v, "reviews").iter().map(|v| evidence(v, "review")))
            .collect();
        history.push(Evidence {
            id: format!("body/{number}"),
            at: s(v, "createdAt"),
            edited_at: s(v, "updatedAt"),
            kind: "body".into(),
            source_url: s(v, "url"),
            sha256: hash(s(v, "body").as_bytes()),
            body: s(v, "body"),
        });
        let mut versions: BTreeMap<String, Evidence> = BTreeMap::new();
        let mut conflicting_versions = false;
        for event in history {
            if let Some(old) = versions.get(&event.id) {
                if old.edited_at == event.edited_at && old.sha256 != event.sha256 {
                    conflicting_versions = true;
                }
                if (&old.edited_at, &old.sha256) >= (&event.edited_at, &event.sha256) {
                    continue;
                }
            }
            versions.insert(event.id.clone(), event);
        }
        let mut history: Vec<Evidence> = versions.into_values().collect();
        history.sort_by(|a, b| (&a.at, &a.id, &a.sha256).cmp(&(&b.at, &b.id, &b.sha256)));
        let head = v["headRefOid"].as_str().map(str::to_string);
        let mut local_warnings = Vec::new();
        let latest_verdict = history
            .iter()
            .filter(|e| {
                verdict(&e.body).is_some()
                    && head_field(&e.body).as_ref() == head.as_ref()
                    && head.is_some()
                    && e.kind != "body"
            })
            .max_by(|a, b| {
                (effective_at(a), &a.id, &a.sha256).cmp(&(effective_at(b), &b.id, &b.sha256))
            });
        let current_pass = !conflicting_versions
            && latest_verdict.is_some_and(|e| verdict(&e.body) == Some("PASS"));
        if conflicting_versions {
            local_warnings
                .push("Conflicting versions at the same edit timestamp; authority UNKNOWN".into());
        }
        if history.iter().any(|e| {
            verdict(&e.body) == Some("PASS") && head_field(&e.body).as_ref() != head.as_ref()
        }) {
            local_warnings.push(
                "PASS exists for an earlier or unbound head; it does not accept the current head"
                    .into(),
            );
        }
        let claims: Vec<&Evidence> = history
            .iter()
            .filter(|e| {
                e.body
                    .lines()
                    .next()
                    .is_some_and(|l| l.starts_with("CLAIM "))
            })
            .collect();
        let latest_claim = claims.last().copied();
        let qa_claim = latest_claim.is_some_and(|e| {
            e.body.lines().next().is_some_and(|l| l.contains("seat=QA"))
                && claim_head(&e.body) == head.as_deref()
                && head.is_some()
        });
        let contradictory = claims
            .iter()
            .filter(|e| {
                e.body
                    .lines()
                    .next()
                    .is_some_and(|l| l.contains("seat=DEV"))
            })
            .map(|e| {
                e.body
                    .lines()
                    .find(|l| l.starts_with("Agent:"))
                    .unwrap_or_default()
            })
            .collect::<BTreeSet<_>>()
            .len()
            > 1;
        if contradictory {
            local_warnings.push("Multiple DEV claim identities; PM must resolve ownership".into());
        }
        let blockers: Vec<String> = unit
            .as_ref()
            .and_then(|u| plan.get(u))
            .map(|n| {
                n.dependencies
                    .iter()
                    .filter(|d| !completed.contains(*d))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let eligible = unit
            .as_ref()
            .and_then(|u| plan.get(u))
            .map(|_| blockers.is_empty());
        let state = s(v, "state");
        let stage = if state == "MERGED" {
            Stage::Merged
        } else if state == "CLOSED" {
            Stage::Closed
        } else if conflicting_versions {
            Stage::Unknown
        } else if labels.iter().any(|l| l == "halt" || l == "status:blocked")
            || contradictory
            || (!blockers.is_empty() && kind == "issue")
            || latest_verdict.is_some_and(|e| verdict(&e.body) == Some("FAIL"))
        {
            Stage::Blocked
        } else if kind == "pr" && current_pass {
            Stage::Guard
        } else if kind == "pr" && qa_claim {
            Stage::Qa
        } else if kind == "pr" {
            if v["isDraft"] == true {
                Stage::Claimed
            } else {
                Stage::Delivered
            }
        } else if latest_claim.is_some() {
            Stage::Claimed
        } else if labels.iter().any(|l| l == "status:ready") && eligible == Some(true) {
            Stage::Ready
        } else if labels.iter().any(|l| l == "status:ready") && eligible.is_none() {
            local_warnings
                .push("Ready label without pinned dependency contract; eligibility unknown".into());
            Stage::Unknown
        } else {
            Stage::Planned
        };
        if latest_claim.is_some() {
            local_warnings.push("CLAIM is ownership evidence; native running state UNKNOWN".into());
        }
        let candidate_ready = if kind == "pr" && v["isDraft"] != true && state == "OPEN" {
            previous
                .and_then(|p| {
                    p.items
                        .iter()
                        .find(|i| i.number == number && i.head_sha == head)
                })
                .and_then(|i| i.candidate_ready_at.clone())
                .or_else(|| Some(raw.collected_at.clone()))
        } else {
            None
        };
        if candidate_ready.as_deref() == Some(&raw.collected_at) {
            local_warnings.push("Candidate age starts at first observed current-head non-draft state; historical ready time unknown".into());
        }
        let stage_since = match stage {
            Stage::Delivered => candidate_ready.clone(),
            Stage::Qa | Stage::Claimed => latest_claim.map(|e| e.at.clone()),
            Stage::Guard => latest_verdict.map(|e| effective_at(e).to_string()),
            Stage::Merged => v["mergedAt"].as_str().map(str::to_string),
            _ => None,
        };
        let stage_age = stage_since
            .as_deref()
            .and_then(|t| seconds(t, &raw.collected_at));
        let (seat, action) = match stage {
            Stage::Guard => ("GUARD", "Review exact head and merge through forge"),
            Stage::Qa => ("QA", "Complete independent review of current head"),
            Stage::Delivered => ("QA", "Dispatch independent current-head QA"),
            Stage::Blocked => ("PM", "Resolve named blocker or FAIL before dispatch"),
            Stage::Ready => ("DEV", "Claim after rechecking dependencies and halt"),
            Stage::Claimed => ("DEV", "Publish progress or candidate; runtime unknown"),
            Stage::Merged | Stage::Closed => ("PM", "Recompute newly eligible dependencies"),
            _ => ("PM", "Establish contract and dependency eligibility"),
        };
        let category =
            if labels.iter().any(|l| l == "kind:hygiene") || s(v, "title").starts_with("HYG-") {
                "hygiene"
            } else if labels.iter().any(|l| l == "kind:packet") || unit.is_none() {
                "governance"
            } else {
                "product"
            }
            .into();
        let mut metrics = BTreeMap::new();
        let ready_event = list(v, "timelineItems")
            .into_iter()
            .filter(|e| e["__typename"] == "LabeledEvent" && e["label"]["name"] == "status:ready")
            .map(|e| s(&e, "createdAt"))
            .min();
        if let Some(ready) = ready_event.as_deref()
            && let Some(claim) = claims.iter().find(|e| e.at.as_str() >= ready)
            && let Some(n) = seconds(ready, &claim.at)
        {
            metrics.insert("dispatch_ready_label_to_claim".into(), n);
        }
        if state == "MERGED"
            && let Some(at) = v["mergedAt"].as_str()
            && let Some(n) = seconds(&s(v, "createdAt"), at)
        {
            metrics.insert("pr_created_to_merged".into(), n);
        }
        if let (Some(ready), Some(qa)) = (
            candidate_ready.as_deref(),
            latest_claim.filter(|_| qa_claim),
        ) && qa.at.as_str() >= ready
            && let Some(n) = seconds(ready, &qa.at)
        {
            metrics.insert("candidate_ready_to_qa_observed".into(), n);
        }
        if current_pass
            && let Some(e) = latest_verdict
            && let Some(n) = seconds(effective_at(e), &raw.collected_at)
        {
            metrics.insert("pass_to_guard_wait".into(), n);
        }
        items.push(Item {
            number,
            kind,
            title: s(v, "title"),
            url: s(v, "url"),
            unit,
            category,
            stage,
            labels,
            head_sha: head,
            dependency_eligible: eligible,
            blockers,
            responsible_seat: seat.into(),
            next_action: action.into(),
            candidate_ready_at: candidate_ready,
            stage_since,
            stage_age_seconds: stage_age,
            current_head_pass: current_pass,
            observed_dimensions: dimensions(&history),
            history,
            warnings: local_warnings,
            metrics_seconds: metrics,
        });
    }
    items.sort_by_key(|i| i.number);
    if let Some(p) = previous {
        for old in &p.items {
            if !items.iter().any(|i| i.number == old.number) {
                warnings.push(format!(
                    "Previously observed #{} is absent; deletion/access change UNKNOWN",
                    old.number
                ));
            }
        }
        for item in &mut items {
            if let Some(old) = p.items.iter().find(|i| i.number == item.number) {
                for e in &old.history {
                    if !item.history.iter().any(|n| n.id == e.id) {
                        item.warnings.push(format!("Evidence {} removed or unavailable; prior receipt retained in immutable history",e.id));
                    } else if item
                        .history
                        .iter()
                        .any(|n| n.id == e.id && n.sha256 != e.sha256)
                    {
                        item.warnings.push(format!(
                            "Evidence {} edited; exact prior digest retained in immutable history",
                            e.id
                        ));
                    }
                }
            }
        }
    }
    let mut queues = BTreeMap::new();
    for item in &items {
        *queues.entry(stage_key(&item.stage)).or_insert(0) += 1;
    }
    let digest = hash(&canonical(
        &json!({"items":items,"plan":raw.plan,"sources":raw.sources}),
    )?);
    Ok(Snapshot{schema:"isoscope.workflow/1".into(),repository:raw.repository.clone(),collected_at:raw.collected_at.clone(),plan_commit:raw.plan_commit.clone(),content_sha256:digest,status:"fresh".into(),stale_after_seconds:config.stale_after_seconds,last_error:None,coverage:raw.sources.clone(),warnings,items,plan_nodes:plan.into_values().collect(),queues,owner_observations:config.owner_observations.clone(),native_runtime_status:"UNKNOWN: no native cloud runtime telemetry; one Droid missions seat may contain internal workers".into(),token_cost_status:"UNKNOWN: no measured token/cost receipts ingested".into()})
}
