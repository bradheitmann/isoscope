# Isoscope — development handoff

**As of 2026-09-02 · remote: github.com/bradheitmann/isoscope (private) · name "isoscope" is a working title**

## What this is
Schematic observability engine: a system rendered as an inspectable isometric
city, driven entirely by one JSON spec. Extracted 2026-08-22 from the ODIN
Sentinel architecture map (built iteratively with the operator, 2026-08-19..22).

## State (all verified in-browser, zero JS errors)
- `template.html` — full engine: orthographic Three.js city (flat-iso home →
  3D on manipulation, Reset restores pose incl. angles); etched hatch buildings
  (unlit, no base plates); whole-building state color (any red item ⇒ red);
  fat-line solid pipes (Line2; no dashes; planned=faint, broken=red/never
  flows); flow = dots on lit lines only, OFF at load ("Flow"/"Unflow" plain
  toggle); circuit-breaker interaction (click=energize, both-ends-live links
  glow+flow, ground restores); 3-level Stack mode with outside-riser+entry-stub
  pipes; trace narration; single sectioned inspector (identity→STATE→EVIDENCE;
  overview = intro + system state); priority label declutter (0 overlaps in all
  QC states); settings drawer: 18 IDE themes + Random, dot presets
  (Fine/Medium/Bold), line weights (Hairline/Regular/Heavy, scales dots),
  label/body font pickers (cascade to full chrome).
- **Router laws** (see `DESIGN-RULES.md`): L1 no transit under unconnected
  modules; L2 same-plane crossings only when unavoidable (shortest-first scored
  routing, double-jog candidates, 2 rip-up passes; ODIN spec 23→10 weighted;
  residue = PB hub, genuinely forced); L3 cross-level pipes riser-outside +
  stub-in at destination level. QC: `window.__isoRouteQC`.
- `build.mjs` — spec→self-contained HTML (file://-safe, GENERATED banner).
- `SPEC.md` — schema. `DESIGN-RULES.md` — doctrine + scale roadmap + sources.
- `examples/odin.spec.json` — reference spec (16 modules / 18 links).

## 2026-09-02 — lumbr bridge, isoscope side
- `normalizeCi("signal", …)`: provider-agnostic telemetry push —
  `{source?, events:[{signal|service|job, severity red|amber|ok | ok:bool,
  message, url?, path?}]}`; amber marks amber (CiEvent.mark), ok heals the
  `[source:job]` tag. `blastRadius(db)`: same rule as the engine (reds +
  1-hop), returns reds/worst/scope/modules(items, paths, sensor)/links/
  `allowedPaths`. `GET /blast-radius` on serve, `cli.ts blast-radius <db>`.
  Verified: signal red+amber → SV red / MC amber; scope SV,DB,CO with
  allowedPaths; ok-signal heals → scope empty; both endpoints over HTTP.
- Self-portrait `ci.jobs` maps `error_rate_*`→SV, `token_velocity_*`→MC as
  the worked example.

## 2026-09-02 — CI adapters · R30 phase 1 · lumbr consumer
- **CI provider adapters** (`lib.ts normalizeCi/applyCi/detectCiProvider`):
  GitHub `workflow_run` / `workflow_job` (failing step named) / `check_run` /
  PR review comments (Greptile, CodeRabbit … → path-attributed, red if the body
  says critical/vulnerab/bug…) / `pull_request_review`; GitLab `pipeline`
  (per build) + `build`/`job`; Buildkite `job.finished` + `build.finished`.
  Spec key `ci {jobs:{name|glob*:id}, default}` round-trips via meta. Mapping
  order: exact job → glob/prefix → node id/short/tag → `ci.default` → orphan;
  path-bearing events attribute through node_paths first. One live item per
  job (tag `[source:job]`), moved wherever the job now fails; a passing job
  deletes its tag everywhere = the building heals. `cli.ts ci <db> <payload>
  --provider p [--dry]`; `POST /ci` on serve (provider from header or
  `?provider=`, ISOSCOPE_TOKEN Bearer). Verified with fixtures in
  /tmp/ci-fixtures (all providers, unknown job → default, heal, 401/400).
- **R30 phase 1 — stateful reload**: live client snapshots
  `window.__isoViewState()` (theme, dot/line weights, stacked, pinned, camera,
  red ids) to sessionStorage before `location.reload()`; module end restores
  it. A red module that was not red before wins: the blast-radius flight
  stands and the saved camera is ignored. Theme now persists in localStorage
  across sessions too. Verified: headless reload restored nord + heavy + stack
  + Graph-store inspector + camera, 0 JS errors. NOTE: the restore block MUST
  stay at the very end of the module (it once landed inside the intro-dismiss
  handler and silently never ran).
- **lumbr = consumer #2** (`examples/lumbr.spec.json`): 10 modules (7
  packages + backends, targets, planning) / 12 links from real imports
  (mcp-server→execution/policy/schema/trust, policy→execution = PolicyGate
  inversion, trust→execution, worker→server; SDK→schema is `intended`:
  conformance, no import). Open items are the repo's real state (uncommitted
  audit.ts/index.ts/evaluation-store.ts, 6 hook scripts, 4 story-review
  candidates). DRC 0 crossings, budget 0. `bun run build:lumbr`.
