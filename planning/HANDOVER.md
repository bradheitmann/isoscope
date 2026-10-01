# Isoscope handover

Control: [issue #2](https://github.com/bradheitmann/isoscope/issues/2). Planning setup: [issue #3](https://github.com/bradheitmann/isoscope/issues/3). Current base for this planning candidate: `bebb50d23ccee91cefc082b71f19f159fb53ac15`.

## Active lanes

- **Web:** frozen candidate `a48b67be53a10ff1ef062a066ad8082e2a7c93c8`, manifest `3017ea2f8796b54007f4e8a8d3b6516f63241b3e082e6fdcf95568a7ef208bc5`. Independent Sol QA reported bounded FAIL on design issue #4 (comment `5928339099`): mixed-validity typo CSS and vendor-token mutation survived eight existing tests. Do not edit the frozen candidate.
- **Enforcement:** issue #5 assigned to `iso-enforce01` (requested Codex/gpt-6-luna/high/OpenAI); claim `5928361982`, PM ACK `5928370017`. This lane is separate from Kimi reconstruction/review.
- **Design:** issue #4 Kimi review is read-only. Enrollment `5928324563`, PM ACK `5928332364`; nonce `iso-kimi-review01`; requested Kimi K3/max and reported session `e2b52248-2ab1-410a-8b12-9a3d54eecc77`; provider unknown.
- **Backend:** PR #1 is a separate lane. Re-read its exact current head and independent review/check state from GitHub before action; roster stores the earlier reported head only as a stale reference.

## Frozen and deferred

GPUI remains frozen. The cancelled replacement UX is not an active lane. No planning metadata, CI issue-to-PR, or release gate is implemented by this documentation. Preserve existing engine, routing, and production telemetry contracts.

## Next steps

Read live issues before acting. Keep visual acceptance separate from build/lint results; cite actual viewport dimensions, exact candidate SHA, and artifact evidence. Planning PR review and merge remain with independent QA and GUARD.
