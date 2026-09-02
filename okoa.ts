#!/usr/bin/env bun
/* okoa.ts — thin CLI for the hosted OKOA Design MCP server (streamable HTTP).
   Usage: bun okoa.ts <tool> [json-args]        e.g. bun okoa.ts okoa_status
          bun okoa.ts okoa_quality_check '{"content":"...","media":"web"}'
   Prints the tool's text result. Fresh MCP session per invocation.            */
const URL_ = "https://okoa-design-mcp.okoalabs.workers.dev/mcp";
const H = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
  "User-Agent": "isoscope-bun/1.0",
  "mcp-protocol-version": "2025-03-26",
  // set per-call:
  ...( {} as Record<string, string> ),
};
let sid = "";
let nextId = 1;

async function rpc(method: string, params?: unknown): Promise<any> {
  return request({ jsonrpc: "2.0", id: nextId++, method, params });
}
async function notify(method: string, params?: unknown): Promise<void> {
  await request({ jsonrpc: "2.0", method, params }); // no id — a notification
}
async function request(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { ...H, ...(sid ? { "mcp-session-id": sid } : {}) },
    body: JSON.stringify(payload),
  });
  const newSid = res.headers.get("mcp-session-id");
  if (newSid) sid = newSid;
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
  for (const line of raw.split("\n")) {
    if (line.startsWith("data: ")) {
      const msg = JSON.parse(line.slice(6));
      if (msg.error) throw new Error(`MCP error ${msg.error.code}: ${msg.error.message}`);
      return msg.result;
    }
  }
  return null; // notification ack or empty
}

async function main() {
  const [tool, argsRaw] = Bun.argv.slice(2);
  if (!tool) { console.error("usage: bun okoa.ts <tool> [json-args]"); process.exit(2); }
  const args = argsRaw
    ? (argsRaw.startsWith("@")
        ? JSON.parse(await Bun.file(argsRaw.slice(1)).text())   // @file.json
        : JSON.parse(argsRaw))
    : {};
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "isoscope", version: "0.1.0" },
  });
  await notify("notifications/initialized");
  const result = await rpc("tools/call", { name: tool, arguments: args });
  for (const c of result?.content ?? []) if (c.type === "text") console.log(c.text);
  if (!result?.content?.length) console.log(JSON.stringify(result ?? null));
}
main();
