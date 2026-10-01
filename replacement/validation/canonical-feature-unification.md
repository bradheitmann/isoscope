# JSON feature-unification correction

The actual GPUI Kit native dependency resolution enabled serde_json
`preserve_order`, `indexmap` and `raw_value` alongside the core's default JSON
features. Cargo feature unification made the previous canonical function retain
JSON key insertion order. A nested shuffled-key regression reproduced RED with:

```bash
cargo test -p isoscope-core --features serde_json/preserve_order canonical_hash_ignores_nested_json_key_insertion_order
```

The two equivalent objects serialized to different byte sequences. The fix
explicitly sorts all nested JSON objects before canonical serialization. Array
order and values remain intact; the regression asserts the exact canonical
output. Local graph history's before/record digests now use the same canonical
function, matching atomic receipt publication.

Validation: all 26 core tests pass with both default features and
`serde_json/preserve_order`; strict clippy under the native feature passes. A real
292-item capture replay with preserve_order enabled reproduces the exact earlier
standalone content hash
`f1e36e88b2ba3b5d46c2dda8b3104576ed0c91dc90f91c9948d710af67ab88c6`.
Independent bounded delta review passed at exact source
`eed65460e238c888c5874dd60346e7ca65049988`: 26 tests under each feature mode,
strict feature clippy, and independent array-order/raw-shape probes. See
[the archived reviewer summary](canonical-independent.md). The supplied report
path currently contains that summary only; the detailed command receipt is
pending archive verification. Its reviewer did not have the
historical real capture, so the real replay above remains implementer-run
evidence. This verdict accepts the canonical source delta, not the clients or
whole runtime product. The accepted immutable 16b64cd scheduled executable
remains unchanged; its standalone default-feature collector does not enable
the native JSON feature. Any later executable update requires a new immutable
source/hash binding and an actual scheduled execution receipt.
