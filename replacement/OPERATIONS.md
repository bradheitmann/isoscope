# Operational refresh and local clients

Run from the isolated Isoscope replacement checkout:

```bash
cargo test -p isoscope-core
cargo clippy -p isoscope-core --all-targets -- -D warnings
cargo build --release -p isoscope-core
target/release/isoscope-core refresh
target/release/isoscope-core serve --port 4185
```

`replacement/leitting.json` configures the reusable repository adapter. A failed
request never publishes a partial graph. `replacement/state/current.json` is
atomic; raw captures are immutable under `replacement/state/receipts/`. A reader
marks data stale after 600 seconds even if no failed refresh was reported.
`refresh-status.json` records success/failure, actual executable/source hash,
host/PID, snapshot/raw hashes and retry backoff. The kernel-backed file lock
excludes overlapping refreshes. Failures back off exponentially up to 15 minutes;
a skipped backoff is reported explicitly and never counted as a refresh.

The API is loopback-only and read-only. Assets are served from
`replacement/web/dist`. `/api/snapshot`, `/api/graph`, `/api/events` and
`/api/refresh-status` expose the corresponding bounded local observations.
Responses carry ETag and gzip when requested. No credentials appear in data.
The adapter uses the existing authenticated `gh` process. That account's token
can have broader repository privileges; the adapter only issues queries/GETs.
A read-only GitHub App credential and webhook installation are a later stage,
not an established least-privilege deployment.

## Actual scheduler

The Codex automation **Isoscope GitHub workflow refresh**, ID
`isoscope-github-workflow-refresh`, is active every five minutes. It is a
**projectless local** job because the saved project list has no Isoscope entry.
The prompt binds the absolute isolated worktree and release collector command;
it preserves other automations and alerts only on failed runs. The scheduler
runs GPT-6.1 Sol at medium reasoning to invoke the deterministic collector.
That scheduler agent is separate overhead: the Rust collector makes no model
calls and never starts/probes local inference. Native product token/cost coverage
stays unknown until actual usage receipts are joined.

Keep `/Users/bradleyheitmann/open_protocols/isoscope-github-team-flow` available
while the automation is active. After merge/relocation, update the automation
through the purpose-built Codex tool to the new verified binary/config/state
paths before archiving this worktree. Do not edit its automation TOML by hand.

Configured cadence is not proof of execution. The operational acceptance record
must cite a completed scheduler chat and a matching later collector receipt.
Manual refreshes are separately identified. The initial real manual capture
completed at 2026-10-01T04:37:45Z (292 items, plan b78bff9); the second at
2026-10-01T04:44:52Z (292 items, plan f11a2c4).

## Graph and MCP

```bash
target/release/isoscope-core graph import examples/isoscope.spec.json
target/release/isoscope-core graph overview
target/release/isoscope-core graph export
target/release/isoscope-core graph blast-radius
target/release/isoscope-core graph build /tmp/isoscope-frozen --assets replacement/web/dist
target/release/isoscope-core mcp
```

`graph node` and `graph edge` take a JSON file. `graph mark`, `graph ingest`
(normalized findings), `graph sensor` and `graph delete` update only the local
architecture projection. Graph history receipts are immutable. The MCP command
is native stdio JSON-RPC and provides the nine local map tool names; it grants no
forge approval or GitHub mutation capability. Configure an absolute binary path
and working directory. Frozen web exports preserve source timestamps and remain
read-only; their staleness must be visible.

### Verified execution and immutable runtime binding

The first scheduler chat (`01a0f5c9-d7fb-7682-894c-b82e7c99871e`) completed a real
refresh at 2026-10-01T04:50:20.920660Z: 292 items, plan f11a2c4, raw receipt
`2cbede9bd2dfc2770f90db7351f68746c353fea6b88087345dcbfc4f445ad587`, executable
`715df65c28385b38c368577f12d069de1f084fcf7b8c1fc5426e8f34818cf7cf` from a9a3669,
host mac.lan/PID 48135. The completed scheduler turn and collector receipt agree.

A second run began before a release rebuild and completed afterward; its
source-commit field remained a9a3669 while its late-read on-disk executable hash
referred to the replacement 54ecdda binary. This receipt is retained, with an
explicit runtime binding limitation; it is **not** proof that 54ecdda executed.
To eliminate that replacement race, the automation was updated through the
Codex tool to the immutable, executable-only versioned file:

`replacement/runtime/isoscope-core-54ecdda92f5492606ec00ffecc87842c081889e6`

Its SHA-256 is
`c82b2d5afeb5e390a9c3f5d0e39fbe6bab2dd57d0b08258c3c7e740f8d688471`.
The saved prompt checks the hash before execution. This ignored runtime file is
preserved locally; subsequent builds do not overwrite it. Future source updates
require a new versioned filename/hash and purpose-built automation update.
The versioned executable completed an actual scheduled refresh at
2026-10-01T05:05:11.104233Z, verified by the scheduler's completed receipt and
`refresh-status.json`: source 54ecdda, the matching executable hash above,
host mac.lan/PID 68621, 292 items, plan f11a2c4. Raw source receipt:
`1f4dadc516a8a9d0217e3ffbf7f66180f5fe0fe4ef58597a5d67ab9ee5e0d6c9`;
snapshot content hash:
`50dde564b5f7706a093913b09bdf7891ba03ece23b37197dbc27b3846152734e`.
This proves corrected-release scheduled execution. The scheduler agent's model
overhead remains separate from the deterministic collector and is not included
in product token/cost coverage.