- `scripts/shot.ts` gained `SHOT_WAIT` (ms) for JS that reloads the page.

## 2026-09-02 — seams → sensors: the offer loop is live
- `db/schema.sql` `telemetry` table (one binding per module: trace_boundary
  proposed|offered|installed|verified|declined, event_stream, wide_event_keys
  JSON, installed_by, offered_at, verified_at, rationale). Spec key
  `telemetry` round-trips (lib.ts import/export; SPEC.md row).
- `lib.ts` `proposeSensor()` / `setSensor()` — shared by MCP and CLI. An offer
  = telemetry row (offered, dated) + a YOUR-CALL status item prefixed
  "Sensor offered — " on the building (existing decision vocabulary: slate
  base, listed worst-first in the overview). install/verify/decline removes
  the item. Re-proposing an installed sensor returns already-installed; a
  declined one returns declined-earlier unless force:true.
- `mcp.ts` tools 8+9: `iso_propose_sensor {id,rationale,event_stream?,
  wide_event_keys?,force?}` · `iso_set_sensor {id,trace_boundary,…}`.
  `cli.ts sensor <db> <id> --offer "why" | --state s [--stream] [--keys a,b]
  [--by who] [--force]` for non-MCP harnesses; DEEPSEEK.md carries the
  offer-never-install-unasked language. Tool count mentions → nine.
- `template.html`: `sensorBlock()` in the module inspector (pass-styled for
  installed/verified, caution for proposed/offered, quiet for declined; stream,
  keys, rationale, provenance line); link inspector lists "Sensors at the
  ends" (links inherit sensors from endpoints, per INSTRUMENTATION.md).
- Dogfood: self-portrait carries a live offer on SV (Live serve) — the
  store→browser seam — so the primary example shows the loop.
- Verified: import→export telemetry equality; MCP stdio: tools/list = 9,
  propose→installed→already-installed; CLI decline→declined-earlier; DRC
  PASS; build + inspector screenshot, 0 JS errors.

## 2026-09-02 — routing laws R13 / R16 / R31 landed
- `router.mjs` (single source, unchanged contract + new outputs): R13 escape
  pins for degree≥3 modules (per-wall even spacing, perpendicular stub, a
  backtrack penalty keeps routes from doubling back under their own module);
  R16 joint-shove pass over surviving crossing pairs (top-14 × top-14 joint
  re-solve, 2 rounds); R31 hop extraction — returns `hops:{key:[[x,z]]}` and
  `qc.{crossings,shares,hops,hubs}` beside the old `weighted/offenders`.
