# Harness adapters

Two ways for an AI agent to maintain the living map:

- **MCP-capable harness** (Claude Code, Codex, etc.): register `mcp.ts` —
  `{"command":"bun","args":["/path/to/isoscope/mcp.ts"],"env":{"ISOSCOPE_DB":"/path/to/project/isoscope.db"}}`.
  Seven tools; every call repaints any browser running `isoscope serve`.
- **Non-MCP harness** (DeepSeek CLIs and others): paste `DEEPSEEK.md` into the
  harness's system/context slot. It teaches the same operations through the CLI.
