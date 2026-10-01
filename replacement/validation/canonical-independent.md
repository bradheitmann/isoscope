**PASS — bounded scope.** The canonicalization regression passes under `serde_json/preserve_order`; array order and hash sensitivity, representative legacy raw-receipt deserialization, and strict Clippy also passed. The checkout had no captured replay fixture, so I could not reproduce the documented 292-item hash. Runtime and token evidence remain **UNKNOWN**.

The full verdict, including commit binding, diff paths and hashes, commands, exit codes, and test counts, is in [isoscope-core-eed6546-qa-verdict.md](/tmp/isoscope-core-eed6546-qa-verdict.md).

