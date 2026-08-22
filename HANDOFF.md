# Isoscope — development handoff

**As of 2026-08-22 · repo at commit 818e493 · no remote yet · name "isoscope" is a working title**

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

## ODIN integration contract (consumer #1)
- ODIN owns `odin/product-research/architecture-map/odin.spec.json` (+README).
- Root `odin/ODIN-ARCHITECTURE-MAP.html` is a GENERATED artifact:
  `node ../../../isoscope/build.mjs odin.spec.json ../../ODIN-ARCHITECTURE-MAP.html`
- ODIN-side files are **uncommitted** in odin (its governance requires slices);
  legacy `ODIN-ARCHITECTURE-MAP-3D.html` retired 2026-08-22 (operator order;
  quarantined at /tmp/retired-ODIN-ARCHITECTURE-MAP-3D-20260822.html, evaporates on reboot).

## Near-term roadmap (operator-aligned)
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
