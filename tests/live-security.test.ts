import { describe, expect, test } from "bun:test";
import { listenLive, secureLiveFetch } from "../live-security.ts";

const token = "synthetic-local-test-token-with-32-characters";
const port = 4177;
const url = `http://127.0.0.1:${port}`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

describe("live server trust boundary", () => {
  test("all graph reads and writes require authentication", async () => {
    let calls = 0;
    const live = secureLiveFetch(() => { calls++; return Response.json({ graph: "private" }); }, token);
    for (const path of ["/", "/spec.json", "/blast-radius", "/events", "/mark", "/ci"]) {
      const request = new Request(url + path, path === "/mark" || path === "/ci" ? { method: "POST", body: "{}", headers: { "content-type": "application/json" } } : {});
      expect((await live.fetch(request, port)).status).toBe(401);
    }
    expect(calls).toBe(0);
    expect((await live.fetch(new Request(url + "/spec.json", { headers }), port)).status).toBe(200);
  });

  test("rejects hostile origins, DNS rebinding hosts and simple-content-type writes", async () => {
    const live = secureLiveFetch(() => new Response("ok"), token);
    expect((await live.fetch(new Request(url, { headers: { ...headers, origin: "https://untrusted.invalid" } }), port)).status).toBe(403);
    expect((await live.fetch(new Request(url, { headers: { ...headers, host: "untrusted.invalid:4177" } }), port)).status).toBe(403);
    expect((await live.fetch(new Request(url + "/mark", { method: "POST", body: "{}", headers: { ...headers, "content-type": "text/plain" } }), port)).status).toBe(415);
  });

  test("enforces the stream limit without trusting Content-Length", async () => {
    let calls = 0;
    const live = secureLiveFetch(() => { calls++; return new Response("ok"); }, token);
    const request = new Request(url + "/mark", { method: "POST", headers, body: "x".repeat(65537) });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await live.fetch(request, port)).status).toBe(413);
    expect(calls).toBe(0);
  });

  test("browser handoff is one-use and authenticates with an HttpOnly session cookie", async () => {
    const live = secureLiveFetch(() => new Response("private"), token);
    const request = () => new Request(url + "/session?code=" + live.bootstrapCode);
    const response = await live.fetch(request(), port);
    expect(response.status).toBe(303);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain(token);
    expect((await live.fetch(request(), port)).status).toBe(401);
    expect((await live.fetch(new Request(url, { headers: { cookie: cookie.split(";")[0] } }), port)).status).toBe(200);
  });

  test("real listener binds only IPv4 loopback", async () => {
    const { server } = listenLive(() => new Response("ok"), 0, token);
    try {
      expect(server.hostname).toBe("127.0.0.1");
      const base = `http://127.0.0.1:${server.port}`;
      expect((await fetch(base + "/spec.json")).status).toBe(401);
      expect((await fetch(base + "/spec.json", { headers })).status).toBe(200);
    } finally { await server.stop(true); }
  });
});
