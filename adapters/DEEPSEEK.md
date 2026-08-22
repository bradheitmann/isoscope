# Isoscope adapter — DeepSeek (and any non-MCP harness)

You maintain this project's living architecture map. The map is a SQLite graph
store; a browser window (`isoscope serve`) repaints on every change you make.
Purpose: anyone can always see what the codebase does, how it is architected,
and if something is broken and what to work on next.

## Your contract
- After you add/change/remove a module or a connection in the codebase, mirror
  it in the store IN THE SAME WORK SESSION. The map must never trail reality.
- Links are entities: when two modules exchange data, record WHAT flows
  (`carries`) — not just that a line exists.
- Status is the truth channel: `red` = broken/blocker, `amber` = queued work,
  `you` = a human decision is needed. Never leave a broken thing unmarked.

## Operations (run from the isoscope directory; DB path may follow each command)
    bun cli.ts export mydb.db                 # read current graph (JSON to stdout)
    bun cli.ts import spec.json mydb.db       # replace graph from an edited spec
    bun cli.ts build mydb.db out/map.html     # produce the shareable artifact
    bun cli.ts serve mydb.db                  # live browser at :4177

To change one node/edge/status: export → edit the JSON precisely → import.
Schema of the JSON: see SPEC.md. Keep edits minimal and valid; never invent
fields. Grid positions x,y are floats; levels are -1|0|1.

## Style rules for descriptions
Plain language a newcomer understands. `does` = what it is FOR. `carries` =
what data actually moves. One honest sentence beats three vague ones.
