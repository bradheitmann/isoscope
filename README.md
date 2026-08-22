# Isoscope

**A schematic observability visualization — a codebase (or any system) as an
inspectable isometric city.**

Orthographic 3D you can orbit from any angle · etched paper-and-ink buildings ·
PCB-routed connection pipes · circuit-breaker interaction (click modules to
energize a live sub-circuit; flow runs only where both ends are live) · optional
three-level stacking (governance above, runtime at ground, field below — or
whatever your strata are) · guided trace narration · single sectioned inspector
(identity → state → evidence) · 18 classic IDE themes (Kanagawa, Dracula,
Gruvbox, Catppuccin, …) · label/body font pickers · everything driven by one
JSON spec.

## Use

```bash
node build.mjs examples/odin.spec.json out/my-map.html
open out/my-map.html     # fully self-contained, works over file://
```

Write your own spec (see `SPEC.md`); the engine renders everything else.

## Why a builder instead of `fetch()`?

Self-contained output runs from disk with zero servers — `file://` blocks module
imports and fetches (CORS), so the spec is injected at build time. Hosted use
can trivially wrap the same template.

## Origin & roadmap

Extracted from the ODIN Sentinel architecture map (first consumer,
`examples/odin.spec.json`). Status objects are deliberately trace-shaped so live
telemetry can stream into the same slots — the roadmap is: spec → static map →
live production observability. Rendering: Three.js (orthographic camera, fat
lines). Design language: OKOA + classic IDE palettes.

MIT.
