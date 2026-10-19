# Capability deployments

Isoscope 0.2.0 keeps the full product as the default. Capability entry points let
Bun applications reuse the graph and renderer without launching CLI commands,
MCP stdio, an HTTP server, a watcher, or creating a store during import.

| Entry point | Capability | Starts services on import |
|---|---|---|
| `isoscope` / `isoscope/graph` | Existing SQLite store, history, CI normalization, sensor and incident analysis API | No |
| `isoscope/render` | `buildHtml(spec, options?)`, self-contained HTML | No |
| `isoscope/live` | HTTP route application, authenticated loopback listener, deployment options | No |
| `isoscope/safe-html` | Canonical allowlist sanitizer shared by both viewers | No |

These are TypeScript source exports for Bun, matching the existing runtime. The
graph entry has no renderer dependency; the renderer has no SQLite or live-server
dependency. Existing direct file imports and CLI/MCP commands remain supported.

## Headless graph and static rendering

```ts
import { open, exportSpec, blastRadius } from "isoscope/graph";
import { buildHtml } from "isoscope/render"; // omit for graph-only consumers

const db = open("my.db");
try {
  const spec = exportSpec(db);
  console.log(blastRadius(db));
  await Bun.write("out/map.html", buildHtml(spec));
} finally {
  db.close();
}
```

A static artifact needs no running service, authentication cookie or database.
Its graph is a snapshot, refreshed by rebuilding. Live freshness is writer driven;
`asOf` is authored context, not attested telemetry freshness.

## Full and read-only live deployments

```sh
bun cli.ts serve my.db                           # full, unchanged default
bun cli.ts serve my.db --profile full            # explicit full
bun cli.ts serve my.db --profile read-only       # viewer, graph, incident scope, SSE
```

Both profiles require authentication on all graph reads and enforce the same
loopback binding, host/origin checks, one-use browser handoff, and body limits.
Read-only rejects **every non-GET/HEAD request** before route dispatch, including
`/mark`, `/ci`, unknown paths and future write routes. External writers can still
update the store; the live viewer continues to receive change notifications.
This is an HTTP capability boundary, not filesystem access control: local CLI,
MCP, and processes with database access retain their existing write capabilities.
Use a filesystem-isolated snapshot if local write prevention is required.
Unknown profiles, missing/duplicate options, invalid ports and unknown flags fail
before the CLI starts a listener or creates a store.

Embedding owns lifecycle explicitly:

```ts
import { createLiveApplication } from "isoscope/live";

const application = createLiveApplication("my.db", {
  token: Bun.env.ISOSCOPE_TOKEN, profile: "read-only",
}); // use an existing graph store
const { server, bootstrapCode } = application.listen(4177);
console.log(`http://127.0.0.1:${server.port}/session?code=${bootstrapCode}`);
// Call application.notify() after an external writer commits, or attach your watcher.
// During shutdown:
application.close();
await server.stop(true);
```

The application keeps its raw router private. `application.listen(port)` binds the
same authenticated, policy-checked handler as `application.fetch(request, port)`;
the latter requires the trusted transport’s actual listening port for host checks.
A listener cannot override the application’s profile or create a divergent session.
The lower-level `listenLive` and `secureLiveFetch` exports remain available when
embedding custom routes, with the same mandatory authentication and body bounds.
Programmatic callers may select only `full` or `read-only`; invalid runtime values
throw rather than enabling mutations.
