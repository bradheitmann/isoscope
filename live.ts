/** Optional live HTTP application. Importing this module starts no listener or watcher. */
import { buildHtml } from "./build.ts";
import { open, exportSpec, blastRadius, markNode, normalizeCi, detectCiProvider, applyCi } from "./lib.ts";
import { listenSecuredLive, secureLiveFetch } from "./live-security.ts";
import type { DeploymentProfile } from "./deployment.ts";
export { listenLive, secureLiveFetch } from "./live-security.ts";
export { parseServeOptions, deploymentProfile, type DeploymentProfile } from "./deployment.ts";

/** Database existence/lifecycle belongs to the caller; each request closes its own handle. */
export function createLiveApplication(dbPath: string, options: { token?: string; profile?: DeploymentProfile } = {}) {
  const readSpec = () => { const db = open(dbPath); try { return exportSpec(db); } finally { db.close(); } };
  const clients = new Set<ReadableStreamDefaultController>();
  // The unguarded router stays private. Every public fetch and listener shares
  // this one validated policy and one-use browser session.
  const secured = secureLiveFetch(async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/spec.json")
      return Response.json(readSpec());
    if (url.pathname === "/blast-radius") { const d = open(dbPath); try { return Response.json(blastRadius(d)); } finally { d.close(); } }
    if (url.pathname === "/mark" && req.method === "POST") {
      /* Authenticated local adapter: POST {id,state?,items?:[{c,l}]} */
      return req.json().then((b: any) => {
        if (!b || typeof b.id !== "string" || (b.state !== undefined && typeof b.state !== "string") ||
            (b.items !== undefined && (!Array.isArray(b.items) || b.items.length > 1000 ||
              b.items.some((item: unknown) => !item || typeof item !== "object" ||
                typeof (item as { c?: unknown }).c !== "string" || typeof (item as { l?: unknown }).l !== "string"))))
          return new Response("invalid mark payload", { status: 400 });
        const d = open(dbPath);
        if (!d.query("SELECT 1 FROM nodes WHERE id=?").get(b.id)) { d.close(); return new Response("no such module", { status: 404 }); }
        try { markNode(d,{ id: b.id, state: b.state, items: Array.isArray(b.items) ? b.items : undefined }); }
        finally { d.close(); }
        return Response.json({ marked: b.id });
      });
    }
    if (url.pathname === "/ci" && req.method === "POST") {
      /* Normalized events from a trusted bearer-authenticated adapter, not a public webhook receiver. */
      if (req.headers.has("x-github-event") || req.headers.has("x-gitlab-event") || req.headers.has("x-buildkite-event"))
        return new Response("direct provider webhooks are not supported; verify signatures in an authenticated adapter", { status: 400 });
      const provider = url.searchParams.get("provider") ?? detectCiProvider(req.headers);
      if (!provider) return new Response("provider? (?provider=github|gitlab|buildkite|signal or provider event header)", { status: 400 });
      return req.json().then((b: any) => {
        let events; try { events = normalizeCi(provider, b); } catch (e: any) { return new Response(e.message, { status: 400 }); }
        const d = open(dbPath);
        try { return Response.json({ provider, events: events.length, ...applyCi(d, events) }); }
        finally { d.close(); }
      });
    }
    if (url.pathname === "/events") {
      let ctrl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(c) { ctrl = c; clients.add(c); c.enqueue("event: hello\ndata: {}\n\n"); },
        cancel() { clients.delete(ctrl); },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }
    const html = buildHtml(readSpec(), { specLabel: dbPath })
      .replace("<head>", "<head>\n<script>window.__ISOSCOPE_LIVE=1<\/script>");
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }, options.token, { profile: options.profile });
  return {
    bootstrapCode: secured.bootstrapCode,
    fetch: secured.fetch,
    listen(port: number) { return listenSecuredLive(secured, port); },
    notify() {
      for (const client of clients) {
        try { client.enqueue("event: update\ndata: {}\n\n"); } catch { clients.delete(client); }
      }
    },
    close() {
      for (const client of clients) { try { client.close(); } catch {} }
      clients.clear();
    },
  };
}
