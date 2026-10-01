# Current direct Rust dependency audit

Verified against live crates.io registry API on 2026-10-01 UTC. Each release is
the registry's `max_stable_version`, non-yanked. Package links identify the exact
release; release date and declared Rust version come from registry metadata.
`cargo info sha2@0.11.0` and `base64@0.23.1` independently confirmed the changed
releases and MSRVs. Default `cargo info` inside a workspace can report the
already-resolved version; it was not used as latest-release authority.

| Core direct dependency | Previous lock | Current exact requirement/lock | Released UTC | Declared MSRV |
|---|---|---|---|---|
| [serde](https://crates.io/crates/serde/1.0.229) | 1.0.229 | 1.0.229 | 2026-07-18 | 1.56 |
| [serde_json](https://crates.io/crates/serde_json/1.0.151) | 1.0.151 | 1.0.151 | 2026-07-20 | 1.71 |
| [sha2](https://crates.io/crates/sha2/0.11.0) | 0.10.9 | 0.11.0 | 2026-03-25 | 1.85 |
| [chrono](https://crates.io/crates/chrono/0.4.45) | 0.4.45 | 0.4.45 | 2026-06-04 | 1.62 |
| [fs2](https://crates.io/crates/fs2/0.4.3) | 0.4.3 | 0.4.3 | 2018-01-06 | not declared |
| [base64](https://crates.io/crates/base64/0.23.1) | 0.22.1 | 0.23.1 | 2026-08-04 | 1.71 |
| [clap](https://crates.io/crates/clap/4.6.7) | 4.6.7 | 4.6.7 | 2026-09-14 | 1.85 |
| [tiny_http](https://crates.io/crates/tiny_http/0.12.0) | 0.12.0 | 0.12.0 | 2022-10-06 | not declared |
| [flate2](https://crates.io/crates/flate2/1.1.10) | 1.1.10 | 1.1.10 | 2026-08-28 | 1.67 |
| [tempfile](https://crates.io/crates/tempfile/3.27.0), test only | 3.27.0 | 3.27.0 | 2026-03-11 | 1.63 |

Core declares Rust 1.85 (edition 2024 and declared direct dependency floor).
Validation ran on installed rustc 1.98.1; the floor toolchain itself was not
tested. Unknown MSRV metadata does not establish compatibility on an older
toolchain. `cargo update` updated the SHA-2 digest graph to digest 0.11.3,
block-buffer 0.12.1, crypto-common 0.2.2, cpufeatures 0.3.1 and hybrid-array
0.4.15; the root lockfile records all exact transitive resolutions.

Compatibility: SHA-2's digest output no longer implements LowerHex; byte-wise
two-digit hexadecimal conversion preserves the canonical digest format. Known
empty/abc vectors pass. All 25 tests and strict clippy passed. Two real 292-item
replays after the upgrade produced the exact pre-upgrade content hash
`f1e36e88b2ba3b5d46c2dda8b3104576ed0c91dc90f91c9948d710af67ab88c6`.
Base64's existing Engine API compiled and the real pinned-plan capture replay
remained compatible. Independent upgraded-candidate review is pending.

## Native lane registry checks, pending integrated lock

| Dependency | Previous native candidate | Current registry stable | Released UTC | Declared MSRV |
|---|---|---|---|---|
| [dirs](https://crates.io/crates/dirs/7.0.0) | 6.0 | 7.0.0 | 2026-09-05 | not declared |
| [futures](https://crates.io/crates/futures/0.3.34) | 0.3 | 0.3.34 | 2026-08-11 | 1.71 |
| [ureq](https://crates.io/crates/ureq/3.4.2) | 3.4.2 | 3.4.2 | 2026-09-13 | 1.85 |
| [gpui-kit](https://crates.io/crates/gpui-kit/0.7.0) | gpui 0.2.2 | Kit 0.7.0 facade | 2026-09-28 | not declared |

Native also shares current serde_json. Its owner is replacing the direct old GPUI
dependency with the Kit facade's matched dependency graph. These are verified
registry releases, not a claim that the native candidate or integrated lock has
already passed. Leitting dependency pins were not modified. The accepted immutable
54ecdda collector remains scheduled until the upgrade receives independent
review and a new versioned executable/binding is published.
