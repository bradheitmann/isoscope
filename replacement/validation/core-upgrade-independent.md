## Verdict: **PASS — bounded core dependency QA**

Bound to candidate commit `16b64cd6e5f8862a71963b7b10a4330969a62d24`, parent `d658eb0b0ee66d9c711365587a4a4a125b6d77fd`, against accepted ancestor `54ecdda92f5492606ec00ffecc87842c081889e6`. The worktree was clean before and after QA. The candidate commit changes five files; the larger accepted-to-candidate history also contains four earlier documentation commits, which this verdict does not independently accept.

### Binding manifest

Candidate patch SHA-256: `50ff7b481f786d20a8542370bfe701658c3a30286db3d2d4a3ffb880576e7098`

| File in candidate patch | SHA-256 |
|---|---|
| `Cargo.lock` | `086999b47da9b550ad5fe70c83c5883287d35817ceb703086630039918d8d41a` |
| `crates/isoscope-core/Cargo.toml` | `865672f3213822f8c5c1fef9587dd26c9408a26943da4728e27be47e669478ec` |
| `crates/isoscope-core/src/github.rs` | `712eec6071b69dbc6d89dc6813b28b393931ca356a2e38c4811cfbbc36aa3371` |
| `crates/isoscope-core/tests/workflow.rs` | `9fafc0fc5e5fe072efa270bb6fb7ac09885bce204cfcb6b53bc00c9da811dc25` |
| `replacement/validation/dependencies.md` | `b3dc4e27fc18061f6748ebe3e627cac75b6589349e45414504c2f95afa970f57` |

### Findings and checks

The core pins `sha2 = 0.11.0` and `base64 = 0.23.1` exactly. The digest update resolves to `digest 0.11.3`, `block-buffer 0.12.1`, `crypto-common 0.2.2`, `cpufeatures 0.3.1`, and `hybrid-array 0.4.15`. `cargo metadata --locked` reported the manifest’s exact requirements and Rust version `1.85`; `cargo tree --locked -d` reported no duplicate dependencies. The lockfile resolved successfully with `--locked`.

The dependency note’s direct matrix matches the manifest and lock: `serde 1.0.229`, `serde_json 1.0.151`, `sha2 0.11.0`, `chrono 0.4.45`, `fs2 0.4.3`, `base64 0.23.1`, `clap 4.6.7`, `tiny_http 0.12.0`, `flate2 1.1.10`, and test-only `tempfile 3.27.0`. `fs2` and `tiny_http` have no declared MSRV in that matrix; the entire locked core test build nevertheless passed on Rust 1.85.1. `cargo info` confirmed the pinned `sha2` and `base64` versions and their declared MSRVs, 1.85 and 1.71 respectively.

The hash implementation formats each digest byte as two lowercase hex digits. Empty-string and `abc` SHA-256 vectors passed. The existing duplicate/out-of-order event test confirmed equal `content_sha256` for reordered and duplicate input. The disconnected-source test confirmed the last-good content hash remains visible as stale, with one receipt.

### Commands and results

- `CARGO_TARGET_DIR=/tmp/isoscope-core-upgrade-qa-target cargo test -p isoscope-core --locked` — **PASS**: 3 unit tests and 22 workflow tests; 25 passed, 0 failed. Main and doc-test targets had 0 tests.
- `CARGO_TARGET_DIR=/tmp/isoscope-core-upgrade-qa-target cargo clippy -p isoscope-core --all-targets --locked -- -D warnings` — **PASS**, no warnings.
- `CARGO_TARGET_DIR=/tmp/isoscope-core-upgrade-qa-target-1_85 rustup run 1.85.1 cargo test -p isoscope-core --locked` — **PASS**, same 25 tests.
- `cargo metadata --format-version 1 --locked --no-deps` — **PASS**, confirmed exact direct requirements and `rust_version: 1.85`.
- `cargo tree -p isoscope-core --locked -d` — **PASS**, no duplicate dependency versions.
- `git diff --check 16b64cd^ 16b64cd` — **PASS**.

### Limits

This is core dependency QA, not product or release acceptance. I did not run the forge, scheduled collector, or native lane. Registry DNS was unavailable when I attempted `cargo search`, so I could not independently confirm that every entry in the note remains crates.io’s latest stable release; the note records its registry check, while this QA verified the pinned versions, lock consistency, declared floor, and core behavior. No files in the worktree were changed.