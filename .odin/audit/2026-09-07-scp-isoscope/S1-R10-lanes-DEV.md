# S1 R10 DEV evidence — 2026-09-07
Owner: B/DEV-1 (b-dev-1). Recipient: B/TEAM-PM (surface:77).
State: DEV_COMPLETE_QA_PENDING. This is producer evidence, not QA acceptance.
Authority: S1-R10-lanes.md including Amendment 1; A/EXEC-PM freeze lift received.
No commit or push performed.

## Instruction-read proof
Read in full before initial implementation:
- .odin/audit/2026-09-07-scp-isoscope/S1-R10-lanes.md
- wc -c: 5021
- shasum -a 256: d31fa8875f2bb602045f77de861185f7b293e26d99c88c5b87c7ba94ccc4710f

Read in full again before resuming after the freeze:
- Same path; wc -c: 5743
- shasum -a 256: 3ff7ab4dabf3dc4e168a8c523501d7c1839ad8ae96a558e82cdb4f11cfa0a14b
- Reactivation HEAD: 6d075618e2ebb97f908969e7afc2ce614a33be49; branch main.
- Existing untracked .odin/, advisory/2026-09-04-cedar-springs/, dsh-plugin/
  classified in the team manifest and left untouched except this own evidence file.

## Changed product/document files (wc -c)
router.mjs: 14881
drc.ts: 2129
docs/DESIGN-RULES.md: 8241
docs/HANDOFF.md: 19824
No example budgets changed. No prohibited product paths modified.

## A1 — exact commands, shortened verbatim output
Commands:
    bun drc.ts examples/isoscope.spec.json
    bun drc.ts examples/odin.spec.json
    bun drc.ts examples/lumbr.spec.json

Output, in that order:
    weighted crossings: 1   budget: 1   (1 crossing rendered as hops · 0 shared channels)
    lanes_assigned: 0   corridors_resolved: 0   unresolved_shares: 0
    PASS — the board routes within its acknowledged budget.
    weighted crossings: 5   budget: 5   (5 crossings rendered as hops · 0 shared channels)
    lanes_assigned: 0   corridors_resolved: 0   unresolved_shares: 0
    PASS — the board routes within its acknowledged budget.
    weighted crossings: 0   budget: 0   (0 crossings rendered as hops · 0 shared channels)
    lanes_assigned: 0   corridors_resolved: 0   unresolved_shares: 0
    PASS — the board routes within its acknowledged budget.

Exit: 0.

## A2 (Amendment 1), A3, A4, final QC invariants
Ran bun -e importing isoRouteAll from ./router.mjs and reading the 5 fixtures.
The baseline router was loaded read-only with git show HEAD:router.mjs, then
imported through a data URL. No baseline file or fixture was written.
Assertions: weighted bounds 1/5/0/25/64; no stress share increase; topology
share decrease; every residual has 2 edge keys and a nonempty reason;
two calls have byte-identical JSON routes and QC; all consecutive route
points share x or z; every first/last point exactly matches baseline output;
weighted=crossings+4*shares; offender sum=2*weighted; hops=crossings;
unresolved_shares.length=shares. Exit: 0.

Verbatim output:
A2 advisory/2026-09-01-odin/visual-a-odin-codebase.spec.json weighted=25 crossings=13 shares=3->3 lanes_assigned=0 corridors_resolved=0 unresolved_shares=[{"keys":["WT1-REL","WT2-REL"],"segments":[1,1],"reason":"obstacle clearance"},{"keys":["WT1-REL","WT2-REL"],"segments":[2,2],"reason":"obstacle clearance"},{"keys":["SRV-LAY","TOP-SRV"],"segments":[1,2],"reason":"weighted cost would rise"}]
A2 advisory/2026-09-01-odin/visual-b-topology-lab.spec.json weighted=55 crossings=43 shares=6->3 lanes_assigned=4 corridors_resolved=2 unresolved_shares=[{"keys":["BPM-D2","D3-GAT"],"segments":[3,1],"reason":"obstacle clearance"},{"keys":["BPM-D2","D3-GAT"],"segments":[3,2],"reason":"obstacle clearance"},{"keys":["X8-Q2","X6-GAT"],"segments":[1,1],"reason":"weighted cost would rise"}]
A3 PASS: 5/5 fixtures; byte-identical routes and QC across two runs
A4 geometry: 94 routes, 335 orthogonal segments, 188 endpoints unchanged from baseline (existing wall trim retained)
QC consistency PASS: weighted=crossings+4*shares; offenders sum=2*weighted; hops=crossings; residual count=shares

