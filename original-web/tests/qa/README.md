# Isoscope QA harness (strict TypeScript, raw CDP)

Rebuilt in-repo after the old /tmp tooling was lost. Run from `original-web/`:

```
npm run qa:static   # no browser: resolves every var() chain of the 96 .dp-type-* roles in vendor tokens.css (and dist CSS if built)
npm run qa          # full run
bun tests/qa/run.ts --only=navigation,modal   # subset: typography,navigation,viewport,modal,resize,gestures,motion,scene
```

## What it does
- Starts vite on a free port in 4300-4399 and a PRIVATE headless Chrome (own `--user-data-dir` under `os.tmpdir()`, CDP on a free port in 9400-9499). It never uses 4190, 9333 or 8022.
- Chrome binary: `$QA_CHROME`, else the Playwright `chrome-headless-shell`, else `/Applications/Google Chrome.app` with `--headless=new`.
- Drives the page with raw CDP over the built-in `WebSocket` (no dependencies). Waits for the startup camera flight to settle before gestures. Wheel gestures are synthetic `WheelEvent`s.
- Kills vite and Chrome by their own PIDs on exit, failure and SIGINT/SIGTERM, and removes its temp profile.

## Contracts
| key | checks |
| --- | --- |
| typography | static var() resolution and an independent oracle against the vendored token JSON (both also in `--static`), plus computed style of each role equals the resolved literals |
| navigation | generated 100-sections (10 groups "Area NN", 99 edges) and 100-groups fixtures: 12-row paging, reach every module, search by id/name/group label (expectations derive from the fixture), select pins |
| viewport | 8 viewports 390x844, 768x1024, 1024x768, 1280x600, 1280x800, 1440x900, 1920x1080, 2560x1440: applied size, no horizontal overflow, canvas fill, controls reachable; off-canvas labels recorded (D6) |
| modal | reader sheet at 390x844 and 1024x768: open state, focus entry (D4). Escape and Close are asserted to close the sheet (D5, ruled) |
| resize | wide/compact/wide/compact handshake: docking, inert, role, aria-expanded, focus |
| gestures | synthetic wheel in/out changes zoom, R returns to home |
| motion | `prefers-reduced-motion`: R snaps home within 2 frames |
| scene | 100-node scene applies, node/edge counts, labels under the panel and fps recorded |

Statuses: `pass`, `fail`, `observed`, `pending-owner-ruling`, `skipped`. Exit code is 1 if any check is `fail` (product defects included; they carry a drain id such as `[D4]`).

## Typography oracle (static, no browser)
Besides resolving var() chains, `oracle.ts` reads the canonical role tuples straight from the vendored Desert Pants DTCG JSON (`vendor/desert-pants/tokens/*.tokens.json`). Every file is first verified against its sha256 in `CANONICAL-MANIFEST.sha256`; references (`{font.size.7xl}`, whole-composite refs) are resolved from the JSON only. For every `.dp-type-<role>` the CSS defines that the tokens also define, font-family, font-size, font-weight, line-height, letter-spacing (tracking-em), text-transform and font-variant-numeric are compared with the token web composite. Fluid roles are checked against the token `fluid` block (min-px, vw, offset-px, max-px) and capped sizes against the web size. The report line reads `N roles checked, M tuples, K mismatches`; any mismatch fails. Current result: 96 roles, 672 tuples, 0 mismatches for both vendored tokens.css and the built dist CSS.

## Known results on the b76b003 product
- The full run (`npm run qa`) exits 1 on the b76b003 product because of a real defect, D4: in the compact layout, opening the reader sheet leaves focus on the btnReadMap button instead of moving it into the sheet (check "open: focus moves into the sheet"). The D4 fix makes that check pass.
- D5 (Escape and Close on the reader sheet) is ruled: both close the sheet fully, and the modal checks assert it. The `pending-owner-ruling` status remains available in the harness but is no longer emitted.
- The D6 home clash exemption applies only when the label scale is below 1, so one label can still be hidden by the clash declutter at 1280x600 (same on main).
- `npm run qa:static` needs no browser and exits 0.

### D6: "1 label not rendered (width 0)" at 1280x600
The viewport observation `1 not rendered (width 0)` at 1280x600 is pre-existing, not caused by the D6 fit. The same harness run against main b76b003 reports the identical `0/14 off-canvas, 1 not rendered` at 1280x600; at every other viewport at or above 1024x768 both builds report 0 not rendered. The cause is the clash declutter in `original-renderer.ts` (label placement loop): a lower-priority label that overlaps an already placed one gets class `clash`, and `.lbl.clash { display: none }` in `styles.css` gives it a zero-size box, which the probe counts as "not rendered". At 1280x600 the shorter canvas makes two labels overlap, so one recedes by design. The D6 fit only changes the off-canvas count (390x844 went from 7/14 on main to 0/14, 768x1024 from 2/14 to 0/14) and does not touch the not-rendered count. Evidence: the QA run logs kept with the drain evidence.

## Outputs
Screenshots go to `tests/qa/out/` (gitignored). Files are in `tests/qa/*.ts`; none are named `*.test.ts`, so vitest ignores them, and `npm run typecheck` covers them via the `tests/**/*.ts` include.

## Notes
- The typography count here is 96 roles x 7 properties = 672 tuples (plus 1344 web/compact variant tuples). Older runs quoted 192 roles and 464 tuples; those figures came from different sources and are not reproducible from this repo.
- Reduced-motion home anchor values from the old run (266.104/666.043) belong to a previous build; the current anchor is recorded as an observation.
