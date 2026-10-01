# Bounded replacement performance observations

Backend source: `54ecdda92f5492606ec00ffecc87842c081889e6`, immutable executable
SHA-256 `c82b2d5afeb5e390a9c3f5d0e39fbe6bab2dd57d0b08258c3c7e740f8d688471`.
Host: mac.lan, macOS. Measurements collected 2026-10-01 UTC.

Real capture: 292 GitHub issues/PRs, pinned plan f11a2c4; raw receipt
`1f4dadc516a8a9d0217e3ffbf7f66180f5fe0fe4ef58597a5d67ab9ee5e0d6c9`,
7,115,208 bytes. A separate state directory beneath the ignored operational
state was used; the live published snapshot was not replaced by this replay.

```bash
/usr/bin/time -l replacement/runtime/isoscope-core-54ecdda92f5492606ec00ffecc87842c081889e6 replay replacement/state/receipts/1f4dadc516a8a9d0217e3ffbf7f66180f5fe0fe4ef58597a5d67ab9ee5e0d6c9.json --state replacement/state/performance-replay
```

First run: 0.10 seconds wall, 0.06 user, 0.01 system; maximum resident set
99,024,896 bytes. Second run (`time -p`): 0.09 seconds wall, 0.06 user,
0.01 system. Both produced snapshot content hash
`f1e36e88b2ba3b5d46c2dda8b3104576ed0c91dc90f91c9948d710af67ab88c6`.
Published JSON size: 3,538,129 bytes. These samples include parsing, reduction,
hashing, serialization and local atomic publication; they exclude GitHub network
capture, API transfer and client render/interaction latency. They are two local
observations, not a percentile distribution, scaling guarantee or comparison
against the legacy implementation. Rust alone does not establish improvement.

Web and native frame, interaction and adaptive-rendering acceptance measurements
are pending on their exact integrated candidates. Canvas callback time alone is
not a native frame latency measurement.
