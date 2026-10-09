# Isoscope

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

The engine has no runtime dependencies (the app in `original-web/` adds three.js, vite and vitest). TypeScript on [Bun](https://bun.sh) (`bun:sqlite` built in).
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

## Current state: original-web

`original-web/` is the live Isoscope web product: a Vite + three.js app (Kimi's
interface reconstruction of the isometric city) that renders the self-map
`examples/isoscope.spec.json`. It has its own `package.json` and lockfile
(npm, `package-lock.json`); the root engine is separate and runs on Bun.
The self-map exists twice (root `examples/` and `original-web/examples/`) and the
two copies must stay byte-identical (`tests/spec-sync.test.ts` enforces it).

```bash
# original-web (live web product; dev server on 127.0.0.1:4182)
cd original-web
npm ci
npm run dev            # vite dev server
npm run typecheck      # tsc for src + scripts
npm test               # vitest
bun run qa:static      # static QA checks
npm run qa             # browser QA harness (tests/qa/, headless Chrome)
npm run build          # tsc + vite build -> dist/

# root engine
bun run typecheck
bun run test           # bun test ./tests/
bun run build:self     # examples/isoscope.spec.json -> out/isoscope.html
bun run drc            # collision lint (bun drc.ts <spec>)
```

## Layout

```
template.html   the engine (one file: scene, router, inspector, themes, live client)
build.ts        spec + template → self-contained HTML
router.ts       the shared edge router (template build, drc.ts and original-web all use it)
drc.ts          collision lint: fails when routes cross beyond the spec's budget
okoa.ts         OKOA design-token integration
lib.ts          SQLite graph store ⇄ spec (core, shared)
cli.ts          init · import · export · build · serve · render · ci · mark
mcp.ts          MCP server (agents maintain the map)
db/schema.sql   the graph shape: nodes, edges-as-entities, status, trace
adapters/       contracts for non-MCP harnesses (DeepSeek first)
examples/       isoscope-by-isoscope (primary) · ODIN Sentinel · lumbr
scripts/        render/contrast/overflow proofs, screenshots, landing + theme tooling (Bun, TypeScript)
skills/         agent skills (skills/isoscope: presentation layer)
tests/          engine tests (`bun run test`; bare `bun test` is scoped to this folder by bunfig.toml)
advisory/       advisory deliverables (ODIN codebase map + topology lab)
original-web/   the live web product (Vite + three.js) with its own tests, QA harness and build
docs/           design rules (routing doctrine + sources) · dev handoff
```

Spec schema: [SPEC.md](SPEC.md) · Routing laws: [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md)

## Roadmap

Shipped: CI/CD provider integrations (GitHub Actions / GitLab / Buildkite) ·
R30 phase 2 in-place hot-swap for `serve` · R10 lane assignment in shared corridors.

Open: test-runner adapters (failure→module attribution) · live telemetry
streaming into the trace-shaped status slots · R12 PathFinder negotiation past
~50 links · lumbr bridge (its instrumentation → `mark`).

## Media surfaces

The demo map ships with **no bundled videos** — deliberately: you bring your
own, and nothing copyrighted is redistributed. Any cube face can play a video,
show an image, render a document, or hold ink. To add your own, double-click a
cube, pick a face, and either paste any video/image URL or upload a file (the
dev server stores uploads in `original-web/public/media/uploads/`, which is
gitignored). Everything you assign persists locally in
`original-web/examples/annotations.local.json` (also gitignored).

MIT.
