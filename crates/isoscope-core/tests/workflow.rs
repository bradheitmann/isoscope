use isoscope_core::{
    github::{hash, join_connection},
    model::{Config, Raw, Stage},
    reduce::reduce,
    store,
};
use serde_json::{Value, json};
fn raw(items: Vec<Value>) -> Raw {
    Raw {
        repository: "fixture/test".into(),
        collected_at: "2026-10-01T04:00:00Z".into(),
        plan_commit: "a".repeat(40),
        plan: json!({"critical_path":["WP-01"],"nodes":[],"slices":[{"node":"WP-01/S01","planned":"done","depends_on":[]},{"node":"WP-01/S02","planned":"ready","depends_on":["WP-01/S01"]}]}),
        items,
        sources: vec![],
        warnings: vec![],
    }
}
fn issue(n: u64, unit: &str, state: &str) -> Value {
    json!({"__typename":"Issue","number":n,"id":format!("I{n}"),"title":format!("{unit}: test"),"body":format!("<!-- leit-slice: {unit} -->"),"state":state,"url":format!("https://github.com/fixture/test/issues/{n}"),"createdAt":"2026-09-30T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z","labels":{"nodes":[{"name":"status:ready"}]},"comments":[],"reviews":[],"timelineItems":[]})
}
fn pr() -> Value {
    let mut v = issue(3, "WP-01/S02", "OPEN");
    v["__typename"] = json!("PullRequest");
    v["headRefOid"] = json!("b".repeat(40));
    v["isDraft"] = json!(false);
    v
}
fn comment(id: &str, body: &str, at: &str) -> Value {
    json!({"id":id,"body":body,"createdAt":at,"updatedAt":at,"url":"https://github.com/fixture/test/issues/3#comment"})
}
fn connection(nodes: Vec<Value>, total: u64, next: Option<&str>) -> Value {
    json!({"nodes":nodes,"totalCount":total,"pageInfo":{"hasNextPage":next.is_some(),"endCursor":next}})
}
#[test]
fn pagination_walks_all_pages() {
    let start = connection(vec![json!(1)], 3, Some("a"));
    let (nodes, pages) = join_connection(start, |c| {
        Ok(if c == "a" {
            connection(vec![json!(2)], 3, Some("b"))
        } else {
            connection(vec![json!(3)], 3, None)
        })
    })
    .unwrap();
    assert_eq!(nodes, json!([1, 2, 3]).as_array().unwrap().to_vec());
    assert_eq!(pages, 3);
}
#[test]
fn pagination_refuses_loop_partial_and_changing_count() {
    assert!(
        join_connection(connection(vec![json!(1)], 2, Some("x")), |_| Ok(
            connection(vec![], 2, Some("x"))
        ))
        .is_err()
    );
    assert!(join_connection(connection(vec![json!(1)], 2, None), |_| unreachable!()).is_err());
    assert!(
        join_connection(connection(vec![json!(1)], 2, Some("x")), |_| Ok(
            connection(vec![json!(2)], 3, None)
        ))
        .is_err()
    );
}
#[test]
fn ready_label_cannot_bypass_dependencies() {
    let s = reduce(
        &raw(vec![issue(2, "WP-01/S02", "OPEN")]),
        &Config::default(),
        None,
    )
    .unwrap();
    assert_eq!(s.items[0].stage, Stage::Blocked);
    assert_eq!(s.items[0].dependency_eligible, Some(false));
    assert_eq!(s.items[0].blockers, vec!["WP-01/S01"]);
}
#[test]
fn completed_pinned_and_closed_dependency_is_eligible() {
    let s = reduce(
        &raw(vec![
            issue(1, "WP-01/S01", "CLOSED"),
            issue(2, "WP-01/S02", "OPEN"),
        ]),
        &Config::default(),
        None,
    )
    .unwrap();
    assert_eq!(s.items[1].stage, Stage::Ready);
}
#[test]
fn claim_does_not_imply_running() {
    let mut i = issue(1, "WP-01/S01", "OPEN");
    i["comments"] = json!([comment(
        "c",
        "CLAIM WP-01/S01 seat=DEV at 2026-10-01T00:00:00Z\nAgent: droid/luna/a",
        "2026-10-01T00:00:00Z"
    )]);
    let s = reduce(&raw(vec![i]), &Config::default(), None).unwrap();
    assert_eq!(s.items[0].stage, Stage::Claimed);
    assert!(s.native_runtime_status.starts_with("UNKNOWN"));
}
#[test]
fn old_pass_and_unbound_pass_cannot_accept_new_head() {
    let mut p = pr();
    p["comments"] = json!([
        comment(
            "c",
            &format!("VERDICT: PASS\nHead reviewed: {}", "a".repeat(40)),
            "2026-10-01T00:00:00Z"
        ),
        comment(
            "d",
            "VERDICT: PASS\nprose mentions new head",
            "2026-10-01T01:00:00Z"
        )
    ]);
    let s = reduce(&raw(vec![p]), &Config::default(), None).unwrap();
    assert!(!s.items[0].current_head_pass);
    assert_eq!(s.items[0].stage, Stage::Delivered);
}
#[test]
fn later_fail_supersedes_pass_on_same_head() {
    let mut p = pr();
    p["comments"] = json!([
        comment(
            "c",
            &format!("VERDICT: PASS\nHead reviewed: {}", "b".repeat(40)),
            "2026-10-01T00:00:00Z"
        ),
        comment(
            "d",
            &format!("VERDICT: FAIL\nHead reviewed: {}", "b".repeat(40)),
            "2026-10-01T01:00:00Z"
        )
    ]);
    let s = reduce(&raw(vec![p]), &Config::default(), None).unwrap();
    assert!(!s.items[0].current_head_pass);
    assert_eq!(s.items[0].stage, Stage::Blocked);
}
#[test]
fn out_of_order_duplicate_events_are_idempotent() {
    let a = comment("a", "CLAIM PR#3 seat=QA head=x", "2026-10-01T01:00:00Z");
    let b = comment(
        "b",
        &format!("VERDICT: PASS\nHead reviewed: {}", "b".repeat(40)),
        "2026-10-01T02:00:00Z",
    );
    let mut p = pr();
    p["comments"] = json!([a.clone(), b.clone(), a.clone()]);
    let one = reduce(&raw(vec![p.clone()]), &Config::default(), None).unwrap();
    p["comments"] = json!([b, a]);
    let two = reduce(&raw(vec![p]), &Config::default(), None).unwrap();
    assert_eq!(one.content_sha256, two.content_sha256);
    assert_eq!(one.items[0].stage, Stage::Guard);
}
#[test]
fn new_head_resets_candidate_first_observed_time() {
    let r = raw(vec![pr()]);
    let one = reduce(&r, &Config::default(), None).unwrap();
    let mut next = r.clone();
    next.collected_at = "2026-10-01T05:00:00Z".into();
    let two = reduce(&next, &Config::default(), Some(&one)).unwrap();
    assert_eq!(
        two.items[0].candidate_ready_at,
        one.items[0].candidate_ready_at
    );
    next.items[0]["headRefOid"] = json!("c".repeat(40));
    let three = reduce(&next, &Config::default(), Some(&two)).unwrap();
    assert_eq!(three.items[0].candidate_ready_at, Some(next.collected_at));
}
#[test]
fn contradictory_dev_claims_require_pm_resolution() {
    let mut i = issue(1, "WP-01/S01", "OPEN");
    i["comments"] = json!([
        comment(
            "a",
            "CLAIM WP-01/S01 seat=DEV\nAgent: one",
            "2026-10-01T00:00:00Z"
        ),
        comment(
            "b",
            "CLAIM WP-01/S01 seat=DEV\nAgent: two",
            "2026-10-01T01:00:00Z"
        )
    ]);
    let s = reduce(&raw(vec![i]), &Config::default(), None).unwrap();
    assert_eq!(s.items[0].stage, Stage::Blocked);
}
#[test]
fn disconnected_source_retains_last_good_visibly_stale() {
    let d = tempfile::tempdir().unwrap();
    let s = store::publish(d.path(), &raw(vec![pr()]), &Config::default()).unwrap();
    store::fail(d.path(), "offline").unwrap();
    let failed = store::read_snapshot(d.path()).unwrap();
    assert_eq!(failed.status, "stale");
    assert_eq!(failed.content_sha256, s.content_sha256);
    assert_eq!(failed.last_error.as_deref(), Some("offline"));
    assert_eq!(
        std::fs::read_dir(d.path().join("receipts"))
            .unwrap()
            .count(),
        1
    );
}
#[test]
fn lock_prevents_overlap_and_paths_cannot_escape_worktree() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let lock = store::RefreshLock::acquire(a.path()).unwrap();
    assert!(store::RefreshLock::acquire(a.path()).is_err());
    drop(lock);
    assert!(store::RefreshLock::acquire(a.path()).is_ok());
    assert!(store::isolated_state(a.path(), b.path()).is_err());
    assert!(store::isolated_state(a.path(), std::path::Path::new("../outside")).is_err());
}
#[test]
fn deletion_is_unknown_and_receipts_bind_source_bytes() {
    let one = reduce(&raw(vec![pr()]), &Config::default(), None).unwrap();
    let two = reduce(&raw(vec![]), &Config::default(), Some(&one)).unwrap();
    assert!(two.warnings[0].contains("absent"));
    assert_ne!(hash(b"a"), hash(b"b"));
}