- `template.html`: `insertHops()` splices a 7-point arc (r 0.15, h 0.13) into
  the carrying pipe at each hop — flow dots ride over it for free; junction
  discs (flat cylinders, r 0.075 × line-weight) at both wall entries of every
  pipe, colour+opacity copied from the pipe's material each frame so ghosted
  pipes have ghosted joins; legend rows "Dot at the wall" / "Arc over a line".
  `window.odinView.look()/restore()` test hooks (module scope is closed).
- `drc.ts` prints crossings-as-hops, shares, hubs. Budgets ratcheted in both
  example specs (self 2→1, ODIN 11→5) — the lint now fails if a change
  regresses to the old numbers.
- `scripts/shot.ts` — one-line headless screenshot of any built map with an
  optional JS expression (uses the hooks above); fails on JS errors.
- Verified: DRC PASS both examples; contrast proof 18/18 + 0 JS errors on the
  new build; hop arcs and wall dots eyeballed on self-map and ODIN.

## 2026-09-02 — landing the Sep 1 advisory session
- **Theme store relocation** (template.html): the 18 IDE palettes moved from a
  static `<style id="ide-themes">` block into a runtime `IDE_THEMES` map;
  `setTheme()` applies them as inline custom properties on `<html>`, canon
  variants still switch via `data-style`. `data-style` now names the active
  theme in BOTH cases (regression fixed: drawer highlight + Random broke for
  IDE themes). Transform scripts kept for provenance:
  `scripts/relocate-ide-themes.ts` → `/tmp/ide-themes.json` →
  `scripts/apply-theme-relocation.ts` (idempotent, no hand-typed values).
- **Responsive hardening** (template.html): topbar wraps ≤1280px, sidebar/panel
  hide ≤360px tall, 44px touch targets on coarse pointers, z-index tokens.
- **Render proof**: `bun scripts/render-proof.ts` = headless Chrome over CDP
  (Bun WebSocket, zero deps), 3 artifacts × 6 viewports, asserts no
  h-overflow / canvas sized / intro dismissible / focus ring, screenshots to
  `advisory/*/screens/` (gitignored). `scripts/overflow-diagnose.ts` lists
  offending elements at one viewport. Both expect the advisory server on :4180
  (`bun advisory/2026-09-01-odin/serve.ts`).
