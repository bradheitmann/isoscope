//! Bounded deterministic parsing of reported orchestration events. Never acceptance authority.
use crate::{
    github::hash,
    model::{Evidence, Snapshot},
};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEvent {
    pub source_id: String,
    pub source_url: String,
    pub source_created_at: String,
    pub source_edited_at: String,
    pub source_body_sha256: String,
    pub event_line_sha256: String,
    pub reported: Option<Value>,
    pub raw_line: String,
    pub warnings: Vec<String>,
    pub authority: String,
}
pub fn parse(e: &Evidence) -> Vec<ProcessEvent> {
    e.body.lines().enumerate().filter_map(|(index,line)|{
        let payload=line.strip_prefix("leit-ev: ")?;
        let mut warnings=Vec::new();
        let reported=match serde_json::from_str::<Value>(payload){Ok(v)=>Some(v),Err(_)=>{warnings.push("Malformed JSON; preserved as source observation only".into());None}};
        if index+1!=e.body.lines().count(){warnings.push("Event is not the terminal comment line; later source text retained".into());}
        if let Some(v)=&reported {
            if !v.is_object(){warnings.push("Event payload must be an object".into());}
            if !v["event"].as_str().is_some_and(|s|s.starts_with("orch.")){warnings.push("Unknown event namespace".into());}
            for key in ["ts","trace_id","parent","agent","seat","family","head","outcome","duration_ms","wait_cause","rounds","tokens"]{if v.get(key).is_none(){warnings.push(format!("Missing {key}; not synthesized"));}}
            match v["ts"].as_str().and_then(|s|DateTime::parse_from_rfc3339(s).ok()){
                Some(ts)=>if DateTime::parse_from_rfc3339(&e.at).is_ok_and(|source|ts>source){warnings.push("Embedded timestamp is later than forge creation timestamp; not used as authority".into());},
                None=>warnings.push("Embedded timestamp unavailable or malformed".into()),
            }
            for key in ["duration_ms","rounds","tokens"]{if let Some(value)=v.get(key){if !value.is_null()&&!value.is_u64(){warnings.push(format!("{key} must be unsigned integer or explicit null"));}}}
            if v["head"].as_str().is_some_and(|s|s.len()!=40||!s.bytes().all(|b|b.is_ascii_hexdigit())){warnings.push("Reported head is not an exact 40-hex binding".into());}
        }
        Some(ProcessEvent{source_id:e.id.clone(),source_url:e.source_url.clone(),source_created_at:e.at.clone(),source_edited_at:e.edited_at.clone(),source_body_sha256:e.sha256.clone(),event_line_sha256:hash(line.as_bytes()),reported,raw_line:line.into(),warnings,authority:"forge_reported_observation_only; no native runtime or acceptance proof".into()})
    }).collect()
}
pub fn from_snapshot(snapshot: &Snapshot) -> Vec<ProcessEvent> {
    let mut events: Vec<_> = snapshot
        .items
        .iter()
        .flat_map(|i| i.history.iter().flat_map(parse))
        .collect();
    events.sort_by(|a, b| {
        (&a.source_created_at, &a.source_id, &a.event_line_sha256).cmp(&(
            &b.source_created_at,
            &b.source_id,
            &b.event_line_sha256,
        ))
    });
    events
        .dedup_by(|a, b| a.source_id == b.source_id && a.event_line_sha256 == b.event_line_sha256);
    events
}
#[cfg(test)]
mod tests {
    use super::*;
    fn evidence(body: &str) -> Evidence {
        Evidence {
            id: "comment-1".into(),
            at: "2026-10-01T04:00:00Z".into(),
            edited_at: "2026-10-01T05:00:00Z".into(),
            kind: "comment".into(),
            source_url: "https://github.com/test/test/issues/3#comment-1".into(),
            sha256: hash(body.as_bytes()),
            body: body.into(),
        }
    }
    #[test]
    fn explicit_nulls_and_source_identity_survive() {
        let events = parse(&evidence(
            "leit-ev: {\"event\":\"orch.claim\",\"ts\":\"2026-10-01T03:00:00Z\",\"trace_id\":\"WP-03/S09\",\"parent\":null,\"agent\":\"droid/luna/a\",\"seat\":\"DEV\",\"family\":\"droid-missions\",\"head\":null,\"outcome\":\"ok\",\"duration_ms\":null,\"wait_cause\":null,\"rounds\":null,\"tokens\":null}",
        ));
        assert_eq!(events.len(), 1);
        assert!(events[0].warnings.is_empty());
        assert_eq!(events[0].reported.as_ref().unwrap()["tokens"], Value::Null);
        assert_eq!(
            events[0].reported.as_ref().unwrap()["trace_id"],
            "WP-03/S09"
        );
        assert_eq!(events[0].source_edited_at, "2026-10-01T05:00:00Z");
    }
    #[test]
    fn future_and_malformed_are_visible() {
        let future = parse(&evidence(
            "leit-ev: {\"event\":\"orch.claim\",\"ts\":\"2099-01-01T00:00:00Z\"}",
        ));
        assert!(future[0].warnings.iter().any(|w| w.contains("later than")));
        let malformed = parse(&evidence("leit-ev: nope"));
        assert!(malformed[0].reported.is_none());
        assert_eq!(malformed[0].raw_line, "leit-ev: nope");
    }
    #[test]
    fn prose_and_fenced_examples_cannot_change_projection() {
        let events = parse(&evidence("quoted `leit-ev: {}`\nleit-ev: {}\nfooter"));
        assert_eq!(events.len(), 1);
        assert!(events[0].warnings.iter().any(|w| w.contains("terminal")));
        assert!(events[0].authority.starts_with("forge_reported"));
    }
}
