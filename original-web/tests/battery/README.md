# Seeded outside-review test battery

Baseline product: b5f04f2. Tests only; failures stay red until product remediation.
Seed: `0x157149` (1405257), with explicit offsets in each property corpus. LCG uses
32-bit Math.imul; no random seed selection. Private server ports are 4300–4399 and
CDP 9400–9499, checked on IPv4. No 4190/9333 or signed-in browser profile.

From a checkout of `rsch/test-battery`:

```sh
bun install --frozen-lockfile --ignore-scripts
cd original-web
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test -- --reporter=json --outputFile=/absolute/path/vitest.json
bun tests/battery/browser.ts --out=/absolute/path/browser.json
bun tests/battery/standard-browser.ts --out=/absolute/path/standard-browser.json
cd ..
bun run typecheck
bun test ./tests/
bun scripts/test-battery-builder.ts --out=/absolute/path/builder.json
bun scripts/test-battery-stress.ts --out=/absolute/path/stress.json
```

Run suites sequentially if comparing timing. The browser runners always shut down
only their own child processes and private profiles, including signal handlers.
Every new-browser result includes ports/PIDs; runtime logs accompany JSON files.
The standard runner also retains screenshots beside its output JSON.

## Coverage and interpretation

- `layout-property.test.ts`: 128 seeded galleries, 200 router cases including
  cycles/self-loops, empty/singleton/500-node cases, extreme coordinates, journey
  ordering and mixed-footprint placement. Checks finite output, deterministic
  repeatability and input preservation. Seeded valid grids have adequate spacing;
  the dedicated compact mixed-footprint counterexample exercises overlaps.
- `graph-parser.test.ts`: real Bun CLI over a temporary Git fixture repository;
  64 valid import scenarios (8 templates), 64 comment/string scenarios (6
  templates), TS emitted-extension resolution, tracked filtering and repeatability.
  This uses generated source files, not a copied regex oracle.
- `api-adversarial.test.ts`: real loopback HTTP and node:sqlite, batch/filter/health/
  attention, 64 CRUD modules, SQL strings, 100 adversarial payload cases from 10
  malformed shape/type classes, rollback, body caps, upload containment and origins.
  A 500 or accepted malformed payload remains a failing validation contract.
- `telemetry-lifecycle.test.ts`: fake timers and controlled fetch/beacon responses,
  ring cap, rolling recovery, latency, batching, listener disposal and trace results.
- `annotation-order.test.ts`: uninitialized persistence and out-of-order writes.
- `media-lifecycle.test.ts`: behavior of exact renderer function excerpts over
  controlled queues/video stubs. The renderer lacks importable pure lifecycle seams;
  these are unit probes, not real-media decoding/integration coverage. Extraction
  fails explicitly if the source boundaries move. Promise/browser decode timing
  is not claimed by these probes.
- `browser.ts`: boot, clone/toggle-back, 7-board gallery wrap, zero-based Stack grids,
  grid preference, deep links, 120 valid spec cases, 60 invalid spec cases, 500-node
  scene, foreign spec fetch, narrow rail, XSS markers, safe SVG/text, actual Vite APIs
  and filesystem denial. Known validation failures are caught so other scenarios
  run. SVG registration directly invokes the real function excerpt in a real DOM;
  the normal boot regression separately exercises bundled icon imports. Media URL
  requests are blocked in this runner to avoid large downloads; actual decode/
  audiovisual correctness is outside its result claims.
- `standard-browser.ts`: reuses the existing typography/navigation/viewport/modal/
  resize/gesture/reduced-motion/100-node contracts with the private IPv4 launcher.
  Keep observed/pending/skipped results separate from assertions.
- root scripts: serialized dollar-sequence builder corpus; bounded 500-node router
  stress with 0, 20 and 499 edges and 500-node gallery with 0 edges. Dense connected
  gallery search is not covered. Stress timeout is reported distinctly from a
  semantic assertion failure; child processes have a 15-second budget.

No source repair is included. Source-excerpt tests are marked and supplement live
browser/exported-module behavior; they do not establish public API stability.
Tests numbered many times are corpus cases, not distinct bug counts. See the
external EXEC-RSCH report for grouped findings and exact recorded counts.

## Independent holdout suggestions

A/EXEC-QA owns acceptance, not the author of this battery. Inspect assertions and
fixtures first. Spot-check the mixed-footprint counterexample, parser comment/.js
cases, telemetry recovery/beacon, and the browser XSS marker, points registration,
foreign fetch and negative/NaN validation. Use the named Vitest files/test-name
filters rather than rerunning every corpus. For browser reproduction the runner
is bounded and writes one record per check, including the failed input family.
Do not treat the red baseline as a harness failure or silently invert expectations.
Do not claim the full suite passes after only rerunning a subset.
