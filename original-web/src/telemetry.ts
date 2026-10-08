/* Live edge telemetry — wide events in the lumbr schema, driving live edge health.

   Every operation that crosses an edge (a real flow of data/control between two
   modules) emits ONE wide event: a single rich structured record per crossing, in
   the lumbr wide-event shape (trace_id/span_id/timing/status + edge identity +
   latency + optional error). No sampling, no pre-aggregation — the wide event is
   the unit, and edge health is derived live from the recent stream.

   This module is pure data (no DOM, no Three.js) so it is unit-testable and the
   renderer binds to it. A lumbr backend can subscribe to the same events; the map
   is self-demonstrating because its own seams are instrumented. */

export type SpanStatus = "UNSET" | "OK" | "ERROR";
export type SpanKind = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER";

/* The wide event, mirroring lumbr's LumbrSpan required fields (12) + edge identity. */
export interface WideEvent {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;             /* the operation, e.g. "annotation.save" */
  kind: SpanKind;
  status: SpanStatus;
  start_time_unix_nano: number;
  end_time_unix_nano: number;
  duration_ms: number;
  "service.name": string;
  "telemetry.sdk.name": string;
  "lumbr.agent_id": string;
  "lumbr.session_id": string;
  /* edge identity: which seam this crossing went over */
  "isoscope.edge": string;  /* "DB-SV" */
  "isoscope.edge.from": string;
  "isoscope.edge.to": string;
  "error.type"?: string;
  "error.message"?: string;
}

export type EdgeHealth = "ok" | "degraded" | "broken";

let seq = 0;
const SESSION = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const AGENT = "original-web";
function id16(): string { return (Date.now().toString(16) + (seq++).toString(16).padStart(4, "0") + Math.random().toString(16).slice(2, 6)).slice(-16); }

type Listener = (e: WideEvent) => void;
const listeners = new Set<Listener>();
export function onWideEvent(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }

/* ————— durable sink —————
   Events also persist to a local wide-event log via the dev server's
   /api/telemetry endpoint (lumbr-schema JSONL), so a session's telemetry survives
   the page. Batched + best-effort: a static host without the endpoint just skips.
   A real lumbr/OTel backend can replace this sink without touching emitters. */
const sinkBuf: WideEvent[] = [];
let sinkTimer: ReturnType<typeof setTimeout> | null = null;
let sinkRemote = true; /* flips false if the endpoint 404s (static host) */
function flushSink(): void {
  sinkTimer = null;
  if (!sinkRemote || !sinkBuf.length) return;
  const batch = sinkBuf.splice(0, sinkBuf.length);
  fetch("api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch) })
    .then(r => { if (!r.ok) sinkRemote = false; })
    .catch(() => { sinkRemote = false; });
}
function enqueueSink(ev: WideEvent): void {
  sinkBuf.push(ev);
  if (!sinkTimer) sinkTimer = setTimeout(flushSink, 2000);
  if (sinkBuf.length >= 50) flushSink(); /* flush promptly under burst */
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { /* last call: send what we have */
    if (sinkRemote && sinkBuf.length && navigator.sendBeacon)
      navigator.sendBeacon("api/telemetry", JSON.stringify(sinkBuf.splice(0)));
  });
}

/* the recent stream, kept in memory (ring) so the panel + health tracker read it */
const STREAM_CAP = 500;
const stream: WideEvent[] = [];
export function recentEvents(): readonly WideEvent[] { return stream; }

/* Emit one wide event for a crossing of `edgeKey` (from→to). The operation is timed
   by the caller (pass startEpochMs) or timed here for instant operations. */
export function emitWide(p: {
  edge: string; from: string; to: string; name: string;
  durationMs: number; ok: boolean; kind?: SpanKind; error?: string; parent?: string; traceId?: string;
}): WideEvent {
  const end = Date.now();
  const ev: WideEvent = {
    trace_id: p.traceId ?? id16() + id16(),
    span_id: id16(),
    parent_span_id: p.parent,
    name: p.name,
    kind: p.kind ?? "INTERNAL",
    status: p.ok ? "OK" : "ERROR",
    start_time_unix_nano: (end - p.durationMs) * 1e6,
    end_time_unix_nano: end * 1e6,
    duration_ms: Math.max(0, Math.round(p.durationMs * 100) / 100),
    "service.name": "isoscope-original-web",
    "telemetry.sdk.name": "isoscope-telemetry",
    "lumbr.agent_id": AGENT,
    "lumbr.session_id": SESSION,
    "isoscope.edge": p.edge,
    "isoscope.edge.from": p.from,
    "isoscope.edge.to": p.to,
    ...(p.ok ? {} : { "error.type": "unknown", "error.message": p.error ?? "operation failed" }),
  };
  stream.push(ev); if (stream.length > STREAM_CAP) stream.shift();
  track(p.edge, ev);
  enqueueSink(ev); /* durable local sink */
  listeners.forEach(fn => fn(ev));
  return ev;
}

