# Isoscope

The replacement product follows team work between agents: dependency eligibility,
claims, candidate delivery, QA, GUARD and merge, with source evidence and visible
freshness. Its deterministic Rust collector reconciles GitHub and a plan pinned
to a resolved commit. Native GPUI and strict TypeScript/Three.js clients are being
integrated around the same data contract and canonical Desert Pants themes.

```bash
cargo build --release -p isoscope-core
target/release/isoscope-core refresh --config replacement/leitting.json
target/release/isoscope-core serve --assets replacement/web/dist --port 4185
```

The initial read-only repository configuration is `bradheitmann/leitting`.
Refresh uses existing `gh` authentication; it never comments, merges or changes
forge records. A configured five-minute Codex cron has completed real refreshes;
the Rust collector makes no model calls. Missing native runtime and usage data
remain UNKNOWN. A reported CLAIM does not prove execution, and a ready label
does not prove dependency eligibility.

See [replacement architecture](replacement/ARCHITECTURE.md),
[operations and scheduled execution evidence](replacement/OPERATIONS.md), and
[independent backend delta review](replacement/validation/backend-independent-delta.md).
The [current dependency upgrade review](replacement/validation/core-upgrade-independent.md)
also verifies the locked core on Rust 1.85.1.
The legacy implementation below remains available for existing consumers. Its
roadmap statements are not guarantees of the replacement; the architecture note
records migrated behavior and remaining gaps.

## Legacy implementation

**So you always know what your codebase does, how it is architected, and if
something is broken and what you need to work on next.**

Isoscope renders a system as an inspectable isometric city: modules are
buildings, connections are pipes that know *what flows* through them, and
status is painted on the architecture itself. Open the map in a browser on day
one of a project; as the codebase grows, your agents mirror every module,
link, and blocker into a graph store — and the map repaints live with every
change. The map never trails reality.

**The lifecycle**: use it as an *understandability layer* while you build and
develop — then graduate it to an *observability visualization layer* as you roll
into production. Same map, same store; only the writers change (you and your
agents first, then your pipelines and telemetry).

Zero dependencies. TypeScript on [Bun](https://bun.sh) (`bun:sqlite` built in).
Ships as one self-contained HTML file that works from disk.

## Quickstart

```bash
bun cli.ts import examples/isoscope.spec.json my.db   # seed a graph store
bun cli.ts serve my.db                                # live map at :4177
bun cli.ts build my.db out/map.html                   # shippable artifact
```

The primary example is isoscope describing itself (`examples/isoscope.spec.json`);
`examples/odin.spec.json` is the first real consumer (ODIN Sentinel, 16 modules) and
`examples/lumbr.spec.json` the second (lumbr, 7 packages — read layer, referee, write layer).

## The loop

1. **Day one**: seed a store with a handful of modules; open `serve` in a tab.
2. **While building**: agents maintain the map — via the **MCP server**
   (`mcp.ts`, 9 tools, works in Claude Code/Codex/any MCP harness) or via the
   **CLI contract** for non-MCP harnesses (`adapters/DEEPSEEK.md`).
3. **Every commit**: install the shipped hook —
   ```bash
   bun cli.ts install-hook /path/to/your/repo /path/to/my.db
   ```
   (any store write rebuilds the live scene in place via SSE, without reloading;
   camera, stack, theme, inspector and circuit survive — a *new* red module
   still takes the camera).
3b. **When CI breaks, the map turns red where it broke** — point the provider's
   webhook at `serve` and it attributes the job itself:
   ```bash
   # GitHub Actions · GitLab · Buildkite: webhook URL = $MAP_HOST/ci
   # (provider read from X-GitHub-Event / X-Gitlab-Event / X-Buildkite-Event, or ?provider=)
   # failing job → red on its module · passing job → the building heals
   # review bots (Greptile, CodeRabbit) arrive as PR review comments → attributed by file path
   bun cli.ts ci my.db payload.json --provider github     # same thing from a runner
   ```
   Job → module mapping lives in the spec (`ci.jobs`, `ci.default`; falls back to
   node id / short / tag). Hand-marking still works:
   ```bash
   curl -X POST $MAP_HOST/mark -H 'content-type: application/json' \
     -d '{"id":"API","state":"attn","items":[{"c":"red","l":"CI: tests failing on main (#123)"}]}'
   bun cli.ts mark my.db API --red "CI: tests failing on main (#123)"
   ```
   Optional `ISOSCOPE_TOKEN` env guards both endpoints (Bearer auth).
3c. **Keep the wiring lawful**: the collision lint fails your build when routes
   cross beyond the acknowledged budget —
   ```bash
   bun drc.ts my-spec.json        # or point it at the .db
   ```
   Budget lives in the spec (`drcBudget.maxWeightedCrossings`) — the L2 law's
   own "unless the architecture forces it" clause, made machine-checkable.
4. **Every release**: `build` emits the artifact to ship with your docs.

## Controls

| gesture | trackpad | mouse | touch |
|---|---|---|---|
| **Orbit** (rotate) | one-finger click + drag | left-drag | one finger |
| **Pan** (reposition) | **two-finger click + drag** | right-drag | two-finger drag |
| **Zoom** (magnify) | two-finger scroll / pinch | wheel | pinch |
| Inspect / circuit | click a building (again = cut) · click a pipe = what flows · empty ground = restore · **R** = home |||

The camera is orthographic: nothing shrinks with distance — the city opens flat-isometric,
goes 3D the moment you grab it, and **R** glides back to the flat start. Home view and
scale auto-fit whatever spec is loaded.

## What the map gives you

- **What it does** — click any building: identity, state, evidence, in one column.
- **How it's architected** — orbit freely (orthographic: flat-iso at rest, 3D
  in motion); press **Stack** for semantic levels; links are entities — click a
  pipe to read what data flows over it. Wiring follows schematic grammar: a dot
  where a pipe joins a wall, an arc where it merely crosses another.
- **What's broken, what's next** — status classes (`red` blocker / `amber`
  queued / `you` decision) paint whole buildings; the overview panel lists every
  open item worst-first; circuit mode isolates any subsystem's live flow.

## Presentation layer

To explain a system or a decision to the operator with a static map, follow the agent skill in [skills/isoscope/SKILL.md](skills/isoscope/SKILL.md) and its worked example `skills/isoscope/examples/decision-explainer.spec.json`.

## Layout

```
template.html   the engine (one file: scene, router, inspector, themes, live client)
build.mjs       spec + template → self-contained HTML
lib.ts          SQLite graph store ⇄ spec (core, shared)
cli.ts          init · import · export · build · serve
mcp.ts          MCP server (agents maintain the map)
db/schema.sql   the graph shape: nodes, edges-as-entities, status, trace
adapters/       contracts for non-MCP harnesses (DeepSeek first)
examples/       isoscope-by-isoscope (primary) · ODIN Sentinel · lumbr
docs/           design rules (routing doctrine + sources) · dev handoff
```

Spec schema: [SPEC.md](SPEC.md) · Routing laws & roadmap: [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md)

## Roadmap

CI/CD provider integrations (GitHub Actions / GitLab / Buildkite adapters that
map failing jobs → modules automatically) · test-runner adapters
(failure→module attribution) · live telemetry streaming into the trace-shaped
status slots · R30 phase 2: in-place hot-swap for `serve` (shipped) · R10 lane assignment in shared corridors · R12 PathFinder
negotiation past ~50 links · lumbr bridge (its instrumentation → `mark`).

MIT.
