# Isoscope

**So you always know what your codebase does, how it is architected, and if
something is broken and what you need to work on next.**

Isoscope renders a system as an inspectable isometric city: modules are
buildings, connections are pipes that know *what flows* through them, and
status is painted on the architecture itself. Open the map in a browser on day
one of a project; as the codebase grows, your agents mirror every module,
link, and blocker into a graph store — and the map repaints live with every
change. The map never trails reality.

Zero dependencies. TypeScript on [Bun](https://bun.sh) (`bun:sqlite` built in).
Ships as one self-contained HTML file that works from disk.

## Quickstart

```bash
bun cli.ts import examples/isoscope.spec.json my.db   # seed a graph store
bun cli.ts serve my.db                                # live map at :4177
bun cli.ts build my.db out/map.html                   # shippable artifact
```

The primary example is isoscope describing itself (`examples/isoscope.spec.json`);
`examples/odin.spec.json` is the first real consumer (ODIN Sentinel, 16 modules).

## The loop

1. **Day one**: seed a store with a handful of modules; open `serve` in a tab.
2. **While building**: agents maintain the map — via the **MCP server**
   (`mcp.ts`, 7 tools, works in Claude Code/Codex/any MCP harness) or via the
   **CLI contract** for non-MCP harnesses (`adapters/DEEPSEEK.md`).
3. **Every commit**: a post-commit hook keeps it honest —
   ```bash
   # .git/hooks/post-commit
   bun /path/to/isoscope/cli.ts export my.db --out docs/architecture.spec.json
   ```
   (any store write repaints every open browser via SSE).
4. **Every release**: `build` emits the artifact to ship with your docs.

## What the map gives you

- **What it does** — click any building: identity, state, evidence, in one column.
- **How it's architected** — orbit freely (orthographic: flat-iso at rest, 3D
  in motion); press **Stack** for semantic levels; links are entities — click a
  pipe to read what data flows over it.
- **What's broken, what's next** — status classes (`red` blocker / `amber`
  queued / `you` decision) paint whole buildings; the overview panel lists every
  open item worst-first; circuit mode isolates any subsystem's live flow.

## Layout

```
template.html   the engine (one file: scene, router, inspector, themes, live client)
build.mjs       spec + template → self-contained HTML
lib.ts          SQLite graph store ⇄ spec (core, shared)
cli.ts          init · import · export · build · serve
mcp.ts          MCP server (agents maintain the map)
db/schema.sql   the graph shape: nodes, edges-as-entities, status, trace
adapters/       contracts for non-MCP harnesses (DeepSeek first)
examples/       isoscope-by-isoscope (primary) · ODIN Sentinel
docs/           design rules (routing doctrine + sources) · dev handoff
```

Spec schema: [SPEC.md](SPEC.md) · Routing laws & roadmap: [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md)

MIT.
