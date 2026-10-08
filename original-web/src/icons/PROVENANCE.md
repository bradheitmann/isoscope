# Isoscope-authored icons (not part of the pinned Desert Pants vendor tree)

These 11 SVGs were previously in `vendor/desert-pants/icons/svg/` but are not byte-identical to
any file in the upstream Desert Pants checkout at the pinned commit
`ba99de27974f623c20679962e8e3dc4d74c2a273` (`code`, `menu`, `volume-2` and `volume-x` share
names with upstream files but differ in content; the other 7 have no upstream counterpart),
and were never listed in
`vendor/desert-pants/CANONICAL-MANIFEST.sha256`. They were moved here (D13) so the
vendor tree contains only upstream bytes. They are imported by `src/original-renderer.ts`
with `?raw` and inlined by the vite build.

None carries a Lucide version header, so none is traceable to a specific Lucide release.
Each is "writer-authored, Lucide-style": 24-unit grid, `currentColor` stroke, round caps
and joins. Where the geometry resembles a Lucide icon the likely name is noted; this is a
resemblance, not a verified copy. `LICENSE-lucide.txt` (ISC) is included as a courtesy
because the style follows Lucide.

| File | Resembles Lucide | Status |
| --- | --- | --- |
| activity.svg | activity | writer-authored, Lucide-style |
| clapperboard.svg | clapperboard | writer-authored, Lucide-style |
| code.svg | code | writer-authored, Lucide-style |
| grid.svg | grid-3x3 | writer-authored, Lucide-style |
| layers.svg | layers | writer-authored, Lucide-style |
| menu.svg | menu | writer-authored, Lucide-style |
| pen.svg | pen-line / edit-3 | writer-authored, Lucide-style |
| shuffle.svg | shuffle | writer-authored, Lucide-style |
| stop.svg | square (filled) | writer-authored, Lucide-style |
| volume-2.svg | volume-2 | writer-authored, Lucide-style |
| volume-x.svg | volume-x | writer-authored, Lucide-style |

`chevron-down.svg` is NOT here: it is byte-identical to upstream at the pinned commit and
stays in the vendor tree (now listed in the manifest).
