# Isoscope in the DeepSeek Harness (dsh)

dsh speaks MCP natively — it ships `@deepseek-ai/dsh-mcp-client`, which connects
to an MCP server and registers its tools on `ctx.tools` under
`mcp__<serverName>__<rawName>`. So isoscope plugs in as a real tool surface, not
as pasted prose. Verified against dsh 0.1.1-rc.2.

## Install

dsh composes each profile from bundle layers, then your own `cordis.patch.yml`.
Add one plugin instance per MCP server to the patch layer of the profile you
boot (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: mcp-isoscope
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: isoscope
    transport: stdio
    command: bun
    args: ['/absolute/path/to/isoscope/mcp.ts']
    env:
      ISOSCOPE_DB: /absolute/path/to/your-project/isoscope.db
```

`adapters/dsh.cordis.patch.yml` in this repo is the same entry as a copyable
file. Both paths must be absolute — the plugin spawns the command directly, and
`~` is not expanded.

Confirm it composed before booting:

```sh
dsh --profile web --dump-config | grep -A6 mcp-isoscope
```

The model then sees `mcp__isoscope__iso_overview`,
`mcp__isoscope__iso_upsert_node`, and the rest of the nine tools. Editing the
entry hot-swaps the connection; an unchanged `serverName` reproduces identical
tool names.

## Why `bun` and not `npx`

The graph store uses `bun:sqlite`, so the server runs under bun only — there is
no Node entry point to `npx`. bun must be on the PATH dsh inherits. If dsh
reports the command as missing, use bun's absolute path (`which bun`) instead of
the bare name.

## One database per project

`ISOSCOPE_DB` is the whole binding. Point each profile — or each project you
work in — at that project's own `isoscope.db`. The file is created on first
write, so a fresh project needs no setup step.

Pair it with `isoscope serve` in another pane: every tool call repaints the
open browser, so the map updates while the agent works.

## The contract for the agent

Tools alone do not keep a map honest; the working agreement does. Put this in
the profile's persona or system layer:

- After adding, changing, or removing a module or a connection in the codebase,
  mirror it in the store **in the same work session**. The map must never trail
  reality.
- Links are entities: when two modules exchange data, record **what** flows
  (`carries`), not merely that a line exists.
- Status is the truth channel: `red` = broken or blocking, `amber` = queued
  work, `you` = a human decision is needed. Never leave a broken thing unmarked.
- Plain language in `does` and `carries`. One honest sentence beats three vague
  ones.

For harnesses with no MCP client at all, `DEEPSEEK.md` teaches the same
operations through the CLI.
