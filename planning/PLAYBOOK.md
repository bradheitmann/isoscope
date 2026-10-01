# Isoscope planning playbook

This manual adaptation draws on Leitting `planning/PLAYBOOK.md` Parts 0 and 20 at source commit `48f2923`; it omits Leitting-specific Rust-only, Kani, and kernel requirements. It does not add or claim executable planning gates. Existing product build, routing, telemetry, and design contracts remain in `docs/` and the root specification.

## 1. Authority and task flow

The [control issue #2](https://github.com/bradheitmann/isoscope/issues/2) records the current program state. Each implementation or review task has its own issue, exact scope, base SHA, acceptance evidence, and owner. The [planning setup issue #3](https://github.com/bradheitmann/isoscope/issues/3) establishes this protocol; the [design review issue #4](https://github.com/bradheitmann/isoscope/issues/4) is a separate read-only lane. The [enforcement issue #5](https://github.com/bradheitmann/isoscope/issues/5) is assigned to `iso-enforce01` under its own claim and PM ACK.

Claims are first-wins. Before work, comment `CLAIM <issue> seat=<PM|DEV|QA|GUARD> nonce=<unique> base=<full SHA>` and include `Agent`, `Read`, `Plan`, and exact write scope. PM replies `ACK <nonce>` with accepted scope and base. No ACK, no edits. A scope change requires an issue amendment and a new ACK. Include `Agent:`, `Seat:`, and `Issue:` trailers on every new task commit.

Use a dedicated branch from the issue's base SHA. Keep changes within scope. Do not force-push, rebase published commits, or squash. DEV opens a PR against the recorded base and owns its fixes. GUARD reviews after independent QA passes the exact head; a separate merge executor merges only after GUARD approval and forge authorization.

## 2. Planning records

- `ROSTER.yaml` records requested seat configuration separately from verified runtime receipts. Use `unknown` when a provider, model identity, runtime, or token count was not observed.
- `HANDOVER.md` records active lanes, frozen sources, exact heads, findings, and next authorized actions. Update it only within an acknowledged planning scope.
- `contracts/` stores task contracts: objective, base, read set, write scope, dependencies, acceptance criteria, and evidence. Contracts coordinate work; they are not executable gates.
- `prompts/` contains role prompts. A prompt never overrides the issue's scope or forge state.

## 3. Work-state record

For each claimed seat, record UTC timestamps for `claim`, `ack`, `start`, `wait`, `resume`, `handoff`, and `done` when those events occur, with issue, nonce, branch, and exact head SHA. A wait entry names its cause and next observable event. While blocked on an external operation, poll at increasing intervals (about 30 seconds, then 60 seconds). After two unchanged reads, back off to idle checks every 1–5 minutes unless a real push channel can reach the seat; do not wait forever for an event that cannot be delivered. Handoff records the outgoing/incoming owner and acknowledgment; read back the forge comment before treating a receipt as authoritative. Do not start a duplicate active seat. These records are manual status evidence, not scheduler enforcement.

## 4. Evidence and acceptance

Attach evidence to the PR or issue and bind it to the exact commit SHA. Report commands and outcomes accurately; distinguish not-run, failed, and passed. Keep build/lint results separate from product acceptance.

For UI work, capture real browser observations at the actual `innerWidth` and `innerHeight`, with zoom/device scale noted when relevant. Review at wide, compact, square, portrait, and short-height sizes as specified by the task. Inspect typography roles, wrapping, clipping, overlays, keyboard dismissal/focus return, and camera/motion gestures. Screenshots or browser notes support visual acceptance; a successful build cannot substitute for them.

QA is performed by a different agent/model where available, with its own issue/PR comment and exact-head reference. The first line is `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: INCOMPLETE`. Include contiguous fields `Head:`, `Agent:`, `Independence:`, and `Scope:` immediately below, followed by reproduction/evidence. INCOMPLETE means required evidence is missing or the run did not finish; it is not acceptance. QA must not repair the candidate. DEV addresses findings on the same branch and requests a new review. GUARD reviews scope, evidence, and exact-head state. A separate merge executor may merge with a merge commit only after GUARD approval and forge authorization.

## 5. Enforcement status

| Control | Status |
|---|---|
| Claims, PM ACK, scope, branch and handoff records | Manual forge protocol |
| Runtime/model/token provenance | Manual roster receipts; unknown remains unknown |
| Build, tests and lint | Existing project commands; run per task contract |
| UI, typography, accessibility and motion acceptance | Manual browser evidence at actual measured viewports |
| Planning schema, issue/PR binding, CI policy, release gate | Not implemented |

## 6. Current program boundaries

- The original web source candidate is frozen at `a48b67be53a10ff1ef062a066ad8082e2a7c93c8`, manifest `3017ea2f8796b54007f4e8a8d3b6516f63241b3e082e6fdcf95568a7ef208bc5`. Independent Sol QA recorded a bounded FAIL in design issue #4, comment `5928339099`: mixed-validity typo CSS and a vendor-token mutation survived the eight existing tests. Findings route to the separately assigned enforcement task; the frozen candidate must not be silently altered.
- The Kimi lane is enrolled for read-only reconstruction/review: requested Factory Droid / Kimi K3 / max; review nonce `iso-kimi-review01`; reported session `e2b52248-2ab1-410a-8b12-9a3d54eecc77`; provider is unknown. Enrollment comment `5928324563`, PM ACK `5928332364`. It remains disjoint from enforcement.
- Backend PR #1 is its own implementation lane. Preserve existing engine, route-selection, and production telemetry documentation while it is reviewed.
- GPUI is frozen; the cancelled replacement UX is not active.
- No automated planning metadata gate, CI issue-to-PR gate, or release gate is established by these documents.
