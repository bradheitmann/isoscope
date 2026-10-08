# Isoscope — right-hand-side information architecture

A first-principles redesign of everything that lives beside the map.

## 1. The total shape of the information

Everything the product can show a person (or an agent) decomposes into exactly four
scopes, distinguished by *what they are about* and *how long they live*:

| Scope | What it is | Lifetime | Cardinality |
|-------|-----------|----------|-------------|
| **Map** | The city itself — modules, flows, state. The primary object. | always present | one |
| **Object detail** | One selected thing (a module or an edge): its materials, notes, files, tags, telemetry. | while selected | one at a time |
| **System overview** | Orientation when nothing is selected: the navigator, map key, health summary, what's new. | idle default | one |
| **Live stream** | The wide-event telemetry feed — ambient, glanceable, dismissible. | continuous | one |
| **Transport** | The media player's play/pause/playlist. | while media plays | one |

The bug in the current design is that three of these — overview (the resizable
drawer), live stream (the floating feed), and object detail (the right modal) — are
three *separate physical surfaces* fighting for the same right edge. They overlap,
cover each other, and each has its own open/close logic. That is the disaster.

## 2. First-principles conclusion: one surface, four states

The right-hand side should be **a single panel** — one physical surface with a fixed
home — whose *content* swaps among the scopes. Never two right-side surfaces at once.

- **Overview is the default.** Nothing selected → the panel shows the navigator, the
  map key, a system-health summary, and recent activity. This replaces the drawer.
- **Selection narrows the same panel.** Selecting a module/edge swaps the panel's
  content to that object's detail (materials, notes, telemetry) with a back affordance
  to overview. The detail *replaces* the overview in place; it does not pop over it.
- **The live stream is a section, not a float.** Telemetry is a collapsible section at
  the *bottom* of the panel (or a tab within it). It never covers the map or the detail.
- **Transport stays out of the panel.** The speaker button + its popover remain a
  bottom-left control; it is a player, not a document.

The panel resizes, but it is *one* thing. The map never gets covered by a second
surface; it only ever shares space with the single panel (which on phones is a sheet).

## 3. The panel's internal anatomy (top → bottom)

1. **Context header** — what you're looking at: "Map overview" or the selected
   module's name + tag pills. A back chevron when in detail. Close/peek control.
2. **Health strip** (always visible) — a one-line live summary: N flows traced ·
   M need attention · worst offender. This is the ambient observability read.
3. **Content region** (scrolls) —
   - *Overview:* search + navigator, map key, about.
   - *Detail:* the selected object's tag pills, materials, notes, inside files, and a
     **telemetry section** (that object's live event rate, latency p50/p95, errors,
     recent crossings).
4. **Telemetry stream** (collapsible footer) — the wide-event feed, filterable,
   each row a real crossing; clicking a row flies to that edge.

## 4. Agent experience (AX) — how machines reach this

A human reads the panel; an agent must not. Agents get the same truth through stable,
documented machine surfaces — no screen-scraping, no guessing at the DOM:

- **`GET /api/telemetry/health`** — per-edge aggregates (total, errors, avg latency,
  last crossing). The "is anything wrong" poll.
- **`GET /api/telemetry/attention`** — the current offenders: broken/degraded edges
  with their metrics, sorted by severity. An agent polls ONE endpoint to find what to
  act on. This is the primary AX hook.
- **`GET /api/telemetry?edge=&status=&since=&limit=`** — the raw wide events, queryable.
- **`GET /api/annotations`** — the per-module records (notes, files, faces).
- **`window.odinView`** — programmatic control + state for an agent driving the live
  page: `state()`, `edgeHealth()`, `attention()`, `inspect(id)`, `viewFace(id,face)`,
  `media.*`. An agent can read state and steer the view without a human.
- **Deep links** — `#/module/TP` or `#/edge/DB-SV` opens that object's detail panel,
  so an agent (or a log line, or an alert) can point a human at the exact thing.

The rule: **every piece of information a human can see in the panel is reachable by an
agent through an endpoint or a documented window hook.** The panel is a view; the API
is the truth. An agent that finds an issue in `/api/telemetry/attention` can read the
raw events, open the module's record, and hand a human a deep link — the full loop.

## 5. What gets removed

- The floating telemetry feed that hovered over and blocked the drawer. → becomes the
  panel's collapsible footer section.
- The right modal that popped over everything on double-click. → becomes the panel's
  in-place detail state.
- The separate resizable reading-panel drawer as a competing surface. → becomes the
  panel's overview state.

One surface. Four states. Nothing overlaps.
