import type { FeedState, GraphSpec, Snapshot } from "./types";

const specimenGraph: GraphSpec = {
  title: "Illustrative architecture",
  groups: [
    { id: "entry", label: "Entry points" },
    { id: "core", label: "Core" },
    { id: "storage", label: "Storage" },
    { id: "delivery", label: "Delivery" },
  ],
  nodes: [
    { id: "web", name: "Web client", tag: "WEB", g: "entry", x: 0, y: 0, h: 1.2, does: "A typed client surface. No source repository is connected in this preview." },
    { id: "api", name: "API boundary", tag: "API", g: "entry", x: 3.2, y: 0.1, h: 1.6, does: "An example boundary node for showing relationships." },
    { id: "parse", name: "Parser", tag: "PARSE", g: "core", x: 6, y: 0.8, h: 1.1, does: "Illustrates a processing step in the graph." },
    { id: "model", name: "Domain model", tag: "MODEL", g: "core", x: 8.6, y: 0.8, h: 1.8, does: "Illustrative domain module with no activity or health claims." },
    { id: "queue", name: "Work queue", tag: "QUEUE", g: "core", x: 5.4, y: 3.7, h: 1.4, does: "A place where work items could be represented." },
    { id: "policy", name: "Policy checks", tag: "POLICY", g: "core", x: 9, y: 4.2, h: 1.2, does: "A node can show its evidence and source links when provided." },
    { id: "store", name: "Graph store", tag: "STORE", g: "storage", x: 12, y: 0.3, h: 1.6, does: "A source for modules and typed connections." },
    { id: "events", name: "Event log", tag: "EVENTS", g: "storage", x: 12.4, y: 4.2, h: 1.1, does: "History can be inspected without implying that this fixture is live." },
    { id: "ci", name: "Build pipeline", tag: "CI", g: "delivery", x: 1.7, y: 6.4, h: 1.3, does: "A CI mapping can attribute jobs to graph modules." },
    { id: "release", name: "Release surface", tag: "SHIP", g: "delivery", x: 6.7, y: 7, h: 1.5, does: "Illustrative terminal node; runtime and release evidence remain unknown." },
  ],
  edges: [
    ["web", "api", "data"], ["api", "parse", "data"], ["parse", "model", "data"],
    ["model", "store", "data"], ["queue", "model", "intended"], ["model", "policy", "auth"],
    ["policy", "events", "data"], ["ci", "queue", "intended"], ["policy", "release", "auth"],
  ],
  status: {},
  levels: {},
};

const snapshot: Snapshot = {
  schema: "illustrative-preview",
  repository: "Architecture preview",
  collected_at: "",
  plan_commit: "",
  content_sha256: "",
  status: "illustrative",
  stale_after_seconds: 0,
  last_error: null,
  coverage: [],
  warnings: [],
  items: [],
  plan_nodes: [],
  queues: {},
  owner_observations: [],
  native_runtime_status: "unknown",
  token_cost_status: "unknown",
};

export function previewFeed(): FeedState {
  return {
    snapshot,
    graph: specimenGraph,
    receivedAt: null,
    loading: false,
    source: "fixture",
    lastFailure: null,
    graphFailure: null,
    snapshotEtag: null,
    graphEtag: null,
  };
}
