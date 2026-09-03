# Harness adapters

Isoscope ships an MCP server (`mcp.ts`, nine tools, zero dependencies). Every
tool call repaints any browser running `isoscope serve`.

- **MCP-capable harness** (Claude Code, Codex, Cursor, Zed, …): register
  `mcp.ts` —
  `{"command":"bun","args":["/path/to/isoscope/mcp.ts"],"env":{"ISOSCOPE_DB":"/path/to/project/isoscope.db"}}`.
  `mcp.json` here is that config as a file, ready to edit.
- **DeepSeek Harness (dsh)**: also MCP-capable, but it composes profiles from
  cordis patch layers rather than an `mcpServers` block — see `DSH.md` and
  `dsh.cordis.patch.yml`.
- **No MCP client at all**: paste `DEEPSEEK.md` into the harness's
  system/context slot. It teaches the same operations through the CLI.
- **lumbr (or any telemetry/remediation system)**: `LUMBR.md` — signals in
  via `POST /ci?provider=signal`, the remediation scope out via
  `GET /blast-radius`.

The server runs under **bun only** — the graph store uses `bun:sqlite`, so there
is no Node entry point and `npx` will not work. Use absolute paths; harnesses do
not expand `~`.
