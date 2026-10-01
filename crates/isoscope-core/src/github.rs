//! Read-only forge adapter. gh owns credential custody; commands use argument vectors.
use crate::model::{Config, Raw, Source};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, process::Command};

pub type Result<T> = std::result::Result<T, String>;
pub fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
pub fn canonical(value: &Value) -> Result<Vec<u8>> {
    serde_json::to_vec(value).map_err(|e| e.to_string())
}
fn gh(args: &[&str]) -> Result<Value> {
    let out = Command::new("gh")
        .args(args)
        .output()
        .map_err(|e| format!("gh unavailable: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let detail = stderr
            .lines()
            .filter(|s| s.starts_with("gh: ") && !s.contains("token") && !s.contains("http"))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!(
            "forge request failed ({}): {detail}; credentials omitted",
            out.status
        ));
    }
    let value: Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("forge JSON: {e}"))?;
    if value.get("errors").is_some() {
        return Err("GraphQL returned errors; refresh incomplete".into());
    }
    Ok(value)
}
fn query(q: &str) -> Result<Value> {
    gh(&["api", "graphql", "-f", &format!("query={q}")])
}
const PAGE: &str = "pageInfo{hasNextPage endCursor} totalCount";
const COMMENT: &str = "id body createdAt updatedAt url author{login}";
const TIMELINE: &str = "__typename ... on LabeledEvent{id createdAt label{name}} ... on UnlabeledEvent{id createdAt label{name}} ... on ClosedEvent{id createdAt} ... on ReopenedEvent{id createdAt} ... on AssignedEvent{id createdAt} ... on UnassignedEvent{id createdAt}";
const PR_TIMELINE: &str = " ... on PullRequestCommit{commit{oid committedDate pushedDate}} ... on HeadRefForcePushedEvent{id createdAt afterCommit{oid} beforeCommit{oid}} ... on ReadyForReviewEvent{id createdAt} ... on ConvertToDraftEvent{id createdAt}";
const REVIEW: &str = "id body state submittedAt updatedAt url author{login} commit{oid}";
fn after(cursor: Option<&str>) -> String {
    cursor
        .map(|c| format!(",after:{}", json!(c)))
        .unwrap_or_default()
}
/// Append all pages, reject repeated cursors and count inconsistencies rather than silently truncate.
pub fn join_connection<F>(initial: Value, next: F) -> Result<(Vec<Value>, usize)>
where
    F: FnMut(&str) -> Result<Value>,
{
    join_pages(initial, next, true)
}
fn join_pages<F>(initial: Value, mut next: F, strict_count: bool) -> Result<(Vec<Value>, usize)>
where
    F: FnMut(&str) -> Result<Value>,
{
    let mut connection = initial;
    let expected = connection["totalCount"]
        .as_u64()
        .ok_or("connection missing totalCount")? as usize;
    let mut nodes = Vec::new();
    let mut pages = 0;
    let mut seen = BTreeSet::new();
    loop {
        pages += 1;
        nodes.extend(
            connection["nodes"]
                .as_array()
                .ok_or("connection missing nodes")?
                .iter()
                .cloned(),
        );
        if !connection["pageInfo"]["hasNextPage"]
            .as_bool()
            .ok_or("connection missing pageInfo")?
        {
            break;
        }
        let cursor = connection["pageInfo"]["endCursor"]
            .as_str()
            .ok_or("missing pagination cursor")?;
        if !seen.insert(cursor.to_string()) {
            return Err("pagination cursor repeated".into());
        }
        connection = next(cursor)?;
        if strict_count && connection["totalCount"].as_u64() != Some(expected as u64) {
            return Err("source changed during pagination; retry required".into());
        }
    }
    if strict_count && nodes.len() != expected {
        return Err(format!("partial connection: {} of {expected}", nodes.len()));
    }
    Ok((nodes, pages))
}
fn nested(
    item: &mut Value,
    field: &str,
    selection: &str,
    sources: &mut Vec<Source>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let mut initial = item[field].clone();
    let id = item["id"].as_str().ok_or("item missing id")?.to_string();
    let typename = item["__typename"]
        .as_str()
        .ok_or("item missing typename")?
        .to_string();
    let fetch = |cursor: Option<&str>| {
        let q = [
            "query{node(id:",
            &json!(id).to_string(),
            "){... on ",
            &typename,
            "{",
            field,
            "(first:100",
            &after(cursor),
            "){",
            PAGE,
            " nodes{",
            selection,
            "}}}}}",
        ]
        .concat();
        Ok(query(&q)?["data"]["node"][field].clone())
    };
    let mut attempts = 0;
    let (nodes, pages) = loop {
        match join_pages(
            initial,
            |cursor| fetch(Some(cursor)),
            field != "timelineItems",
        ) {
            Ok(value) => break value,
            Err(e) if e.contains("source changed") && attempts < 2 => {
                attempts += 1;
                initial = fetch(None)?;
            }
            Err(e) => return Err(format!("node/{id}/{field}: {e}")),
        }
    };
    if field == "timelineItems"
        && !warnings
            .iter()
            .any(|w| w.starts_with("Timeline count semantics:"))
    {
        warnings.push("Timeline count semantics: all pageInfo pages exhausted; GitHub totalCount is not a count of returned nodes (live PR #112: 11 reported, 15 returned)".into());
    }
    sources.push(Source {
        endpoint: format!("node/{id}/{field}"),
        pages,
        count: nodes.len(),
        sha256: hash(&canonical(&json!(nodes))?),
    });
    item[field] = json!(nodes);
    Ok(())
}
pub fn collect(config: &Config) -> Result<Raw> {
    let (owner, name) = config
        .repository
        .split_once('/')
        .ok_or("repository must be owner/name")?;
    if ![owner, name].iter().all(|s| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_ .".contains(&b))
            && !s.contains(' ')
    }) {
        return Err("invalid repository".into());
    }
    if config.plan_path.starts_with('/') || config.plan_path.split('/').any(|s| s == "..") {
        return Err("plan path must stay repository-relative".into());
    }
    let commit = gh(&["api", &format!("repos/{}/commits/HEAD", config.repository)])?["sha"]
        .as_str()
        .ok_or("missing plan commit")?
        .to_string();
    let content = gh(&[
        "api",
        &format!(
            "repos/{}/contents/{}?ref={commit}",
            config.repository, config.plan_path
        ),
    ])?;
    let encoded = content["content"]
        .as_str()
        .ok_or("plan content unavailable")?
        .replace('\n', "");
    let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    let plan: Value = serde_json::from_slice(&bytes).map_err(|e| format!("plan JSON: {e}"))?;
    let mut sources = vec![Source {
        endpoint: format!("{}/blob/{commit}/{}", config.repository, config.plan_path),
        pages: 1,
        count: 1,
        sha256: hash(&bytes),
    }];
    let mut items = Vec::new();
    let mut warnings=vec!["Forge read spans separate requests; each PR binds its collected head, plan binds resolved commit; no cross-endpoint transaction guarantee".into()];
    for (connection, extra) in [
        ("issues", String::new()),
        (
            "pullRequests",
            format!(
                "headRefOid isDraft mergedAt commits(last:1){{nodes{{commit{{oid pushedDate committedDate}}}}}} reviews(first:20){{{PAGE} nodes{{{REVIEW}}}}}"
            ),
        ),
    ] {
        let timeline = if connection == "pullRequests" {
            [TIMELINE, PR_TIMELINE].concat()
        } else {
            TIMELINE.to_string()
        };
        let mut cursor: Option<String> = None;
        let mut seen = BTreeSet::new();
        let mut pages = 0;
        let start = items.len();
        loop {
            let q = ["query{repository(owner:",&json!(owner).to_string(),",name:",&json!(name).to_string(),"){",connection,"(first:20",&after(cursor.as_deref()),",orderBy:{field:CREATED_AT,direction:ASC}){",PAGE," nodes{__typename id number title body state url createdAt updatedAt labels(first:100){nodes{name} pageInfo{hasNextPage}} comments(first:20){",PAGE," nodes{",COMMENT,"}} timelineItems(first:20){",PAGE," nodes{",&timeline,"}} ",&extra,"}}}}"].concat();
            let v = query(&q)?;
            let conn = &v["data"]["repository"][connection];
            pages += 1;
            for item in conn["nodes"].as_array().ok_or("missing repository nodes")? {
                let mut item = item.clone();
                if item["labels"]["pageInfo"]["hasNextPage"] == true {
                    return Err("more than 100 labels; incomplete label coverage".into());
                }
                nested(&mut item, "comments", COMMENT, &mut sources, &mut warnings)?;
                nested(
                    &mut item,
                    "timelineItems",
                    &timeline,
                    &mut sources,
                    &mut warnings,
                )?;
                if connection == "pullRequests" {
                    nested(&mut item, "reviews", REVIEW, &mut sources, &mut warnings)?;
                    let head = item["headRefOid"]
                        .as_str()
                        .ok_or("missing PR head")?
                        .to_string();
                    let endpoint = format!(
                        "repos/{}/commits/{head}/check-runs?per_page=100",
                        config.repository
                    );
                    let raw = gh(&["api", "--paginate", "--slurp", &endpoint])?;
                    let check_pages = raw.as_array().ok_or("check pagination missing pages")?;
                    let checks: Vec<Value> = check_pages
                        .iter()
                        .flat_map(|p| p["check_runs"].as_array().into_iter().flatten().cloned())
                        .collect();
                    if check_pages.first().and_then(|v| v["total_count"].as_u64())
                        != Some(checks.len() as u64)
                    {
                        return Err("partial checks coverage".into());
                    }
                    sources.push(Source {
                        endpoint,
                        pages: check_pages.len(),
                        count: checks.len(),
                        sha256: hash(&canonical(&json!(checks))?),
                    });
                    item["checks"] = json!(checks);
                    let endpoint = format!(
                        "repos/{}/commits/{head}/statuses?per_page=100",
                        config.repository
                    );
                    let raw = gh(&["api", "--paginate", "--slurp", &endpoint])?;
                    let pages = raw.as_array().ok_or("status pagination missing pages")?;
                    let statuses: Vec<Value> = pages
                        .iter()
                        .flat_map(|p| p.as_array().into_iter().flatten().cloned())
                        .collect();
                    sources.push(Source {
                        endpoint,
                        pages: pages.len(),
                        count: statuses.len(),
                        sha256: hash(&canonical(&json!(statuses))?),
                    });
                    item["statuses"] = json!(statuses);
                }
                items.push(item);
            }
            if !conn["pageInfo"]["hasNextPage"]
                .as_bool()
                .ok_or("missing top pagination")?
            {
                break;
            }
            let next = conn["pageInfo"]["endCursor"]
                .as_str()
                .ok_or("missing top cursor")?
                .to_string();
            if !seen.insert(next.clone()) {
                return Err("top pagination cursor repeated".into());
            }
            cursor = Some(next);
        }
        sources.push(Source {
            endpoint: format!("{}/{connection}", config.repository),
            pages,
            count: items.len() - start,
            sha256: hash(&canonical(&json!(&items[start..]))?),
        });
    }
    items.sort_by_key(|v| v["number"].as_u64().unwrap_or_default());
    Ok(Raw {
        repository: config.repository.clone(),
        collected_at: Utc::now().to_rfc3339(),
        plan_commit: commit,
        plan,
        items,
        sources,
        warnings,
    })
}
