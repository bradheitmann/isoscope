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

## 2026-09-02 — landing the Sep 1 advisory session (this commit)
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
3. R31 junction grammar — crossing ≠ connection glyphs (dot = joined).
4. R13 hub-escape routing (targets ODIN's 11 acknowledged crossings) + R16 shove.
5. `iso_propose_sensor` MCP tool — first rung of docs/INSTRUMENTATION.md
   (seam→sensor offer loop; telemetry spec key design is in that doc).
6. Lumbr bridge (lumbr instrumentation → mark/status; lumbr mcp-worker executes
   remediation ladder against blast-radius scope).
7. CI provider adapters (Actions/GitLab/Buildkite auto-attribution) +
   Greptile/CodeRabbit webhook transforms.
8. R30 mental-map-stable hot-swap for serve (replaces reload).
9. Second real consumer spec (proves generality).
10. R12 PathFinder negotiation when consumer specs exceed ~50 edges.

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

## Operator taste rules (hard-won — do not relearn)
Animations AND 3D controls together, never one at the expense of the other; no
camera-facing sprites on paths (they don't bend at corners); one visual
vocabulary per element (no static+moving duplication); toggles are colored only
when ON; no hidden modes (tabs died for this); motion only where attention
belongs (nothing ghosted may move); labels quiet, mono, darken-on-hover,
word-capped; grids visible but subtle; whole-building color+shade for state.
