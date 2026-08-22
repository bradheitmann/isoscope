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
| `trace` | `["A-B",…]` | ordered story steps (edge keys) |
| `traceText` | `{"A-B":text}` | narration per step |

Semantics the engine renders for free: whole-building state color, circuit-breaker
click interaction, PCB-routed pipes, flow dots, 3-level stacking, trace narration,
18 IDE themes, fonts, line weights — all from this one object.
