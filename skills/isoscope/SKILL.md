---
name: isoscope
description: Use Isoscope, the isometric system map, as the shared picture between agents and the operator. Use it when you explain a system or a decision to the operator, when you need the operator to decide something, when you show the current state of a system or of work in progress, and when you build or update an Isoscope map or spec. It covers three uses. As a state tracker, agents keep a graph store current. As an observability layer, CI and telemetry paint the map. As a presentation layer, a static decision-explainer map is built from a hand-written spec, and you ask the question in plain chat.
---

# Isoscope

Isoscope draws a system as an isometric city. Parts are buildings, connections are pipes that say what flows through
them, and status is painted on the buildings. It gives agents and the operator a common visual language and one basic
level of abstraction. The operator can see the parts, how they connect and what is open without reading internal
jargon, and agents can point at the same picture.

All commands below run from an Isoscope checkout (`<isoscope>`). A map is one self-contained HTML file built from one
JSON spec; the spec keys are listed in `<isoscope>/SPEC.md`.

## Three uses

1. **State tracker.** A SQLite graph store holds the nodes, links and open items. Agents keep it current while they
   work, through the MCP server (`mcp.ts`, tools such as `iso_upsert_node`, `iso_upsert_edge`, `iso_set_status`) or
   through the CLI (`bun cli.ts import`, `bun cli.ts mark`, `bun cli.ts build`). The map shows what exists, what is
   blocked and what is next.
2. **Observability layer.** Pipelines write to the same store. Failing CI jobs turn their module red (`bun cli.ts ci`),
   scanner findings are attributed by file path (`bun cli.ts ingest`), and sensor offers mark where a trace boundary
   could go (`iso_propose_sensor`). The map shows where the running system is broken.
3. **Presentation layer.** A static map, built from a spec you write for one purpose, explains a system or a decision
   to the operator. It is not tied to a store and it changes nothing. The main form is the decision explainer:
   `references/decision-explainer.md` describes its anatomy, and `examples/decision-explainer.spec.json` is a worked
   example the operator approved. Both files sit in this skill's folder and travel with it when the skill is installed.

## When you must use the presentation layer

- **Any question that needs a principal decision.** If the answer changes what gets built or accepted, or what the
  operator is committed to, build an explainer map first and ask second. A question asked in internal jargon, without
  the picture, is one the operator may not be able to answer.
- **Any explanation of parts the operator has not seen.** New components, a new flow, or a gap between what exists
  and what a plan assumes all get a map.

A short factual status reply ("the build passed") does not need a map.

## Build and open a map

```bash
bun <isoscope>/build.ts <spec.json> <out.html>
open -a "Google Chrome" <out.html>          # macOS; any browser opening the file works
```

- The output is a static file that works from disk (`file://`) with no server and no network.
- Do not run `bun cli.ts serve` for presentation. Stock `serve` has endpoints that change the store (`POST /mark`,
  `POST /ci`); they are unauthenticated unless `ISOSCOPE_TOKEN` is set. Never expose stock `serve` beyond your own
  machine without changes.
- Build with the template on Isoscope's main branch. The paused redesign template (branch
  `codex/isoscope-ui-redesign-v1`) crashes on specs that are not PlanGraph specs (`ReferenceError` on `COPY_RULES`).

## Where outputs go

By default, write the spec and the HTML to the task's evidence folder, or to an `out` folder outside the repository
you are working in. Never write them into a product repository's tracked tree. Name both with a UTC stamp and a short
topic, for example `20260923T0350Z-label-question.spec.json` and `20260923T0350Z-label-question.html`. Isoscope's own
`out/` is ignored by git and is fine for building Isoscope's examples.

## Verify before you show

```bash
bun <isoscope>/scripts/shot.ts <out.html> <out.png> 1440 900
```

The camera loads the page in headless Chrome, removes the intro veil and saves a screenshot. It exits 1 on any
uncaught exception or `console.error`. Show the operator a map only after a zero-error shot, and look at the shot
yourself: labels, groups and metric cells should read as intended. The camera uses a fixed debugging port (9336) with a
fresh per-run Chrome profile (a temp dir removed on exit), so run one shot at a time because of the port. If your process rules restrict where
temporary files may go, set `TMPDIR` to an allowed directory.

## The ask protocol

1. Build the map, verify it, and open it for the operator.
2. Ask in plain chat. The intro prose ends with exactly the reply you need (for example "reply OK to proceed, or stop
   to leave it unchanged"); repeat that request in your message.
3. Act only on the operator's typed answer. Silence or an ambiguous reply is not an answer; ask again.
4. Never use an interactive dialog, menu or picker to ask while other agents deliver keystrokes to your terminal. A
   keystroke meant for something else can select an option.
5. Record the typed answer verbatim with the decision: the question, the map path and the spec's sha256, the answer
   exactly as typed, and the UTC time.

## Keep it current

When a number, a state or an option changes, edit the spec, rebuild, re-shoot and reopen the map. Never leave a
stale page as the one the operator sees; if you cannot rebuild, tell the operator the page is out of date.

## Copy rules

Write every node, link and prose text in plain language. Define each term on first use, give every internal
identifier a plain gloss, and avoid the operator's banned words. The full rules are in
`references/decision-explainer.md`.
