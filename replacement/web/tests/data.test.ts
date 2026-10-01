import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMapModel,
  exactHeadVerdict,
  parseGraphSpec,
  parseSnapshot,
  snapshotFreshness,
} from "../src/data";
import { refreshFeed } from "../src/feed";
import type { FeedState, Snapshot } from "../src/types";

function sourceSnapshot(): Snapshot {
  return parseSnapshot({
    schema: "isoscope.snapshot.v1",
    repository: "example/system",
    collected_at: "2026-09-30T12:00:00Z",
    plan_commit: "f11a2c4",
    content_sha256: "0123456789abcdef",
    status: "fresh",
    stale_after_seconds: 600,
    last_error: null,
    coverage: [{ endpoint: "/repos/example/system/issues", pages: 1, count: 2, sha256: "aa" }],
    warnings: [],
    items: [
      {
        number: 41,
        kind: "issue",
        title: "Bounded parser",
        url: "https://example.test/issues/41",
        unit: "WP-03/S02",
        category: "slice",
        stage: "running",
        labels: [],
        head_sha: "9f25aa10ce12",
        dependency_eligible: true,
        blockers: [],
        responsible_seat: "",
        next_action: "Review parser boundary.",
        current_head_pass: true,
        history: [],
        warnings: [],
        observed_dimensions: [],
        metrics_seconds: {},
      },
      {
        number: 42,
        kind: "pull_request",
        title: "Map projection",
        url: "https://example.test/pull/42",
        unit: "WP-03/S03",
        category: "slice",
        stage: "ready",
        labels: [],
        head_sha: null,
        dependency_eligible: null,
        blockers: [],
        responsible_seat: "",
        next_action: "No bound candidate head.",
        current_head_pass: false,
        history: [],
        warnings: [],
        observed_dimensions: [],
        metrics_seconds: {},
      },
    ],
    plan_nodes: [
      { id: "WP-03/S02", title: "Parser", planned: "Parse records", dependencies: [], critical_path: true, issue_number: 41 },
      { id: "WP-03/S03", title: "Projection", planned: "Build map", dependencies: ["WP-03/S02"], critical_path: false, issue_number: 42 },
    ],
    queues: { running: 1, ready: 1 },
    owner_observations: [],
    native_runtime_status: "unknown",
    token_cost_status: "unknown",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("snapshot data boundaries", () => {
  it("keeps plan dependency slice IDs and joins evidence only by the exact unit ID", () => {
    const snapshot = sourceSnapshot();
    const model = buildMapModel(snapshot, null);
    expect(model.source).toBe("plan");
    expect(model.edges).toEqual([expect.objectContaining({ from: "WP-03/S02", to: "WP-03/S03", kind: "dependency" })]);
    expect(model.nodes[0]?.item?.head_sha).toBe("9f25aa10ce12");
    expect(model.nodes[0]?.item?.current_head_pass).toBe(true);
  });

  it("binds PASS to a non-empty exact head and leaves missing heads unknown", () => {
    const snapshot = sourceSnapshot();
    expect(exactHeadVerdict(snapshot.items[0])).toEqual({ label: "Pass", detail: "9f25aa10c", tone: "success" });
    expect(exactHeadVerdict(snapshot.items[1])).toEqual({ label: "Unknown", detail: "No bound head SHA", tone: "unknown" });
  });

  it("adapts generic graph nodes, groups, typed edges, status and source references", () => {
    const snapshot = sourceSnapshot();
    const graph = parseGraphSpec({
      title: "System graph",
      groups: [{ id: "core", label: "Core" }],
      nodes: [{ id: "WP-03/S02", name: "Parser", tag: "PARSE", g: "core", does: "A parser", refs: "src/parser.rs", x: 2, y: 3 }],
      edges: [],
      status: { "WP-03/S02": { state: "ok", items: [{ c: "you", l: "Owner observation" }] } },
    });
    const model = buildMapModel(snapshot, graph);
    expect(model.source).toBe("graph");
    expect(model.nodes[0]).toMatchObject({ id: "WP-03/S02", title: "Parser", groupLabel: "Core", signal: "info" });
    expect(model.nodes[0]?.sourceRefs).toContain("src/parser.rs");
  });

  it("marks a retained last-good snapshot stale immediately after a failed refresh", () => {
    const snapshot = sourceSnapshot();
    const feed: FeedState = {
      snapshot,
      graph: null,
      receivedAt: Date.parse("2026-09-30T12:00:00Z"),
      loading: false,
      source: "api",
      lastFailure: null,
      graphFailure: null,
      snapshotEtag: "\"snapshot-1\"",
      graphEtag: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    return refreshFeed(feed).then((next) => {
      expect(next.snapshot).toBe(snapshot);
      expect(next.lastFailure).toContain("socket closed");
      expect(snapshotFreshness(next.snapshot, next.receivedAt, Date.parse("2026-09-30T12:00:05Z"), next.lastFailure).stale).toBe(true);
    });
  });

  it("accepts an unchanged ETag response without replacing the retained snapshot body", async () => {
    const snapshot = sourceSnapshot();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: "\"snapshot-1\"" } }))
      .mockResolvedValueOnce(new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const feed: FeedState = {
      snapshot,
      graph: null,
      receivedAt: Date.parse("2026-09-30T12:00:00Z"),
      loading: false,
      source: "api",
      lastFailure: null,
      graphFailure: null,
      snapshotEtag: "\"snapshot-1\"",
      graphEtag: null,
    };
    const next = await refreshFeed(feed);
    expect(next.snapshot).toBe(snapshot);
    expect(next.snapshotEtag).toBe("\"snapshot-1\"");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.headers).toBeInstanceOf(Headers);
    expect((request?.headers as Headers | undefined)?.get("if-none-match")).toBe("\"snapshot-1\"");
  });
});
