import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { deploymentProfile, type DeploymentProfile } from "./deployment.ts";

const MAX_BODY_BYTES = 64 * 1024;
const COOKIE = "isoscope_session";
const digest = (value: string) => createHash("sha256").update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** The live CLI is a local, authenticated service, including its read routes. */
export function secureLiveFetch(
  route: (request: Request) => Response | Promise<Response>,
  configuredToken?: string,
  options: { profile?: DeploymentProfile } = {},
) {
  const profile = deploymentProfile(options.profile);
  if (configuredToken !== undefined && configuredToken.length < 32)
    throw new Error("ISOSCOPE_TOKEN must contain at least 32 characters");
  const token = configuredToken ?? randomBytes(32).toString("hex");
  let bootstrapCode: string | undefined = randomBytes(32).toString("hex");
  const initialCode = bootstrapCode;
  const cookieToken = randomBytes(32).toString("hex");
  const respond = (body: string, status: number) => new Response(body, { status });
  return {
    bootstrapCode: initialCode,
    async fetch(request: Request, port: number): Promise<Response> {
      const url = new URL(request.url);
      const authorities = new Set([new URL(`http://127.0.0.1:${port}`).host, new URL(`http://localhost:${port}`).host]);
      const authority = request.headers.get("host") ?? url.host;
      if (!authorities.has(authority) || !authorities.has(url.host))
        return respond("invalid host", 403);
      const origin = request.headers.get("origin");
      if ((origin !== null && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site")
        return respond("invalid origin", 403);

      // One-use local browser handoff. The API bearer token never enters HTML,
      // URLs or browser storage. Cookies are session-only, HttpOnly and same-site.
      if (url.pathname === "/session" && request.method === "GET") {
        const code = url.searchParams.get("code");
        if (!bootstrapCode || !code || !equal(code, bootstrapCode))
          return respond("invalid or consumed browser handoff", 401);
        bootstrapCode = undefined;
        return new Response(null, { status: 303, headers: {
          location: "/", "set-cookie": `${COOKIE}=${cookieToken}; HttpOnly; SameSite=Strict; Path=/`,
          "cache-control": "no-store", "referrer-policy": "no-referrer",
        } });
      }
      const authorization = request.headers.get("authorization");
      const cookies = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim());
      const sessionCookies = cookies.filter(part => part.startsWith(`${COOKIE}=`));
      const authenticated = authorization !== null
        ? equal(authorization, `Bearer ${token}`)
        : sessionCookies.length === 1 && equal(sessionCookies[0].slice(COOKIE.length + 1), cookieToken);
      if (!authenticated) return respond("authentication required; open the browser handoff URL printed by the CLI", 401);
      if (profile === "read-only" && request.method !== "GET" && request.method !== "HEAD")
        return respond("this live deployment is read-only", 403);
      if (request.method !== "GET" && request.method !== "HEAD") {
        if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
          return respond("application/json required", 415);
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              length += value.byteLength;
              if (length > MAX_BODY_BYTES) { await reader.cancel(); return respond("payload too large", 413); }
              chunks.push(value);
            }
          } catch { return respond("invalid request body", 400); }
          finally { reader.releaseLock(); }
        }
        const body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
        request = new Request(request, { body });
      }
      try {
        const response = await route(request);
        response.headers.set("cache-control", "no-store");
        response.headers.set("x-content-type-options", "nosniff");
        response.headers.set("referrer-policy", "no-referrer");
        response.headers.set("content-security-policy", "frame-ancestors 'none'");
        return response;
      } catch { return respond("invalid request", 400); }
    },
  };
}

export function listenLive(route: (request: Request) => Response | Promise<Response>, port: number, token?: string, options: { profile?: DeploymentProfile } = {}) {
  return listenSecuredLive(secureLiveFetch(route, token, options), port);
}

/** Bind an already-guarded application without introducing a second policy or session. */
export function listenSecuredLive(secured: ReturnType<typeof secureLiveFetch>, port: number) {
  const server = Bun.serve({ hostname: "127.0.0.1", port, maxRequestBodySize: MAX_BODY_BYTES,
    fetch: (request, instance) => secured.fetch(request, instance.port!),
  });
  return { server, bootstrapCode: secured.bootstrapCode };
}