A4 interpretation: existing trimEnd moves centre/pin attachment to the rendered
wall inset (pad=-0.06). All 188 rendered endpoints are unchanged. This does not
assert that a trimmed endpoint is literally the original module centre.
The lane reconstruction retains original vertices, including R13 pins/stubs,
before the unchanged end-trimming operation.

## A5 — exact command, shortened verbatim output
    bun run proof:contrast

    18/18 themes PASS · JS errors: 0 · screenshot /tmp/iso-contrast-tokyo-night.png

Exit: 0. All 18 individual theme rows reported PASS.

## A6 — exact command and output
    bun cli.ts import advisory/2026-09-01-odin/visual-b-topology-lab.spec.json /tmp/s1-b.db && bun cli.ts build /tmp/s1-b.db /tmp/s1-b.html && bun scripts/shot.ts /tmp/s1-b.html /tmp/s1-lanes.png 1440 900 "odinView.restore();odinView.look(1.65,6.2,4,2.4,0.55);"

    isoscope: imported advisory/2026-09-01-odin/visual-b-topology-lab.spec.json → /tmp/s1-b.db · 32 nodes · 28 edges
    isoscope: built /tmp/s1-b.html from /tmp/s1-b.db · 32 modules · 28 links
    /tmp/s1-lanes.png · 1440x900 · JS errors: 0

Exit: 0. B/DEV-1 opened the actual PNG using view_image. The corridor near GAT
shows separated parallel traces and distinct hop arcs. Independent B/QA-1 must
inspect the PNG and decide A6; this producer observation is not QA acceptance.

Non-canonical /tmp artifacts: s1-b.db (plus SQLite sidecars if present),
s1-b.html, s1-lanes.png, isoscope-self.db, isoscope-self.html,
iso-contrast-tokyo-night.png, and the scripts' isoscope-chrome-shot /
isoscope-chrome-contrast headless profiles.

## A7 — exact commands and output
    git diff --name-only

    docs/DESIGN-RULES.md
    docs/HANDOFF.md
    drc.ts
    router.mjs

    git diff --check

No output; exit 0. Tracked changes are a subset of write_scope.
This own evidence file is allowed separately by the contract's .odin exception.

## Branch proof and deferred A8
    git rev-parse --abbrev-ref --symbolic-full-name @{u}
    origin/main

    git rev-parse HEAD @{u}
    6d075618e2ebb97f908969e7afc2ce614a33be49
    6d075618e2ebb97f908969e7afc2ce614a33be49

git diff --cached --name-status: no output. Changes remain unstaged/uncommitted.
A8 is pending independent QA PASS relayed by B/TEAM-PM; no closure claim.

## Residuals and limitations
Codebase: WT1-REL / WT2-REL has 2 residual segment pairs rejected for obstacle
clearance; SRV-LAY / TOP-SRV has 1 rejected because weighted cost would rise.
Topology: BPM-D2 / D3-GAT has 2 residual segment pairs rejected for obstacle
clearance; X8-Q2 / X6-GAT has 1 rejected because weighted cost would rise.
No detours or rerouting added. S1b owns obstacle-clearance follow-up.
Topology perpendicular crossings rise 40→43 while shared pairs fall 6→3,
so weighted cost falls 64→55; Amendment 1 explicitly permits this trade.
Flat routing QC cannot certify stacked-plane crossings.
