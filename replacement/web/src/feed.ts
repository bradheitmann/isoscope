import { emptyFeed, parseGraphSpec, parseSnapshot } from "./data";
import { previewFeed } from "./fixture";
import type { FeedState, GraphSpec, Snapshot } from "./types";

export function bootstrapFeed(): FeedState {
  if (new URLSearchParams(window.location.search).get("preview") === "1") return previewFeed();
  const snapshotText = document.getElementById("isoscope-snapshot")?.textContent?.trim();
  if (!snapshotText) return emptyFeed();
  try {
    const snapshot: Snapshot = parseSnapshot(JSON.parse(snapshotText) as unknown);
    const graphText = document.getElementById("isoscope-graph")?.textContent?.trim();
    const graph: GraphSpec | null = graphText ? parseGraphSpec(JSON.parse(graphText) as unknown) : null;
    return {
      snapshot,
      graph,
      receivedAt: Date.now(),
      loading: false,
      source: "embedded",
      lastFailure: null,
      graphFailure: null,
      snapshotEtag: null,
      graphEtag: null,
    };
  } catch (error) {
    return {
      ...emptyFeed(),
      loading: false,
      lastFailure: error instanceof Error ? error.message : "Embedded snapshot could not be read.",
    };
  }
}

async function fetchResponse(url: string, etag: string | null): Promise<{
  value: unknown | null;
  notModified: boolean;
  etag: string | null;
}> {
  const headers = new Headers({ accept: "application/json" });
  if (etag !== null) headers.set("if-none-match", etag);
  const response = await fetch(url, { headers, cache: "no-store" });
  if (response.status === 304) return { value: null, notModified: true, etag: response.headers.get("etag") ?? etag };
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return {
    value: await response.json() as unknown,
    notModified: false,
    etag: response.headers.get("etag"),
  };
}

export async function refreshFeed(previous: FeedState): Promise<FeedState> {
  let snapshot: Snapshot;
  let snapshotEtag = previous.snapshotEtag;
  try {
    const result = await fetchResponse("/api/snapshot", previous.snapshotEtag);
    snapshotEtag = result.etag;
    if (result.notModified && previous.snapshot !== null) snapshot = previous.snapshot;
    else if (result.value !== null) snapshot = parseSnapshot(result.value);
    else throw new Error("Snapshot returned not-modified before an initial snapshot was available.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot could not be fetched.";
    return {
      ...previous,
      loading: false,
      lastFailure: message,
    };
  }

  let graph: GraphSpec | null = previous.graph;
  let graphFailure: string | null = null;
  let graphEtag = previous.graphEtag;
  try {
    const result = await fetchResponse("/api/graph", previous.graphEtag);
    graphEtag = result.etag;
    if (!result.notModified) graph = parseGraphSpec(result.value);
  } catch (error) {
    graphFailure = error instanceof Error ? error.message : "Optional graph could not be fetched.";
  }
  return {
    snapshot,
    graph,
    receivedAt: Date.now(),
    loading: false,
    source: "api",
    lastFailure: null,
    graphFailure,
    snapshotEtag,
    graphEtag,
  };
}

export function startPolling(
  getCurrent: () => FeedState,
  update: (next: FeedState) => void,
  intervalMs = 5_000,
): () => void {
  let active = true;
  const refresh = async (): Promise<void> => {
    const next = await refreshFeed(getCurrent());
    if (active) update(next);
  };
  void refresh();
  const timer = window.setInterval(() => void refresh(), intervalMs);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}
