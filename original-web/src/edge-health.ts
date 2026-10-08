/* The ONE edge-health rule, shared by the browser (telemetry.ts, live windows)
   and the dev server (api.ts /api/telemetry/attention, over the durable store).
   F15: two hand-maintained copies disagreed — the server never saw recovery and
   used a mean where the browser used a p95.

   Semantics: a rolling window of the last WIN crossings per edge. Errors roll
   OUT of the window, so a recovered edge heals instead of carrying lifetime
   errors forever. Lifetime totals stay available as metrics, not health. */

export type EdgeHealth = "ok" | "degraded" | "broken";

export interface EdgeWindowState {
  recent: { d: number; err: boolean; at: number }[]; /* last WIN crossings, oldest first */
  total: number;   /* lifetime crossings (metrics) */
  errors: number;  /* lifetime error crossings (metrics) */
}

export const WIN = 24;      /* rolling window of recent crossings per edge */
export const SLOW_MS = 120; /* a crossing slower than this reads as degraded */

export function newEdgeWindow(): EdgeWindowState {
  return { recent: [], total: 0, errors: 0 };
}

export function trackCrossing(w: EdgeWindowState, durationMs: number, isError: boolean, atMs: number): void {
  w.recent.push({ d: durationMs, err: isError, at: atMs });
  if (w.recent.length > WIN) w.recent.shift();
  w.total++;
  if (isError) w.errors++;
}

/* error rate over the WINDOW — old errors roll out, recovery heals */
export function windowErrorRate(w: EdgeWindowState): number {
  if (!w.recent.length) return 0;
  return w.recent.filter(r => r.err).length / w.recent.length;
}

/* p95 over the most recent handful of crossings */
export function windowP95(w: EdgeWindowState): number {
  const t = w.recent.slice(-8).map(r => r.d).sort((a, b) => a - b);
  return t[Math.floor(t.length * 0.95)] ?? 0;
}

export function healthOfWindow(w: EdgeWindowState): EdgeHealth | null {
  if (w.total === 0) return null; /* untraced so far */
  const errRate = windowErrorRate(w);
  const lastErrAt = w.recent.reduce((m, r) => (r.err ? Math.max(m, r.at) : m), 0);
  const lastOkAt = w.recent.reduce((m, r) => (!r.err ? Math.max(m, r.at) : m), 0);
  /* broken: errors dominate the window and it has not recovered since */
  if (errRate >= 0.5 && lastErrAt > lastOkAt) return "broken";
  /* degraded: some recent errors, or the recent tail is slow */
  if (errRate >= 0.15 || windowP95(w) > SLOW_MS) return "degraded";
  return "ok";
}
