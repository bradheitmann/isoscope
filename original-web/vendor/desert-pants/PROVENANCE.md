# Desert Pants assets used by the Isoscope original-web lane

Canonical source is `/Users/bradleyheitmann/open_protocols/desert-pants-workbench` at commit `ba99de27974f623c20679962e8e3dc4d74c2a273` (2026-10-01). The copied token sources, all generated theme outputs, font assets, reference component CSS, and selected Lucide icons were verified byte-for-byte against that checkout. `CANONICAL-MANIFEST.sha256` pins every vendored asset used here; `build/web/themes.json` is the complete 18-theme inventory. The switcher presents that inventory in exact reverse order without mutating canonical values.

Key generated-output SHA-256 values:

- `build/web/tokens.css`: `3fcab11ca3c19b337f5a4ea0521555d924c4d3e91c614a6fafa7cfc8cf61b1ea`
- `build/web/tokens.json`: `37532ee1043d048d9f6982adb2679cf1694fda857562b7f3d1ad6b0f1f02455d`
- `build/web/tokens.ts`: `81ae60a54206b472ee27513147f916796c905c75c3216e9d6ec0b943f11288df`
- `build/web/themes.json`: `c1b8dd42242ba3bec02732f99be565fd01951357f07877de90165386d75bb7d2`
- `build/web/themes.css`: `695329e99390b175fc70a3e1a821479d59a8b1370160225f1c79b1c2ea9d35ab`
- `reference/components.css`: `25c8c4922608fe164eabbd60b91365ce69e7a20c0ca8a1a3fd86f918a7be4575`

The canonical responsive workbench recipe comes from `tokens/04-layout.tokens.json` at the same commit (SHA-256 `2225319649c5f32d8800c9b610652d5eab7d237f12f14bc903ded3f7667991ee`). Its exported values define the 52px control rail, canonical regular/compact grid gaps, 384px/448px reader bounds, and 1180px transition to the supplied bottom-sheet treatment. Desert Light is the fresh-profile default. A previously explicit theme and mode choice is restored.

The Isoscope mark is a text wordmark rendered with the canonical Desert Pants wordmark and brand-name recipes. No original Isoscope logo asset exists in the inspected source; no unrelated Desert Pants logo was repurposed.

Only these Lucide assets are used by controls: play, pause, arrow-right, archive, rotate-ccw, settings, info, x, search, plus, and minus. Their source license is `icons/LICENSE-LUCIDE.txt`.
