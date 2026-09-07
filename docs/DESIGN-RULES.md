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
- **R10 — Clearance & lane assignment (in force 2026-09-07).** After joint
  shove, shared parallel runs receive deterministic, edge-key-ordered offsets
  spaced by 0.34 units, with orthogonal connectors and fixed R13 pins/stubs.
  A corridor change must clear unrelated modules, fully separate its members,
  reduce total sharing, and not increase weighted crossings. Unsafe sets retain
  their previous routes. QC reports `lanes_assigned` (runs displaced),
  `corridors_resolved` (groups fully separated), and `unresolved_shares`
  (remaining segment pairs, edge keys, and rejection reasons).
  All crossing metrics and R31 hops use the same final, trimmed geometry.
  Near-coincident offsets that yield less than the 0.30 hop diameter after
  shifting are rejected. Residual corridors require follow-up routing work;
  this pass does not guarantee zero shares.
  **Limitation:** "same-plane" is flat routing; the engine lifts levels
  afterwards, so flat QC cannot certify stacked-plane crossings.
- **R13 — Escape pins (in force 2026-09-02).** Modules with degree ≥ 3 fan
  their links out through assigned wall pins: each link end picks the wall
  facing its partner, pins on a shared wall are spread evenly and ordered by
  the partner's position, and every pin leaves the wall with a perpendicular
  stub. Same-side links no longer share a channel. Lower-degree modules keep
  centre attachment, so existing layouts do not move.
- **R16 — Joint shove (in force 2026-09-02).** After the rip-up passes, every
  surviving crossing pair is re-solved jointly: the top-14 candidates of both
  routes are tried together and the pair is accepted only when total weighted
  cost falls. Crossings neither route could fix alone vanish here.
- **R31 — Junction grammar (in force 2026-09-02).** A link *joins* its module
  with a dot at the wall (the pipe's own ink and lit state); a link *crosses*
  another with a hop arc on the constant-z segment, never a dot. Hop points
  come from the shared router, so the drawing and the DRC lint agree.
  Results at adoption (weighted crossings, before → after): self-map 2→1,
  ODIN 11→5, advisory codebase map 42→25, advisory topology lab 87→64.

## Rule catalog (adopt as scale demands)

### From PCB / EDA practice

- **R10 Clearance & lane assignment.** *In force — see Laws.* Conservative
  parallel lanes separate feasible shared corridors; unresolved pairs remain
  explicit in QC.
- **R11 Netclasses.** Edge classes (data/auth/planned/…) carry per-class rules —
  width, clearance, routing priority, color — declared in the spec, enforced by
  DRC. Mirrors EDA netclass constraint systems.
- **R12 Negotiated congestion (PathFinder).** At ~50+ edges, replace sequential
  greedy routing with iterative negotiation: route all edges, price overused
  channels up, rip up the worst offenders, converge. The standard modern
  autorouter core (used by e.g. OrthoRoute for KiCad).
- **R13 Escape routing.** *In force — see Laws.* High-degree modules (hubs) get
  an ordered fanout pattern — pins escape the hub's perimeter in assigned
  directions before general routing (BGA escape-routing analogy).
- **R14 Riser (via) minimization.** Every level change costs; prefer routes that
  change levels once, near the destination. Vias are the PCB analogue.
- **R15 Keepouts.** Reserved regions no trace may enter (label zones, legend
  space, future annotation areas).
- **R16 Shove before rip-up.** *In force as joint shove — see Laws.* Try
  nudging an existing trace's segment ("weak modification", Mighty router)
  before full rip-up; here realised as a pairwise joint re-solve.
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

- **R30 Mental-map stability.** *In force — phase 2.* `serve` rebuilds the
  graph scene in place on store changes, preserving the camera, stack, theme,
  weights, inspector and surviving circuit selections. Newly red modules take
  the camera into their blast radius; a target outside the updated bounds
  glides home. Shared WebGL resources survive; graph-owned resources are
  disposed before rebuilding. `?reload=1` and failed swaps retain the phase-1
  snapshot/reload fallback. Authored positions remain the layout authority.
- **R31 Junction grammar.** *In force — see Laws.* Electrical convention:
  connected joins get an explicit junction dot; unavoidable crossings get a hop
  arc and never a dot — crossing ≠ connection is visually unambiguous.
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
| 30–150 | R10 lanes, R11 netclasses, R12 PathFinder, R30 stability seeds (R13 escape pins + R31 junction grammar already in force) |
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
