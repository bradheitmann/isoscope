import { describe, it, expect, beforeEach } from "vitest";
import { emitWide, edgeHealth, allEdgeHealth, recentEvents, __resetTelemetry } from "../src/telemetry";

const E = "DB-SV";
function ok(ms = 5) { emitWide({ edge: E, from: "SV", to: "DB", name: "annotation.save", durationMs: ms, ok: true }); }
function err(ms = 5) { emitWide({ edge: E, from: "SV", to: "DB", name: "annotation.save", durationMs: ms, ok: false, error: "boom" }); }

describe("live edge telemetry (wide events → edge health)", () => {
  beforeEach(() => __resetTelemetry());

  it("untraced edges report null (fall back to static status)", () => {
    expect(edgeHealth("UNTRACED-EDGE")).toBeNull();
  });

  it("emits lumbr-schema wide events with the 12 required fields + edge identity", () => {
    ok();
    const ev = recentEvents()[0];
    for (const f of ["trace_id", "span_id", "name", "kind", "status", "start_time_unix_nano", "end_time_unix_nano", "duration_ms", "service.name", "telemetry.sdk.name", "lumbr.agent_id", "lumbr.session_id"] as const)
      expect(ev[f], f).toBeDefined();
    expect(ev["isoscope.edge"]).toBe(E);
    expect(ev.status).toBe("OK");
  });

  it("healthy stream of OK crossings → ok", () => {
    for (let i = 0; i < 6; i++) ok();
    expect(edgeHealth(E)).toBe("ok");
  });

  it("slow crossings (over the p95 budget) → degraded", () => {
    for (let i = 0; i < 8; i++) ok(300); /* 300ms crossings, over the 120ms budget */
    expect(edgeHealth(E)).toBe("degraded");
  });

  it("dominant errors with no recovery → broken", () => {
    err(); err(); err(); err(); /* 4 errors, no ok after */
    expect(edgeHealth(E)).toBe("broken");
  });

  it("recovers: ok after broken flips back", () => {
    err(); err(); err();
    for (let i = 0; i < 6; i++) ok(); /* recovery: recent oks after the errors */
    expect(edgeHealth(E)).not.toBe("broken");
  });

  it("allEdgeHealth reports only traced edges", () => {
    ok();
    emitWide({ edge: "AD-CL", from: "AD", to: "CL", name: "x", durationMs: 5, ok: false });
    const h = allEdgeHealth();
    expect(Object.keys(h).sort()).toEqual(["AD-CL", "DB-SV"]);
    expect(h["AD-CL"]).toBe("broken");
    expect(h["DB-SV"]).toBe("ok");
  });
});
