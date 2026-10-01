# Isoscope agent rules

This file governs agent work in this repository. Read it, then the assigned GitHub issue and any files named by that issue. Read `planning/PLAYBOOK.md` before claiming or changing work. GitHub issue/PR state is the live authority for claims, assignment, freezes, review, and merge; local plans do not grant permission.

## Work authorization

- Work begins only after a first-wins `CLAIM` comment and an explicit PM `ACK` on the assigned issue. Include nonce, seat, exact base SHA, files read, and intended write scope. No ACK means no edits.
- Keep each task on an isolated branch from its recorded base. Write only the issue's approved scope. A changed scope or blocked contract requires a PM amendment before edits continue.
- Forge comments are authoritative for assignment and state. Chat reports, local files, and model output are informational until recorded and acknowledged in the forge.
- Never force-push, rebase published work, or squash. DEV does not merge its PR. GUARD reviews the exact approved head; a separate merge executor merges only after GUARD approval and forge authorization.

## Engineering and evidence

- Rust and strict TypeScript are approved implementation languages. TypeScript must pass `tsc --noEmit` with `strict: true`. Do not add plain JavaScript or Python.
- Preserve the existing engine, routing, and production telemetry contracts in `docs/`; planning documents do not supersede them.
- A passing build or lint is not product acceptance. Record exact commands, outcomes, commit SHA, and relevant artifact hashes. UI layout, typography, accessibility, and camera/motion behavior require separate observed evidence at named viewport dimensions.
- QA must be independent of implementation and review the exact candidate SHA. GUARD reviews the same final head after QA findings are resolved.
- Distinguish requested harness/model/reasoning/provider settings from observed runtime receipts. Unknown values remain `unknown`; never infer tokens, provider, model family, or completion from a requested configuration.
- Do not claim automated enforcement unless a checked-in executable gate exists and its run is evidenced. The initial planning protocol is manual.
- Every new task commit ends with one contiguous trailer block containing `Agent:`, `Seat:`, and `Issue:`; keep all trailer lines together with no blank lines between them.

## Current boundaries

- The original web candidate is frozen at `a48b67be53a10ff1ef062a066ad8082e2a7c93c8`; its published manifest is `3017ea2f8796b54007f4e8a8d3b6516f63241b3e082e6fdcf95568a7ef208bc5`. Review findings must be filed against the exact source. Editing or replacing this candidate requires a new PM-authorized task.
- GPUI is frozen. The cancelled replacement UX is not an active lane.
- The Kimi design lane is read-only review/reconstruction until a distinct implementation task is assigned and ACKed. Keep it separate from the enforcement task.
- The backend PR and design/web findings are tracked on the control issue; their status does not authorize changes to those scopes.
