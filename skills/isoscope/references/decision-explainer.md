# The decision explainer

A decision explainer is an Isoscope map built to help the operator make one decision. It shows where the evidence
comes from, how the options or cases split, and what each choice unblocks or affects. The intro prose then says what
reply is needed. The worked example is `../examples/decision-explainer.spec.json`, in this skill's `examples/`
folder: a real explainer that let the operator answer a spec question that had gone unanswered while it was asked in
internal jargon. Build it with `node <isoscope>/build.mjs <skill>/examples/decision-explainer.spec.json <out.html>`
(from an Isoscope checkout: `node build.mjs skills/isoscope/examples/decision-explainer.spec.json
out/decision-explainer.html`) and read it next to this page.

## Layout: three groups, left to right

Declare exactly three `groups`, in this order. Place their nodes in three columns with the node `x` coordinate. Nodes
in one column share `x`, and `y` spreads them down the column.

| Group | Holds | In the example (`x`) |
| --- | --- | --- |
| 1. Where answers come from | the sources of evidence or authority: written rules, data, reviews | "Where answers come from" (`x` 0): spec text, worked examples, independent second opinion |
| 2. The thing being decided | the question, split into its options or cases, one node each | "The 141 reference fields" (`x` 4): 5 stated, 27 strong, 85 weak, 10 vary, 14 unknown |
| 3. What each choice unblocks or affects | the parts downstream of the decision | "What an answer unblocks" (`x` 8): the pg-core check, the typed records, the pg-ledger storage test |

Keep columns about four grid units apart so pipes have room. Give every node the same footprint (`w` 1.2, `d` 1,
`h` 1 in the example) unless size itself carries meaning. Split the middle group so that its parts add up to the whole
(5 + 27 + 85 + 10 + 14 = 141 in the example); the reader should be able to check the arithmetic on the map.

## Nodes

| Key | What to write |
| --- | --- |
| `name` | the plain name of the part, as the operator would say it |
| `short` | a 1-2 word map label ("Stated", "Weak", "pg-core") |
| `tag` | a short uppercase badge; if it holds a number, keep it in step with `name` and `metrics` |
| `does` | what the part is or does, in plain language |
| `built` | what happens to it under the decision, or its current state |
| `status` | the state (`ok`, `attn`, `build`) and one open item per node where something is pending |

Item colours (`status.<id>.items[].c`): `red` means blocked, `amber` pending or provisional, `you` a decision that
waits on the operator (shown as YOUR CALL), and `planned` renders as a hollow marker. Any other value renders as a
neutral marker; the example uses `shipped` and `built` that way as plain labels.

## Links carry meanings

Every edge needs an `edgeDocs` entry keyed `"FROM-TO"` with a `title`, `carries` (what passes along the link, in plain
words) and `refs` (where that comes from). A link without a meaning is a line the operator has to guess at. Link types
show how firm the link is:

- `data`: evidence or results that flow now, for example "Same label in every example, two or more example families."
- `auth`: authority or a ruling that shapes the target, for example the second opinion that decided which evidence is
  weak.
- `intended`: what would flow if the decision goes one way, drawn as planned.

`trace` and `traceText` are optional: an ordered walk along the main path, one plain sentence per step.

## Metrics carry the numbers

Put the headline numbers in `metrics` (`[{k, v}]`) so they sit in the top bar: the size of the question and the count
for each outcome. The `brand` cell names what is being decided (`{"k": "Decision", "v": "field-domain table in the
spec"}`). At 1440 px wide the top bar fits the brand cell and about two metric cells on one row, and further cells
wrap onto a second row, so keep values short. Use `asOf` for provenance: when the numbers were taken and from what.

## Intro prose, in this order

`intro.eyebrow` is "Decision explainer". `intro.title` is the question in plain words. `intro.sub` says how to read
the map ("Left column: where answers come from. Middle: ... Right: what the answer unblocks."). `intro.proseHTML` has
one paragraph per step, with a bold lead-in:

1. **What the thing is.** Define the subject before anything else ("What a reference is.").
2. **The gap or choice.** What is missing or undecided, and what that blocks today.
3. **What the evidence shows.** Counts from each source, including what the evidence does not settle.
4. **The options and their effects.** Each option, and what it would change.
5. **The recommendation and why.** Say which option you recommend and the reason, including any review that shaped it.
6. **Exactly what reply is needed.** The literal words to type and what each does (the example: "Reply in chat: OK
   to proceed with this safer plan, or stop to leave the spec unchanged").

The example merges steps 4 and 5: "The plan now" gives the recommended option and why, "The numbers" gives its
effects, and "What I need from you" states both replies and what each does.

`proseHTML` is trusted HTML: escape apostrophes and angle brackets (`&#39;`, `&lt;`), and do not paste untrusted text
into it.

## Copy rules

- Define every term the first time it appears, in the prose or in the node's `does` text.
- Give every internal identifier a plain gloss ("pg-core (the foundation that checks every record)"). Node ids stay
  internal; the operator reads `name`, `short`, `does` and `built`.
- Use plain sentences; prefer counts to adjectives.
- Do not use the operator's banned words: honest, honestly, load-bearing, delve, seamless, robust, genuinely, truly,
  nuanced, "it's worth noting", "at its core", "in essence", tapestry, journey, elevate, leverage (as a verb), crisp,
  "single source of truth".

## Update rule

When a number, a state or an option changes, update every place it appears (`name`, `tag`, `does`, `built`,
`metrics`, the prose), rebuild, re-shoot and reopen the page. Never leave a stale page as the one the operator sees.
The example's tags were corrected from "3 FIELDS" and "12 VARY" to "5 STATED" and "10 VARY" for this reason: its
names and metrics had moved on and its tags had not.

## Checklist before you show it

- Three groups, left to right; the middle group's parts add up to the whole.
- Every node has `does`, `built` and a status; every edge has an `edgeDocs` meaning.
- The numbers in names, tags, metrics and prose agree.
- The prose follows the six steps and ends with the exact reply needed.
- The copy rules pass: terms defined, identifiers glossed, no banned words.
- `node build.mjs` succeeds and `bun scripts/shot.ts <html> <png> 1440 900` reports zero JS errors.
- Then follow the ask protocol in `../SKILL.md`: show, ask in plain chat, act only on the typed answer, record it
  verbatim.
