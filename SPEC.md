# Isoscope spec schema (v0)

One JSON object drives the whole visualization. All keys top-level.

| key | type | meaning |
|---|---|---|
| `title` | string | browser tab title |
| `brand` | `{k,v}` | top-left identity cell (e.g. Package / my-app · service) |
| `metrics` | `[{k,v}]` | headline metric cells in the topbar |
| `wordmark` | string | footer wordmark |
| `asOf` | string | provenance line in the sidebar key |
| `intro` | `{eyebrow,title,sub,proseHTML}` | overview panel content (proseHTML is trusted HTML) |
| `groups` | `[{id,label}]` | sidebar sections, in display order |
| `nodes` | `[{id,tag,g,name,x,y,w,d,h,stack?,does,built,refs,good?,cond?}]` | modules; x/y grid coords, w/d/h size, `stack` = sliced floors |
| `short` | `{id:label}` | 1–2 word map labels (full name lives in the inspector) |
| `status` | `{id:{state,items:[{c:"red"\|"amber"\|"you",l}]}}` | state `ok\|attn\|build`; any red item forces blocked |
| `levels` | `{id:-1\|0\|1}` | stratum per module for Stack mode (max 3 levels) |
| `edges` | `[[from,to,type]]` | type `data\|auth\|intended` |
| `edgeStatus` | `{"A-B":"degraded"\|"broken"}` | link health overrides |
| `edgeDocs` | `{"A-B":{title?,carries?,refs?}}` | links are entities: click/hover a link for its inspector — `carries` explains what data flows over it |
| `trace` | `["A-B",…]` | ordered story steps (edge keys) |
| `traceText` | `{"A-B":text}` | narration per step |
| `paths` | `{id:[prefix,…]}` | path ownership for finding attribution (`cli.ts ingest`, SARIF); longest prefix wins, `file.ts:symbol` allowed |
| `telemetry` | `{id:{trace_boundary,event_stream?,wide_event_keys?,installed_by?,offered_at?,verified_at?,rationale?}}` | seams→sensors binding per module; `trace_boundary` ∈ proposed·offered·installed·verified·declined (docs/INSTRUMENTATION.md) |
| `ci` | `{jobs:{"job name or glob*":id}, default?:id}` | CI job → module mapping for `cli.ts ci` / `POST /ci` (GitHub Actions, GitLab, Buildkite); fallbacks: node id/short/tag; path-bearing events use `paths` |
| `drcBudget` | `{maxWeightedCrossings, acknowledged?}` | the L2 law's "unless forced" clause, machine-checkable: `drc.ts` fails over budget |

Semantics the engine renders for free: whole-building state color, circuit-breaker
click interaction, PCB-routed pipes, flow dots, 3-level stacking, trace narration,
18 IDE themes, fonts, line weights — all from this one object.