- **advisory/2026-09-01-odin/**: ODIN advisory deliverable — two specs
  (visual-a = ODIN codebase map, visual-b = topology lab), their built maps,
  and an OKOA-token landing page (`scripts/build-landing.ts`, expects
  `/tmp/okoa-tokens.css` from `okoa_emit_stylesheet`). Committed as the
  candidate "second consumer" material; `.db` + screens are gitignored.
- **OKOA design MCP**: `.mcp.json` registers the hosted server via mcp-remote;
  `okoa.ts` is a one-shot CLI for the same tools (`bun okoa.ts okoa_status`).
- **Self-portrait refreshed** (dogfood rule): new `DR` node (DRC lint + render
  proof, edge TP→DR auth = shared router source), paths now cover drc.ts,
  scripts/, okoa.ts, dsh-plugin/, advisory/, all docs. DRC: 2/2 weighted, PASS.
- **SPEC.md** gained the `paths` and `drcBudget` rows the code already read.
- **dsh-plugin/** is untracked on purpose: a package.json stub whose `main`
  does not exist. `adapters/DSH.md` already gets isoscope into dsh via its MCP
  client, so this native-plugin route may be redundant — operator: keep or rm.
- Verified this session: `import`+`build` of the self-map and `drc` on both
  examples pass from the working tree; contrast proof = zero JS errors across
  boot + 18 theme switches (headless Chrome).

## ODIN integration contract (consumer #1)
- ODIN owns `odin/product-research/architecture-map/odin.spec.json` (+README).
- Root `odin/ODIN-ARCHITECTURE-MAP.html` is a GENERATED artifact:
  `node ../../../isoscope/build.mjs odin.spec.json ../../ODIN-ARCHITECTURE-MAP.html`
- ODIN-side files are **uncommitted** in odin (its governance requires slices);
  legacy `ODIN-ARCHITECTURE-MAP-3D.html` retired 2026-08-22 (operator order;
  quarantined at /tmp/retired-ODIN-ARCHITECTURE-MAP-3D-20260822.html, evaporates on reboot).

## STRATEGY & DIRECTION — crash-proof snapshot (2026-08-22, operator-ratified)

**Mission (verbatim, README headline):** so a person always knows what their
codebase does, how it is architected, and if something is broken and what they
need to work on next.
**Lifecycle thesis:** understandability layer while building → graduates to
observability visualization layer in production. Same map/store; writers change
(humans+agents → pipelines+telemetry).
**Product shape:** zero-dep Bun/TS; SQLite graph store is the living source;
spec.json is interchange; one self-contained HTML is the artifact; serve = the
day-one live browser tab; MCP + CLI + adapters are how agents keep it true;
DRC lint enforces routing law; ingest + mark + blast-radius = the incident loop.
**Dogfood rule:** examples/isoscope.spec.json (self-portrait) is the primary
example and must stay current with the repo.

**Priority order (next work, in sequence):**
1. ~~`gh repo create`~~ DONE 2026-09-02 as a PRIVATE repo (bradheitmann/isoscope). Name still a working title; flipping to public is the operator's call.
2. ~~Dark-theme font contrast audit/fix~~ DONE 2026-09-02 (see KNOWN BUGS).
3. ~~R31 junction grammar~~ DONE 2026-09-02 (wall dots + hop arcs; router emits hops).
4. ~~R13 hub-escape + R16 shove~~ DONE 2026-09-02 (ODIN 11→5, budgets ratcheted: self 1, ODIN 5).
5. ~~`iso_propose_sensor` MCP tool~~ DONE 2026-09-02 (+ `iso_set_sensor`, CLI
   `sensor`, `telemetry` table/spec key, inspector sensor block). Open: the
   "N sessions unchanged" trigger needs a change log the store does not keep.
6. Lumbr bridge — ISOSCOPE SIDE DONE 2026-09-02 (`adapters/LUMBR.md`: generic
   `signal` provider in + `GET /blast-radius` / `cli.ts blast-radius` out with
   `allowedPaths` as the remediation scope contract). Lumbr side (an exporter
   that POSTs on threshold crossings) is a lumbr slice, its governance.
7. ~~CI provider adapters~~ DONE 2026-09-02 (`cli.ts ci` + `POST /ci`;
   GitHub Actions / GitLab / Buildkite; review bots via PR review comments).
8. R30 — PHASE 1 DONE 2026-09-02 (stateful reload: view survives). Phase 2 =
   in-place hot-swap without reload (engine refactor: rebuild from a new spec).
9. ~~Second real consumer spec~~ DONE 2026-09-02 — `examples/lumbr.spec.json`
   (10 modules / 12 links, DRC 0, authored from the repo's package graph).
10. R12 PathFinder negotiation when consumer specs exceed ~50 edges — not
    started, by design: largest spec today is 28 links (advisory topology lab).

**Still open after 2026-09-02:** R30 phase 2 (in-place hot-swap) · R10 lane
assignment (topology-lab spec still has 6 shared channels) · `dsh-plugin/`
keep-or-remove (untracked stub) · sensor-offer trigger needs a change log ·
lumbr-side exporter · going public is the operator's call.

**KNOWN BUGS:**
- ~~Dark themes: insufficient font contrast~~ FIXED 2026-09-02. Measured cause:
  7 IDE dark palettes ship fg3/metric-label at 2.3–4.1:1; 3 IDE light palettes
  (latte, solarized-light, dawn) at 2.5–2.8:1; the abbreviated canon `-dark`
  CSS variants define only surfaces+fg and inherit LIGHT-tuned signal /
  metric-label / callout-surface tokens from :root (signal-risk 1.9:1, fg1 on
  callout surface 1.0:1). Fix = runtime **contrast floor** in template.html
  (`enforceContrast()`, runs before every computePalette): lifts any failing
  token toward the theme's fg1 until ≥4.5:1 (+0.06 hex-rounding margin),
  derives `--iso-ink-muted` / `--iso-ink-dim` (3.0 floor, label id tier) /
  `--iso-hint-keys` from the old color-mix recipes with the same guarantee,
  and re-tints callout surfaces at ≤16% signal while fg1 stays legible.
  PROOF: `bun run proof:contrast` (scripts/contrast-proof.ts) clicks all 18
  drawer themes in headless Chrome, measures 16–18 real computed pairs each →
  18/18 PASS, 0 JS errors. Before the fix: 11/18 failed.
  Note: the canon `*-dark` CSS variants are NOT in the drawer's THEMES list
  (only shibuya-light, stillness + 16 IDE palettes are selectable).
- Lumbr repo has 3 uncommitted modified files (execution/audit.ts,
  execution/index.ts, policy/evaluation-store.ts) — land or classify (not
  isoscope's repo, tracked here so it isn't lost).

## Near-term roadmap (operator-aligned)
0d. DONE 2026-08-22 (review ingestion + blast radius): node_paths table + spec
   `paths` key (modules own path prefixes; longest match wins) · `cli.ts ingest`
   (normalized findings JSON or --sarif; Greptile/CodeRabbit → jq → ingest;
   orphans reported) · BLAST-RADIUS AUTO-SCOPE in engine: any red item on load →
   red modules + 1-hop neighbors circuit-energized, camera flies to worst,
   panel = incident readout (verified: coderabbit error on lib.ts opened the map
   scoped to Store+Spec+MCP+CLI+Serve with the finding on top). Provider webhook
   adapters = roadmap.
0c. DONE 2026-08-22 (DRC + CI loop): router.mjs = SINGLE SOURCE (injected into
   template at build via /*__ISOSCOPE_ROUTER__*/ slot; imported by drc.ts) —
   never two router implementations. drc.ts = collision LINT (weighted crossings
   vs spec drcBudget.maxWeightedCrossings; exit 1 over budget; offender list).
   Self-map layout re-placed via lint iteration 5→2 (budget 2 acknowledged);
   ODIN budget 11 acknowledged (R13/R16 will reduce). CI loop: `cli.ts mark` +
   `POST /mark` on serve (ISOSCOPE_TOKEN Bearer optional) + `install-hook`
   (post-commit) — VERIFIED: POST simulating pipeline failure → SSE fired →
   building rendered RED. Operator lifecycle thesis (README): understandability
   layer while building → graduates to observability layer in production.
