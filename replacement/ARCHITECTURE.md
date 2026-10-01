# Isoscope replacement: team workflow first

The Rust replacement models **work between agents**. Planned work, dispatch,
claim, candidate delivery, independent QA, GUARD and merge are different events.
The future production projection models code, data and incidents. These domains
may share capture/storage, but task IDs are never replaced with trace IDs and a
build/check event never proves a worker is running.

## Delivered vertical slice

- `isoscope-core`: read-only GitHub adapter using `gh` credential custody,
  deterministic workflow projection, local graph operations, immutable JSON
  source receipts, atomic published snapshot, overlap lock, read-only loopback
  API and native stdio MCP graph adapter.
- Strict TypeScript and Three.js web client: replacement surface, not additions
  to the old template. GPU topology and accessible tabular evidence consume the
  same snapshot. Desert Pants source and asset hashes are pinned in the vendor
  provenance manifest. Theme IDs are enumerated from the authoritative manifest.
- Native GPUI desktop client: an independent native renderer consuming the shared
  Rust model and canonical theme data. It is not a webview running Three.js.

`GET /api/snapshot` is `isoscope.workflow/1`; `GET /api/graph` is the legacy
architecture graph interchange spec or null. Graph mutations are local map
operations, never issue/PR actions or forge acceptance. The frozen JSON contract
is `crates/isoscope-core/src/model.rs`. GitHub remains the authority for its
records. A dashboard stage is a projection and is not a GUARD verdict.

## Capture and reduction

Resolve the plan path to the default branch's **commit SHA**, then fetch the
exact blob. Paginate issues, PRs, comments, reviews, timeline events and check
runs. GraphQL pages are bounded to avoid resource-limit truncation; nested
connections continue through every `pageInfo` cursor. Comments/reviews/checks
validate declared counts. GitHub timeline `totalCount` is not a count of returned
nodes: observed PR #112 reported 11 while returning 15 at an exhausted cursor.
This source caveat is visible, and timeline coverage uses exhausted page cursors.

Every source lists endpoint, page count, actual record count and SHA-256. Capture
spans separate requests; GitHub supplies no cross-endpoint snapshot transaction.
Each PR binds the head observed in its capture, and the plan binds its resolved
commit. Coverage means those endpoints were exhausted, not that all sources were
observed at the same instant. A failed source aborts publication; the previous
snapshot retains its evidence and becomes visibly stale. No partial snapshot is
silently passed off as fresh. JSON uses sorted map keys and stable item ordering;
comment duplicates are idempotent and edits select their latest observed version.
Conflicting versions at an identical edit timestamp suppress acceptance claims.
Absent previous records are deletion/access uncertainty, not automatic closure.

The plan's `ready` state/forge ready label does not prove eligibility. Dependencies
must be done in the pinned plan and have a closed linked issue or merged linked
PR. A CLAIM is ownership evidence. No native runtime telemetry is present, so
running remains UNKNOWN. A PASS requires an explicit first-line verdict and
exact `Head reviewed:` binding; a later FAIL on that head takes precedence.
The snapshot reports the verdict and does not independently certify reviewer
qualification. Old-head or unbound PASS never advances a new head to GUARD.

Candidate age begins at the first captured non-draft state for that exact head.
It is explicitly an observed lower bound, not `updatedAt`, old PR creation time,
or a reconstructed historical readiness date. Stage service/wait metrics are
only emitted when timestamps actually observed support them. Ready-label-to-claim
is labelled as such and is not presented as PM dispatch-to-claim. PR creation to
merge is measured separately from end-to-end accepted-artifact latency.
Missing dispatch, GUARD start, amendment resolution, next-eligible dispatch,
service-time and token/cost data stay UNKNOWN. There are no fabricated model
performance rankings.

Structured Agent/Provider/Reasoning lines become **forge_reported** dimensions.
Owner reports remain **owner_observed** with an unknown timestamp when no source
instant was supplied. They do not become native observations. One Droid missions
seat can contain many internal agents; those workers are not counted as independent
external seats.

## Subsequent connection stages

1. Current: deterministic API reconciliation. This is operational without LLM
   interpretation and requires no inference server.
2. Private GitHub App: webhook events into the same provenance envelope, with API
   reconciliation for missed, deleted, edited, out-of-order and replayed events.
   Installation, permissions and webhook secrets have not been established.
3. Harness observations: actual session/execution state and usage receipts joined
   by task/session/agent identity. MCP offers bounded queries; ACP can be an optional
   session adapter, not the repository integration.
4. Lumbr correlation: preserve agent/session/task IDs and OTel span joins as an
   opportunity. No live Lumbr integration is claimed. Production graph/incident
   projection remains distinct from this team workflow projection.

## Migration inventory and limits

The legacy engine remains in the repository for existing consumers. It is not
expanded. Generic graph import/export, local node/edge/status mutations,
normalized finding path attribution, directed blast radius, instrumentation
state and immutable graph history have a Rust replacement. Native stdio MCP
exposes the nine local-map tool names. Frozen export carries current snapshot
and graph plus web assets and declares its source freshness.

Legacy GitLab/Buildkite/SARIF webhooks, SQLite import, collision-budget routing,
automatic stable-seam session heuristic, production live telemetry and installed
git hooks are not claimed as migrated enforcement. Rust graph lint explicitly
reports the routing-budget gap. Their semantics are inventory items for the
production projection; the immediate acceptance scope is the team workflow
product and native/web replacement clients. Legacy JS files need porting before
the old engine can be retired.
