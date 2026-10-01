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