/* time an async operation that crosses an edge; emits on settle */
export async function traceEdge<T>(edge: string, from: string, to: string, name: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = performance.now();
  try {
    const r = await fn();
    emitWide({ edge, from, to, name, durationMs: performance.now() - t0, ok: true });
    return r;
  } catch (e) {
    emitWide({ edge, from, to, name, durationMs: performance.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/* ————— live edge health —————
   A rolling window per edge of recent span outcomes. Health is derived, not set:
   a recent ERROR, or latency blowing past the p95 budget, degrades the edge; a
   crossing that throws and is never retried marks it broken until it recovers. */
interface EdgeWindow { times: number[]; errors: number; total: number; lastErrorAt: number; lastOkAt: number }
const windows = new Map<string, EdgeWindow>();
const WIN = 24;                 /* rolling window of recent crossings per edge */
const SLOW_MS = 120;            /* a crossing slower than this reads as degraded */
const healthListeners = new Set<() => void>();
export function onEdgeHealthChange(fn: () => void): void { healthListeners.add(fn); }

function track(edge: string, ev: WideEvent): void {
  let w = windows.get(edge);
  if (!w) { w = { times: [], errors: 0, total: 0, lastErrorAt: 0, lastOkAt: 0 }; windows.set(edge, w); }
  w.times.push(ev.duration_ms); if (w.times.length > WIN) w.times.shift();
  w.total++;
  if (ev.status === "ERROR") { w.errors++; w.lastErrorAt = ev.end_time_unix_nano / 1e6; }
  else w.lastOkAt = ev.end_time_unix_nano / 1e6;
  healthListeners.forEach(fn => fn());
}

export function edgeHealth(edge: string): EdgeHealth | null {
  const w = windows.get(edge);
  if (!w || w.total === 0) return null; /* untraced so far — fall back to static status */
  const errRate = w.errors / w.total;
  const recent = w.times.slice(-8);
  const p95 = recent.sort((a, b) => a - b)[Math.floor(recent.length * 0.95)] ?? 0;
  /* broken: errors dominate and it has not recovered since */
  if (errRate >= 0.5 && w.lastErrorAt > w.lastOkAt) return "broken";
  /* degraded: some errors, or the recent tail is slow */
  if (errRate >= 0.15 || p95 > SLOW_MS) return "degraded";
  return "ok";
}

/* point-in-time health of every traced edge (for the map + tests) */
export function allEdgeHealth(): Record<string, EdgeHealth> {
  const out: Record<string, EdgeHealth> = {};
  windows.forEach((_, k) => { const h = edgeHealth(k); if (h) out[k] = h; });
  return out;
}

/* test hook: reset the stream + windows */
export function __resetTelemetry(): void { stream.length = 0; windows.clear(); }

/* ————— per-edge metrics for the observability overlay + detail panels ————— */
export interface EdgeMetrics {
  edge: string; health: EdgeHealth;
  total: number;          /* crossings observed this session */
  errors: number;         /* error crossings */
  errorRate: number;      /* errors / total */
  p50: number; p95: number; /* latency percentiles over the recent window (ms) */
  ratePerMin: number;     /* recent throughput */
}
const sessionStart = Date.now();
export function edgeMetrics(edge: string): EdgeMetrics | null {
  const w = windows.get(edge);
  if (!w || w.total === 0) return null;
  const sorted = w.times.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const elapsedMin = Math.max(0.016, (Date.now() - sessionStart) / 60000);
  return {
    edge, health: edgeHealth(edge) ?? "ok",
    total: w.total, errors: w.errors, errorRate: w.total ? w.errors / w.total : 0,
    p50: Math.round(p50 * 10) / 10, p95: Math.round(p95 * 10) / 10,
    ratePerMin: Math.round((w.total / elapsedMin) * 10) / 10,
  };
}
/* every traced edge's metrics (drives the overlay + a needs-attention rollup) */
export function allEdgeMetrics(): EdgeMetrics[] {
  const out: EdgeMetrics[] = [];
  windows.forEach((_, k) => { const m = edgeMetrics(k); if (m) out.push(m); });
  return out;
}
/* the current offenders: highest error rate first, then slowest p95 */
export function attentionEdges(limit = 5): EdgeMetrics[] {
  return allEdgeMetrics()
    .filter(m => m.health !== "ok")
    .sort((a, b) => (b.errorRate - a.errorRate) || (b.p95 - a.p95))
    .slice(0, limit);
}