0b. DONE 2026-08-22 (productization): Bun+TS, ZERO deps — lib.ts (SQLite graph
   store ⇄ spec, bun:sqlite) · cli.ts (init/import/export/build/serve; serve =
   Bun.serve + fs.watch + SSE, template live client reloads on store change —
   THE LOOP: agent writes store → browser repaints) · mcp.ts (hand-rolled stdio
   JSON-RPC, 7 tools) · adapters/DEEPSEEK.md (non-MCP contract) · db/schema.sql
   (edges-as-entities: docs+health ON the edge row) · examples/isoscope.spec.json
   (self-portrait, PRIMARY example) · README leads with operator mission verbatim.
   Round-trip + SSE + browser all verified. Bun local = 1.3.9.
0. DONE 2026-08-22: LINKS ARE ENTITIES — edges clickable/hoverable (Line2 raycast,
   ray.camera required), edge inspector (LINK · type · health / title / What flows
   here / loop narration / health notes / refs), spec key `edgeDocs`
   {"A-B":{title,carries,refs}}; ODIN spec carries all 18 descriptions; QC hook
   window.__isoEdgeMid(key) returns screen coords for testing.
1. R31 junction grammar (dot=connected; bare/hop=crossing) — cheap, high value.
2. R10 lane assignment in shared corridors; R13 hub escape routing (kills the
   PB residue); R16 shove-before-rip-up.
