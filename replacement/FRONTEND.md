# Isoscope web frontend

The web client is a strict TypeScript React application with a data-driven Three.js topology view. It reads the Rust snapshot schema from `/api/snapshot` and the optional Isoscope graph from `/api/graph`; an absent graph falls back to the plan dependency graph. The table and inspectors expose the same selection and evidence to keyboard and screen-reader users. The WebGL canvas is decorative to assistive technology, has an accessible HTML table beside it, retains its camera and selection while snapshots refresh, and leaves the table usable when WebGL is unavailable.

## Desert Pants authority

`vendor/desert-pants/UPSTREAM.md` pins Desert Pants to `74777b54301ebfa8c63649adb559a1256160f6fa`. The vendored `build/web` token/theme exports and font binaries are checked against that source release. `themes.ts` supplies the complete 18-theme inventory; `themes.json` carries each theme's light and dark role colors; `tokens.json`, `tokens.css`, `themes.css`, and `fonts.css` supply the corresponding token metadata, custom properties, modes, and fonts. Do not add a parallel theme list or substitute font assets.

The persisted preferences are `isoscope.theme` (a generated theme ID) and `isoscope.mode` (`system`, `light`, or `dark`). The UI applies these as `data-dp-theme` and `data-dp-mode` on the document root. System appearance changes dispatch a scene refresh when the stored mode remains `system`. The scene resolves a generated color token through CSS, parses the resolved sRGB channels and alpha explicitly, and updates the background, lights, grid, floor, nodes, selected emissive treatment, and edges. It disables filmic tone mapping so the output does not intentionally remap the canonical palette colors.

The Three.js scene's world coordinates, camera projection and controls, tessellation, adaptive detail limits, and material parameters are Isoscope renderer configuration; Desert Pants does not currently define those 3D geometry and shader parameters. They are kept separate from UI color, typography, spacing, layout, motion, and component roles, which come from generated Desert Pants tokens. No claim is made that those application-owned renderer constants are Desert Pants tokens.

## Verification

From `replacement/web`:

```sh
npm run typecheck
npm test
npm run build
```

The theme contract tests inspect all 18 generated themes and both exported modes. Scene tests apply every one of the 36 theme/mode exports and verify exact token colors, alpha compositing, lights, fog, grid, floor, selected-node state, and edges. Design-contract tests pin the vendored source and emitted assets, reject unknown token aliases and representative raw styling drift, and retain focus, touch-target, and live reduced-motion rules.

The upstream linter can be run against the consumer UI sources with:

```sh
DESERT_PANTS_TOKENS=/path/to/desert-pants/tokens \
  /path/to/desert-pants/tools/desert-pants/target/release/desert-pants \
  lint --deny-warnings replacement/web/src
```

The WebGL renderer chooses lower pixel ratio and detail as graph size increases. This is a resource policy, not a performance benchmark; do not infer that the Rust backend is faster from this client-side behavior.
