# Isoscope ⇄ lumbr — the bridge

lumbr closes the alert → investigate → fix loop; isoscope is the map the loop
runs on. Two directions, both already speak JSON, neither needs the other's
code. (Doctrine: `docs/INSTRUMENTATION.md`.)

## 1 · lumbr → isoscope: signals land on the map

lumbr's referee computes four signals (error-rate acceleration, tool-call
failure acceleration, token-velocity decline, output-length collapse). Any
agent or job that sees one push it to the map with the generic **signal**
provider — no lumbr-specific shape, so alertmanager or a cron can use the
same door:

```bash
curl -X POST $MAP_HOST/ci?provider=signal -H "authorization: Bearer $ISOSCOPE_TOKEN" \
  -H 'content-type: application/json' -d '{
  "source": "lumbr",
  "events": [{ "signal": "error_rate_acceleration", "service": "billing",
               "severity": "red", "message": "5xx rate ×4.2 over 10 min (p95 1.8s)",
               "url": "https://ui.honeycomb.io/…" }]
}'
# or from a runner:  bun cli.ts ci my.db signal.json --provider signal
```

Attribution: `job` = `signal` ?? `service`, resolved through the spec's
`ci.jobs` (globs allowed: `"error_rate_*": "API"`), then node id / short /
tag, then `ci.default`. `severity: "ok"` (or `ok: true`) **heals** the tag
`[lumbr:<signal>]` wherever it sits — the same signal going quiet turns the
building back. An event with a `path` attributes through `paths` first.

When a seam has a **sensor installed** (`telemetry.<ID>.event_stream`, e.g.
`lumbr://billing/*`), that stream name is the join key: lumbr events tagged
with it map to the module without any `ci.jobs` entry — put the stream name
in `ci.jobs` once and every signal on that stream lands on the right wall.

## 2 · isoscope → lumbr: the blast radius is the remediation scope

The map opens an incident already scoped: red modules + their 1-hop
neighbours. The same rule is exposed as data so lumbr's mcp-worker (or any
remediation agent) works exactly the scope the operator is looking at:

```bash
curl $MAP_HOST/blast-radius          # or: bun cli.ts blast-radius my.db
```
```jsonc
{ "reds": ["API"], "worst": "API", "scope": ["API","DB","AUTH"],
  "modules": [{ "id":"API", "red":true, "items":[{"c":"red","l":"[lumbr:error_rate_acceleration] …"}],
                "paths": ["services/api/"], "sensor": {"trace_boundary":"installed","event_stream":"lumbr://api/*"} }, …],
  "links": [{ "src":"API","dst":"DB","type":"data","health":null }, …],
  "allowedPaths": ["services/api/","db/","packages/auth/"] }
```

`allowedPaths` is the contract: a remediation plan that touches files outside
it is out of scope by construction — feed it to lumbr's policy blast-radius
evaluator as the file-scope input, and to the executor's preflight as a
keepout. `worst` is where the camera went; start there. `sensor` tells the
agent which stream to watch for the verify step (green only when production
agrees — INSTRUMENTATION.md, ladder rung 4).

## The ladder on the map

diagnose (`/blast-radius`) → plan (inside `allowedPaths`) → judge (lumbr
policy gate) → accept (YOUR-CALL item on the building, `iso_set_status`) →
implement → verify (`severity:"ok"` signal heals the wall) → commit
(post-commit hook repaints) → monitor (the sensor that caught it keeps
watching).

## Not yet

- lumbr does not push webhooks today; the agent running its tools posts the
  signal. A lumbr-side exporter that POSTs `/ci?provider=signal` on threshold
  crossings is the next lumbr slice (its repo, its governance).
- Stream-name auto-join (`event_stream` as an implicit `ci.jobs` key) is
  documented above as an explicit `ci.jobs` entry for now.
