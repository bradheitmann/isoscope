# Desert Pants assets used by the Isoscope original-web lane

Canonical source is the `desert-pants` repository at commit `ba99de27974f623c20679962e8e3dc4d74c2a273` (2026-10-01). The copied token sources, all generated theme outputs, font assets, reference component CSS, and selected Lucide icons were verified byte-for-byte against that checkout. `CANONICAL-MANIFEST.sha256` pins every vendored asset used here; `build/web/themes.json` is the complete 18-theme inventory. The switcher presents that inventory in exact reverse order without mutating canonical values.

Key generated-output SHA-256 values:

- `build/web/tokens.css`: `3fcab11ca3c19b337f5a4ea0521555d924c4d3e91c614a6fafa7cfc8cf61b1ea`
- `build/web/tokens.json`: `37532ee1043d048d9f6982adb2679cf1694fda857562b7f3d1ad6b0f1f02455d`
- `build/web/tokens.ts`: `81ae60a54206b472ee27513147f916796c905c75c3216e9d6ec0b943f11288df`
- `build/web/themes.json`: `c1b8dd42242ba3bec02732f99be565fd01951357f07877de90165386d75bb7d2`
- `build/web/themes.css`: `695329e99390b175fc70a3e1a821479d59a8b1370160225f1c79b1c2ea9d35ab`
- `reference/components.css`: `25c8c4922608fe164eabbd60b91365ce69e7a20c0ca8a1a3fd86f918a7be4575`

The canonical responsive workbench recipe comes from the same commit. Its exported values define the 52px control rail, canonical regular/compact grid gaps, 384px/448px reader bounds, and 1180px transition to the supplied bottom-sheet treatment. Desert Light is the fresh-profile default. A previously explicit theme and mode choice is restored.

The Isoscope mark is a text wordmark rendered with the canonical Desert Pants wordmark and brand-name recipes. No original Isoscope logo asset exists in the inspected source; no unrelated Desert Pants logo was repurposed.

Lucide assets used by controls and kept in this tree (all byte-identical to upstream at the pin and listed in the manifest): play, pause, arrow-right, archive, rotate-ccw, settings, info, x, search, plus, minus, chevron-down. Their source license is `icons/LICENSE-lucide.txt` (upstream spells it in lowercase; the manifest uses the same exact case). Isoscope-authored icons live in `src/icons/` (see its PROVENANCE.md), not here.

## Vendor-tree integrity (D13)

`tests/vendor-manifest.test.ts` requires every file under this directory to be listed in `CANONICAL-MANIFEST.sha256` with exact case and a matching sha256. The only exceptions are the two meta files `CANONICAL-MANIFEST.sha256` and `PROVENANCE.md`, named explicitly in the test.

- Icons: the 11 files not byte-identical to upstream at the pin moved to `src/icons/` (4 of them — code, menu, volume-2, volume-x — share an upstream name but differ in content). `chevron-down.svg` was verified byte-identical to upstream at the pin and is now in the manifest.
- Tokens: `tokens/01`-`03` and `05`-`09` were verified byte-identical to `git show ba99de2:tokens/<file>` and added to the manifest. `tokens/04-layout.tokens.json` differs from the pin (missing the upstream `visualization-workbench` block) so it moved to `src/tokens/`.
- Case: upstream's filename is `icons/LICENSE-lucide.txt`; the manifest line was corrected to match (the file and git already used lowercase).
