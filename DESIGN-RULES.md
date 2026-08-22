# Isoscope Design Rules

Doctrine for the routing/layout engine, drawn from three disciplines that solved
this problem before us: **PCB/EDA routing**, **orthogonal graph drawing theory**,
and **schematic/metro-map cartography**. Rules are numbered for reference from
code and QC output.

## Laws in force (implemented)

- **L1 — Component transit.** A trace may only pass under/through a component it
  connects to. (Footprint obstacle avoidance, entry stubs into walls.)
- **L2 — Planar crossing discipline.** Traces on the same plane must not cross or
  share a channel unless architecturally unavoidable. (Sequential shortest-first
  scoring: crossing=1, channel-share=4; double-jog candidates; 2 rip-up-reroute
  passes. QC: `window.__isoRouteQC`.)
- **L3 — Level honesty.** Cross-level connections descend/climb via an outside
  riser and enter the destination wall *at the destination's level* — true from
  every camera angle.

## Rule catalog (adopt as scale demands)

### From PCB / EDA practice

- **R10 Clearance & lane assignment.** Minimum spacing between parallel traces;
  when a corridor must be shared, assign each trace its own parallel lane offset
  (Altium-style clearance rules; channel routing). *Status: penalized, not yet
  lane-assigned.*
- **R11 Netclasses.** Edge classes (data/auth/planned/…) carry per-class rules —
  width, clearance, routing priority, color — declared in the spec, enforced by
  DRC. Mirrors EDA netclass constraint systems.
- **R12 Negotiated congestion (PathFinder).** At ~50+ edges, replace sequential
  greedy routing with iterative negotiation: route all edges, price overused
  channels up, rip up the worst offenders, converge. The standard modern
  autorouter core (used by e.g. OrthoRoute for KiCad).
- **R13 Escape routing.** High-degree modules (hubs) get an ordered fanout
  pattern — pins escape the hub's perimeter in assigned directions before
  general routing (BGA escape-routing analogy). Directly targets our PB-hub
  residual crossings.
- **R14 Riser (via) minimization.** Every level change costs; prefer routes that
  change levels once, near the destination. Vias are the PCB analogue.
- **R15 Keepouts.** Reserved regions no trace may enter (label zones, legend
  space, future annotation areas).
- **R16 Shove before rip-up.** Try nudging an existing trace's segment to an
  adjacent lane ("weak modification", Mighty router) before full rip-up.
- **R17 DRC as a product feature.** Every rule machine-checkable; every build
  emits a DRC report (violations, waivers, unavoidables). Observability of the
  drawing itself.

### From orthogonal graph drawing theory

- **R20 TSM pipeline.** Topology-Shape-Metrics (Tamassia): planarize (choose
  crossings) → orthogonalize (choose bends) → compact (choose coordinates). The
  principled architecture when auto-*placement* joins auto-routing.
- **R21 Kandinsky model.** Modules as boxes with multiple edge attachments per
  side on a finer grid — the formal answer to "six pipes into one building."
  Bend minimization here is NP-complete; use the known 2-approximations.
- **R22 Bend budget.** Bends cost readability; minimize per-edge bends after
  crossings (already weakly weighted; formalize per netclass).
- **R23 Sugiyama aesthetics for levels.** When auto-assigning strata: dominant
  flow direction, minimize edges spanning >1 level, order modules within a level
  by barycenter of neighbors to reduce riser crossings.

### From schematic & metro-map cartography

- **R30 Mental-map stability.** Rebuilding from an updated spec must not
  scramble the layout — persist/seed positions so diffs read as diffs (metro-map
  rule R1: preserve topology; force-directed variants exist with explicit
  mental-map preservation). Critical for observability over time.
- **R31 Junction grammar.** Adopt electrical convention: connected joins get an
  explicit junction dot; unavoidable crossings get *no* dot (optionally a hop
  arc) — crossing ≠ connection becomes visually unambiguous.
- **R32 Bus bundling.** At codebase scale, bundle same-class parallel edges into
  a bus trunk with breakouts (schematic bus notation; edge-bundling literature —
  trade clutter for overdraw, keep faithfulness at breakouts).
- **R33 Octilinear option.** 45° diagonals (Beck's Tube-map language) as an
  optional style for dense boards; ILP-exact or force-directed approximations
  exist.
- **R34 Label placement discipline.** Priority-based declutter (in force);
  formal label-placement optimization at scale.
- **R35 Signal-flow convention.** Prefer a dominant reading direction per spec
  (e.g., authority flows down, feedback flows up) and orient trace steps along it.

## Scale thresholds (anticipated)

| modules | posture |
|---|---|
| ≤ 30 (today) | current sequential router + L1–L3; hand-authored placement |
| 30–150 | R10 lanes, R11 netclasses, R12 PathFinder, R13 hub escape, R31 junction grammar, R30 stability seeds |
| 150+ | hierarchy: **drill-down sub-specs** (a module opens into its own board — "go inside"), R32 buses, R20/R21 auto-placement, LOD rendering |

## DRC checklist (grow `__isoRouteQC` into this)

crossings (count, waived) · channel-shares · clearance violations · bends over
budget · risers per edge · keepout intrusions · label suppressions · unroutable
edges · mental-map drift vs previous build.

## Sources

- Tamassia et al., TSM framework; Handbook of Graph Drawing (CRC 2013)
- Kandinsky model: Fößmeier & Kaufmann; NP-completeness Bläsius/Brückner/Rutter (arXiv:1405.2300)
- Sugiyama, Tagawa, Toda (IEEE SMC 1981); Healy, Hierarchical Drawing (GD Handbook)
- Mighty rip-up/reroute router (Shin & Sangiovanni-Vincentelli 1987); PathFinder negotiated congestion; OrthoRoute (KiCad, GPU)
- Altium routing rule types (netclass/clearance/diff-pair constraint model)
- Nöllenburg & Wolff, metro-map MIP (GD 2005); octilinear grid-graph maps; octilinear force-directed with mental-map preservation
- Edge bundling surveys (Lhuillier et al.); Edge-Path Bundling
