# Bounded QA verdict: canonical JSON feature unification

## Verdict

**PASS — bounded scope only.** No defect found in the canonical JSON sorting correction or its regression/document delta. This does not assess native/web design, runtime, or product acceptance.

## Binding and scope

- Candidate HEAD: `eed65460e238c888c5874dd60346e7ca65049988` (`fix: canonicalize JSON independently of native dependency features`).
- Comparison parent: `4279ccd8c00970dddc6787a035985935d7a544d2`.
- Ancestry: `git merge-base --is-ancestor 4279ccd8c00970dddc6787a035985935d7a544d2 eed65460e238c888c5874dd60346e7ca65049988` → exit 0.
- Changed paths (exact candidate diff):
  - `crates/isoscope-core/src/github.rs` — SHA-256 `e394712eda5b87d3b7b8abc9630249b015deb04e4e53e4e3744d5fb599b92cd9`; Git blob `801ef34329dd12e46267a3206b83da27c2252652`.
  - `crates/isoscope-core/src/graph.rs` — SHA-256 `e48e979123b3f80915d6044c950309abb5e9768e9f6402e32460d265c76f5517`; Git blob `e001c85fdf163a776d3250658f38d0e2efdd6bab`.
  - `crates/isoscope-core/tests/workflow.rs` — SHA-256 `544dace375195b66122c6827bf53dc970a01b82e635859c72b58457b885003f4`; Git blob `db260bff7970322ada090e54f1feb4c567452a9a`.
  - `replacement/validation/canonical-feature-unification.md` — SHA-256 `29e9dc105154240776c4bbc44e96dba1cacd4ad18c212f392893c85e7a6d9b5d`; Git blob `a3eda581bd8ac2bef2345202ef8d8dce83e348ca`.
- SHA-256 of the full parent-to-candidate diff: `50a2071eb25b33a09f213d966818bdf9715df124e4451f337e244631a05601a5`.
- No repository `AGENTS.md` was found; the user-provided instructions were followed.

## Findings

- `github::canonical` clones the value and calls `sort_all_objects()` before serialization. Under the locked `serde_json/preserve_order` feature, the committed regression passed for shuffled nested keys at root and inside an array, with exact canonical bytes asserted.
- A temporary, read-only Rust probe in this QA checkout passed under `preserve_order`: nested objects sorted inside array elements, array element order remained as supplied, and reversing the array changed canonical bytes and SHA-256. The probe was removed after execution.
- The existing `out_of_order_duplicate_events_are_idempotent` workflow test passed and asserts equal snapshot `content_sha256` for reordered/duplicated equivalent event input.
- Graph-history `before_sha256` and record digest now use the common canonical helper. The diff changes no receipt/snapshot model fields or schema tags. A temporary probe also successfully deserialized a representative pre-change raw receipt shape into `model::Raw`; the probe was removed.
- No captured raw receipt/replay JSON fixture is present in this checkout. Therefore the documented 292-item replay hash `f1e36e88b2ba3b5d46c2dda8b3104576ed0c91dc90f91c9948d710af67ab88c6` was **not independently reproduced**. The note’s historical claim remains unverified by this bounded run.

## Commands and results

- `cargo test --locked -p isoscope-core` — exit 0; 26 tests passed (3 library + 23 workflow; 0 failed).
- `cargo test --locked -p isoscope-core --features serde_json/preserve_order` — exit 0; 26 tests passed (3 library + 23 workflow; 0 failed).
- `cargo clippy --locked -p isoscope-core --all-targets --features serde_json/preserve_order -- -D warnings` — exit 0; no warnings.
- Temporary array-order/hash and legacy-raw-shape probe: `cargo test --locked -p isoscope-core --features serde_json/preserve_order --test bounded_qa_probe` — exit 0; 2 passed, 0 failed. Temporary test file removed.
- `git diff --check 4279ccd8c00970dddc6787a035985935d7a544d2 eed65460e238c888c5874dd60346e7ca65049988` — exit 0.
- Final `git diff --quiet HEAD` — exit 0; QA checkout worktree clean.

## Runtime and token evidence

No native runtime or token-usage evidence was collected for this scope. Both remain **UNKNOWN**.