3. R30 mental-map stability (seed layout from previous build) — critical before
   telemetry-driven rebuilds.
4. Second example spec (prove generality); name decision; `gh repo create`.
5. R12 PathFinder negotiation when consumer specs exceed ~50 edges.
6. Telemetry adapter: stream live events into the trace-shaped status slots.

## 2026-09-07 · S1 R10 conservative lanes (QA PASS · 6c13e6e)

`router.mjs` assigns corridor lanes after joint shove, retains R13 pins/stubs,
checks obstacle clearance and non-increasing weighted cost, and derives all QC
and hop points from final trimmed routes. `drc.ts` exposes displaced runs,
resolved corridors, and every residual share pair with its reason.
Example weighted baselines remain 1/5/0. Advisory codebase remains weighted 25
with 3 shares; topology lab falls from 64 to 55 and from 6 to 3 shares, with
4 displaced runs across 2 resolved corridors. Amendment 1 accepts these
conservative residuals: obstacle-clearance detours are queued as S1b, outside
S1; weighted-cost rejections remain explicit. Flat QC does not certify
stacked-plane crossings. S1 remains uncommitted pending independent QA and
B/TEAM-PM authorization; this entry does not close R10 or the session.

## 2026-09-07 · S2 change log and stable seams (QA PASS · 3e13459)

Store mutations now append net per-node/per-kind history in the same transaction,
including cross-node CI heals and ingest replacement clears. Nested helpers share
one timestamp; imports preserve history and new nodes emit only `created`.
MCP/CLI overview exposes store-global distinct write sessions and stable seams;
eligible sensor offers can generate their rationale from that evidence.
`markNode()` unifies CLI, MCP status, and HTTP mark history. Export preserves
authored path order explicitly, so the self-spec round trip keeps array order.
Fresh schemas cascade traced-edge deletion. Existing databases retain their old
foreign-key constraint: importing into the same database does NOT upgrade it.
To obtain the new constraint, create a fresh store and re-import the spec; retain
the old store because operational history is not exported or migrated by that
procedure. S2 performs no automatic existing-store migration. Validation and
independent QA govern acceptance; no commit/push is authorized before the relay.

## Operator taste rules (hard-won — do not relearn)
Animations AND 3D controls together, never one at the expense of the other; no
camera-facing sprites on paths (they don't bend at corners); one visual
vocabulary per element (no static+moving duplication); toggles are colored only
when ON; no hidden modes (tabs died for this); motion only where attention
belongs (nothing ghosted may move); labels quiet, mono, darken-on-hover,
word-capped; grids visible but subtle; whole-building color+shade for state.

## 2026-09-07 — R30 phase 2: live scene hot-swap

`serve` now fetches `/spec.json` on SSE updates and rebuilds the graph scene
in place. `buildScene`, `disposeScene` and `applySpec` preserve collection
identities, camera/controls, shared WebGL resources, theme, weights, Stack,
and valid inspector/circuit/trace selections. New red modules win the camera;
a preserved target outside the new bounds glides home. Healing clears an
incident circuit without moving the camera. Per-node and per-edge GPU
resources are disposed, including hatch textures and junction materials;
shared junction geometry and dot materials survive.

The live client serializes applications, drops superseded fetches and keeps
the latest pending spec. `?reload=1` or a failed apply uses the existing
snapshot/reload path; `restoreView` remains boot-only. The unconditional
fonts-ready hook remains, with its dead `roofTexture` branch removed.

Run `bun scripts/swap-proof.ts <evidence-directory>` for the live CLI/MCP
C1–C7 numerical proof, contrast/DRC checks and a live CDP PNG. `--headed`
opens the proof browser for an independent observer. Results are DEV evidence;
independent QA and the headed C1/C3 observation remain acceptance gates.
