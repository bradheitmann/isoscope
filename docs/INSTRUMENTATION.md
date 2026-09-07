# Seams → Sensors → Self-healing

The doctrine for isoscope's production graduation, and how it composes with the
rest of the portfolio. (Operator vision, 2026-08-22.)

## The idea

As a codebase grows, **natural seams emerge** — the boundaries where code wants
to be modular. Those seams are exactly where module-level **traces and
wide-event logs** belong. Isoscope's map makes seams *visible and named*
(modules, path ownership, links-with-carries) — so the agents maintaining the
map are also the agents best positioned to say:

> "A seam has stabilized between `billing` and `ledger`. Want me to install a
> trace boundary here — wide events on every crossing, tagged with this link's
> identity — so production failures land on this map pre-attributed?"

That is the **seam→sensor offer loop**: agents propose instrumentation at
module/module-group level as architecture crystallizes, early, while it's cheap.

## Why it pays off: the remediation ladder

With seams instrumented, a production failure arrives already attributed
(module + link + event context). The map opens in **blast-radius view** (built),
and an agent can walk the full ladder:

diagnose → build a plan → **judge the plan** → accept → implement → verify →
commit → monitor the result in prod/CI.

This ladder is not hypothetical in this portfolio — it is exactly the SCP
governance discipline (independent QA, holdouts, evidence gates, bounded
attempts) already operating in ODIN. The fix loop is *governed autonomy*, not
YOLO patching.

## The stack, assembled

| layer | owner | state (2026-08-22) |
|---|---|---|
| Map + attribution + blast radius + DRC | **isoscope** (this repo) | built |
| Findings ingestion (SARIF/normalized), CI marks | isoscope | built |
| Wide-event/trace instrumentation, policy-gated execution, trust | **lumbr** (`~/open_protocols/lumbr` — "the alert→investigate→fix loop, closed"; packages: instrumentation/execution/policy/trust/mcp) | active, pre-MVP, epic-9 wave 2 closed |
| Distributed telemetry doctrine | **edge-agentic** (`DISTRIBUTED-TELEMETRY.md`) + telemetry MCP tools | doctrine + tools exist |
| Governed multi-agent fix discipline | **ODIN / SCP** | shipping (0.6.0 in flight) |
| Wide-event logging research | operator's research projects | in process — fold findings here |

## Spec extension (implemented 2026-09-02 — `telemetry` table, spec key, tools)

```jsonc
"telemetry": {
  "BILLING": {                       // per-module sensor binding
    "trace_boundary": "installed",   // proposed | offered | installed | verified
    "event_stream": "lumbr://billing/*",
    "wide_event_keys": ["req_id","actor","outcome","latency_ms"],
    "installed_by": "agent",         // provenance of the instrumentation
    "verified_at": "2026-08-22"
  }
}
```
Links inherit sensors from their endpoints; a link's `carries` doc names what
the wide events should capture crossing it. Live mode later streams these
events into the trace-shaped status slots (the original design intent).

## Roadmap ordering

1. **Seam-offer protocol** — DONE 2026-09-02. MCP `iso_propose_sensor` /
   `iso_set_sensor`, CLI `sensor`, adapter language in DEEPSEEK.md. An offer is
   a YOUR-CALL item on the building (existing decision vocabulary) plus a
   telemetry row; install/verify/decline clears it. The inspector shows the
   sensor block; links list the sensors at their ends. **Change-log trigger
   implemented 2026-09-07:** `iso_overview` and `cli.ts overview <db>` report
   `sessions` and `stable_seams`. A session is a distinct UTC write date across
   the whole store, not an elapsed day. A node qualifies after 3 such sessions
   strictly later than its latest non-telemetry change, with at least 1 current
   incident edge and no telemetry row of any state. A self-loop counts once;
   reciprocal links count separately. Missing history never qualifies.
   `ISOSCOPE_STABLE_N` accepts a positive safe integer; unset/invalid/nonpositive
   values use 3. Telemetry-only activity elsewhere advances the session count;
   idle days do not. This is an offer heuristic about map churn, not evidence
   of runtime stability. Entries include `id`, `since_session`,
   `sessions_unchanged`, and `links`, ordered by unchanged sessions descending
   then id. Empty/whitespace rationale on a stable node generates a rationale
   citing those values; otherwise it returns `rationale-required` without
   writing. Installed/verified and previously declined outcomes take precedence.
   Every mutating call records net changes transactionally, once per node/kind;
   no-ops add no history. History is operational and stays out of spec exports.
2. **Lumbr bridge**: lumbr's instrumentation package emits → isoscope `mark`/
   status slots consume; lumbr's mcp-worker executes the remediation ladder
   against blast-radius scope from the map.
3. **Wide-event research fold-in**: operator's in-process research lands here as
   the event schema for `wide_event_keys` defaults.
4. **Verify-monitor closure**: post-fix, the map watches the same sensor that
   caught the failure — green only when production agrees.
