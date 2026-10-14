# Task contracts

Contracts are human-readable scope and acceptance records, not executable gates. Copy the template for a task, bind it to the full base SHA, obtain PM ACK before editing, and bind acceptance evidence to the exact final SHA.

```yaml
id: replace-with-issue-id
issue: replace-with-url
status: proposed
base_sha: replace-with-full-sha
owner: unassigned
claim_nonce: null
read_scope: []
write_scope: []
dependencies: []
acceptance:
  - criterion: replace-with-observable-outcome
    evidence: required
qa: { independent: true, exact_head_sha: null, verdict: pending }
guard: { exact_head_sha: null, verdict: pending }
```

## Current planning task

```yaml
id: ISO-PLAN-001
issue: https://github.com/bradheitmann/isoscope/issues/3
status: candidate
base_sha: bebb50d23ccee91cefc082b71f19f159fb53ac15
owner: iso-plan01
claim_nonce: iso-plan01
read_scope: [README.md, docs/HANDOFF.md, docs/DESIGN-RULES.md, docs/INSTRUMENTATION.md, "Leitting PLAYBOOK parts 0 and 20"]
write_scope: [AGENTS.md, "README.md coordination pointer", planning/**]
dependencies: []
acceptance:
  - criterion: Only planning docs and README pointer changed
    evidence: git diff path review
  - criterion: Manual protocol is distinguished from executable enforcement
    evidence: playbook review
  - criterion: Requested settings are separate from verified receipts
    evidence: roster review
  - criterion: Current lanes and freezes match forge readback
    evidence: handover review
qa: { independent: true, exact_head_sha: null, verdict: pending }
guard: { exact_head_sha: null, verdict: pending }
```
