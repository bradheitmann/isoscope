import type {
  FeedState,
  GraphEdgeTuple,
  GraphSpec,
  MapEdge,
  MapModel,
  MapNode,
  NodeSignal,
  PlanNode,
  Snapshot,
  SnapshotItem,
  Stage,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const stages: readonly Stage[] = [
  "planned", "ready", "claimed", "running", "blocked", "delivered", "qa", "guard", "merged", "closed", "unknown",
];

export function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringField(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function recordList(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is UnknownRecord => entry !== null)
    : [];
}

function stageValue(value: unknown): Stage {
  return typeof value === "string" && stages.some((stage) => stage === value)
    ? value as Stage
    : "unknown";
}

function parseItem(value: unknown): SnapshotItem | null {
  const record = asRecord(value);
  if (record === null) return null;
  const number = numberField(record, "number");
  const title = stringField(record, "title");
  if (number === null || title === null) return null;
  const metrics = asRecord(record.metrics_seconds) ?? {};
  const metricPairs = Object.entries(metrics).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  const history = recordList(record.history).flatMap((entry) => {
    const id = stringField(entry, "id");
    const at = stringField(entry, "at");
    const sourceUrl = stringField(entry, "source_url");
    if (id === null || at === null || sourceUrl === null) return [];
    return [{
      id,
      at,
      edited_at: stringField(entry, "edited_at") ?? at,
      kind: stringField(entry, "kind") ?? "unknown",
      source_url: sourceUrl,
      sha256: stringField(entry, "sha256") ?? "",
      body: stringField(entry, "body") ?? "",
    }];
  });
  const observations = recordList(record.observed_dimensions).flatMap((entry) => {
    const dimension = stringField(entry, "dimension");
    const observedAt = stringField(entry, "observed_at");
    if (dimension === null || observedAt === null) return [];
    return [{
      dimension,
      value: stringField(entry, "value") ?? "",
      provenance: stringField(entry, "provenance") ?? "",
      observed_at: observedAt,
      source_url: stringField(entry, "source_url"),
    }];
  });
  return {
    number,
    kind: stringField(record, "kind") ?? "issue",
    title,
    url: stringField(record, "url") ?? "",
    unit: stringField(record, "unit"),
    category: stringField(record, "category") ?? "",
    stage: stageValue(record.stage),
    labels: stringList(record.labels),
    head_sha: stringField(record, "head_sha"),
    dependency_eligible: typeof record.dependency_eligible === "boolean" ? record.dependency_eligible : null,
    blockers: stringList(record.blockers),
    responsible_seat: stringField(record, "responsible_seat") ?? "",
    next_action: stringField(record, "next_action") ?? "",
    candidate_ready_at: stringField(record, "candidate_ready_at"),
    stage_since: stringField(record, "stage_since"),
    stage_age_seconds: numberField(record, "stage_age_seconds"),
    current_head_pass: record.current_head_pass === true,
    history,
    warnings: stringList(record.warnings),
    observed_dimensions: observations,
    metrics_seconds: Object.fromEntries(metricPairs),
  };
}

function parsePlanNode(value: unknown): PlanNode | null {
  const record = asRecord(value);
  if (record === null) return null;
  const id = stringField(record, "id");
  const title = stringField(record, "title");
  if (id === null || title === null) return null;
  return {
    id,
    title,
    planned: stringField(record, "planned") ?? "",
    dependencies: stringList(record.dependencies),
    critical_path: record.critical_path === true,
    issue_number: numberField(record, "issue_number"),
  };
}

export function parseSnapshot(value: unknown): Snapshot {
  const record = asRecord(value);
  if (record === null) throw new Error("Snapshot response was not a JSON object.");
  const repository = stringField(record, "repository");
  const collectedAt = stringField(record, "collected_at");
  const schema = stringField(record, "schema");
  if (repository === null || collectedAt === null || schema === null) {
    throw new Error("Snapshot response is missing its schema, repository, or collection time.");
  }
  if (!Array.isArray(record.items) || !Array.isArray(record.plan_nodes)) {
    throw new Error("Snapshot response is missing items or plan_nodes arrays.");
  }
  const coverage = recordList(record.coverage).flatMap((entry) => {
    const endpoint = stringField(entry, "endpoint");
    if (endpoint === null) return [];
    return [{
      endpoint,
      pages: numberField(entry, "pages") ?? 0,
      count: numberField(entry, "count") ?? 0,
      sha256: stringField(entry, "sha256") ?? "",
    }];
  });
  const queues = asRecord(record.queues) ?? {};
  const ownerObservations = recordList(record.owner_observations).flatMap((entry) => {
    const dimension = stringField(entry, "dimension");
    const observedAt = stringField(entry, "observed_at");
    if (dimension === null || observedAt === null) return [];
    return [{
      dimension,
      value: stringField(entry, "value") ?? "",
      provenance: stringField(entry, "provenance") ?? "",
      observed_at: observedAt,
      source_url: stringField(entry, "source_url"),
    }];
  });
  return {
    schema,
    repository,
    collected_at: collectedAt,
    plan_commit: stringField(record, "plan_commit") ?? "",
    content_sha256: stringField(record, "content_sha256") ?? "",
    status: stringField(record, "status") ?? "unknown",
    stale_after_seconds: numberField(record, "stale_after_seconds") ?? 600,
    last_error: stringField(record, "last_error"),
    coverage,
    warnings: stringList(record.warnings),
    items: record.items.map(parseItem).filter((item): item is SnapshotItem => item !== null),
    plan_nodes: record.plan_nodes.map(parsePlanNode).filter((node): node is PlanNode => node !== null),
    queues: Object.fromEntries(Object.entries(queues).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    )),
    owner_observations: ownerObservations,
    native_runtime_status: stringField(record, "native_runtime_status") ?? "unknown",
    token_cost_status: stringField(record, "token_cost_status") ?? "unknown",
  };
}

export function parseGraphSpec(value: unknown): GraphSpec | null {
  if (value === null || value === undefined) return null;
  const record = asRecord(value);
  if (record === null) throw new Error("Graph response was not a JSON object.");
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    throw new Error("Graph response is missing Isoscope nodes or edges arrays.");
  }
  const nodes = recordList(record.nodes).flatMap((entry) => {
    const id = stringField(entry, "id");
    if (id === null) return [];
    return [{
      id,
      name: stringField(entry, "name") ?? undefined,
      title: stringField(entry, "title") ?? undefined,
      tag: stringField(entry, "tag") ?? undefined,
      g: stringField(entry, "g") ?? undefined,
      group: stringField(entry, "group") ?? undefined,
      does: stringField(entry, "does") ?? undefined,
      built: stringField(entry, "built") ?? undefined,
      refs: stringField(entry, "refs") ?? undefined,
      x: numberField(entry, "x") ?? undefined,
      y: numberField(entry, "y") ?? undefined,
      w: numberField(entry, "w") ?? undefined,
      d: numberField(entry, "d") ?? undefined,
      h: numberField(entry, "h") ?? undefined,
      stack: numberField(entry, "stack") ?? undefined,
    }];
  });
  const edges: GraphEdgeTuple[] = record.edges.flatMap((value): GraphEdgeTuple[] => {
    if (!Array.isArray(value) || value.length < 2) return [];
    const from = value[0];
    const to = value[1];
    const kind = value[2];
    if (typeof from !== "string" || typeof to !== "string") return [];
    return [[from, to, typeof kind === "string" ? kind : "intended"]];
  });
  const rawGroups = recordList(record.groups).flatMap((entry) => {
    const id = stringField(entry, "id");
    if (id === null) return [];
    return [{ id, label: stringField(entry, "label") ?? id }];
  });
  const statusSource = asRecord(record.status) ?? {};
  const status = Object.fromEntries(Object.entries(statusSource).map(([id, value]) => {
    const entry = asRecord(value);
    return [id, {
      state: entry === null ? undefined : stringField(entry, "state") ?? undefined,
      items: entry === null ? undefined : recordList(entry.items).map((item) => ({
        c: stringField(item, "c") ?? undefined,
        l: stringField(item, "l") ?? undefined,
      })),
    }];
  }));
  const levelsSource = asRecord(record.levels) ?? {};
  const levels = Object.fromEntries(Object.entries(levelsSource).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]),
  ));
  const traceText = asRecord(record.traceText) ?? {};
  const edgeStatusSource = asRecord(record.edgeStatus) ?? {};
  const edgeDocsSource = asRecord(record.edgeDocs) ?? {};
  const shortSource = asRecord(record.short) ?? {};
  const edgeDocs = Object.fromEntries(Object.entries(edgeDocsSource).map(([id, value]) => {
    const entry = asRecord(value);
    return [id, {
      title: entry === null ? undefined : stringField(entry, "title") ?? undefined,
      carries: entry === null ? undefined : stringField(entry, "carries") ?? undefined,
      refs: entry === null ? undefined : stringField(entry, "refs") ?? undefined,
    }];
  }));
  return {
    title: stringField(record, "title") ?? undefined,
    groups: rawGroups,
    nodes,
    edges,
    status,
    levels,
    trace: stringList(record.trace),
    traceText: Object.fromEntries(Object.entries(traceText).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    )),
    edgeStatus: Object.fromEntries(Object.entries(edgeStatusSource).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    )),
    edgeDocs,
    short: Object.fromEntries(Object.entries(shortSource).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    )),
  };
}

function signalForStage(stage: string, item?: SnapshotItem): NodeSignal {
  if (item !== undefined && item.blockers.length > 0) return "danger";
  switch (stage) {
    case "blocked": return "danger";
    case "claimed":
    case "running": return "info";
    case "ready":
    case "qa":
    case "guard": return "warning";
    case "delivered":
    case "merged":
    case "closed": return "success";
    case "build": return "info";
    case "attn": return "warning";
    case "ok": return "success";
    default: return "muted";
  }
}

function itemIndex(snapshot: Snapshot): Map<string, SnapshotItem> {
  const result = new Map<string, SnapshotItem>();
  for (const item of snapshot.items) {
    if (item.unit !== null && item.unit !== undefined && !result.has(item.unit)) result.set(item.unit, item);
  }
  return result;
}

function makeEdge(
  from: string,
  to: string,
  kind: string,
  docs: GraphSpec["edgeDocs"],
  edgeStatus: GraphSpec["edgeStatus"],
): MapEdge {
  const id = `${from}-${to}`;
  const health = edgeStatus?.[id] ?? edgeStatus?.[`${to}-${from}`] ?? "";
  const broken = health === "broken";
  return {
    id,
    from,
    to,
    kind,
    label: docs?.[id]?.carries ?? docs?.[id]?.title ?? kind,
    signal: broken ? "danger" : health === "degraded" ? "warning" : kind === "data" ? "info" : "muted",
    broken,
  };
}

export function buildMapModel(snapshot: Snapshot, graph: GraphSpec | null): MapModel {
  const items = itemIndex(snapshot);
  if (graph !== null && graph.nodes !== undefined && graph.edges !== undefined) {
    const groups = graph.groups ?? [];
    const groupNames = new Map(groups.map((group) => [group.id, group.label]));
    const nodes: MapNode[] = graph.nodes.map((node) => {
      const item = items.get(node.id);
      const groupId = node.g ?? node.group ?? "system";
      const status = graph.status?.[node.id];
      const stage = item?.stage ?? status?.state ?? "unknown";
      const reasons = (status?.items ?? []).map((entry) => entry.l).filter((value): value is string => value !== undefined);
      const position: MapNode["position"] = typeof node.x === "number" && typeof node.y === "number"
        ? { x: node.x, z: node.y, elevation: graph.levels?.[node.id] ?? 0 }
        : undefined;
      const sourceRefs = [node.refs, item?.url].filter((value): value is string => typeof value === "string" && value.length > 0);
      return {
        id: node.id,
        title: node.name ?? node.title ?? node.id,
        tag: node.tag ?? node.id,
        groupId,
        groupLabel: groupNames.get(groupId) ?? groupId,
        description: node.does ?? item?.next_action ?? "",
        detail: [node.built, ...reasons].filter((value): value is string => typeof value === "string" && value.length > 0).join(" · "),
        sourceRefs,
        stage,
        signal: signalForStage(stage, item),
        criticalPath: false,
        position,
        item,
      };
    });
    const edges = (graph.edges ?? []).map(([from, to, kind]) => makeEdge(from, to, kind ?? "intended", graph.edgeDocs, graph.edgeStatus));
    return {
      title: graph.title ?? snapshot.repository,
      groups,
      nodes,
      edges,
      trace: graph.trace ?? [],
      traceText: graph.traceText ?? {},
      source: "graph",
    };
  }

  const nodes: MapNode[] = snapshot.plan_nodes.map((node) => {
    const item = items.get(node.id);
    const stage = item?.stage ?? "planned";
    const sourceRefs = item?.url.length ? [item.url] : [];
    return {
      id: node.id,
      title: node.title,
      tag: node.id,
      groupId: node.critical_path ? "critical" : "plan",
      groupLabel: node.critical_path ? "Critical path" : "Plan graph",
      description: item?.next_action ?? node.planned,
      detail: item === undefined ? "No linked work item was returned with this snapshot." : item.blockers.join(" · "),
      sourceRefs,
      stage,
      signal: signalForStage(stage, item),
      criticalPath: node.critical_path,
      item,
      planned: node.planned,
    };
  });
  const known = new Set(nodes.map((node) => node.id));
  const edges = snapshot.plan_nodes.flatMap((node) => node.dependencies
    .filter((dependency) => known.has(dependency))
    .map((dependency) => makeEdge(dependency, node.id, "dependency", undefined, undefined)));
  return {
    title: snapshot.repository,
    groups: [
      { id: "plan", label: "Plan graph" },
      { id: "critical", label: "Critical path" },
    ],
    nodes,
    edges,
    trace: [],
    traceText: {},
    source: "plan",
  };
}

export function elapsedSeconds(collectedAt: string, now: number): number | null {
  const timestamp = Date.parse(collectedAt);
  if (!Number.isFinite(timestamp)) return null;
  const elapsed = Math.floor((now - timestamp) / 1000);
  return elapsed < 0 ? null : elapsed;
}

export function snapshotFreshness(snapshot: Snapshot | null, receivedAt: number | null, now: number, lastFailure: string | null = null): {
  label: string;
  stale: boolean;
  seconds: number | null;
  tone: "fresh" | "warning" | "danger" | "unknown";
} {
  if (snapshot === null) return { label: "Awaiting snapshot", stale: true, seconds: null, tone: "unknown" };
  const seconds = elapsedSeconds(snapshot.collected_at, now);
  if (seconds === null) return { label: "Timestamp unknown", stale: true, seconds: null, tone: "unknown" };
  const cutoff = Math.max(0, snapshot.stale_after_seconds);
  const stale = lastFailure !== null || snapshot.status === "stale" || snapshot.status === "error" || snapshot.last_error !== null && snapshot.last_error !== undefined || seconds > cutoff;
  const label = lastFailure !== null
    ? `Refresh error · ${formatAge(seconds)}`
    : stale ? `Stale · ${formatAge(seconds)}` : `Fresh · ${formatAge(seconds)}`;
  const clientLost = receivedAt !== null && now - receivedAt > Math.max(cutoff * 1000, 30_000);
  return {
    label: clientLost ? `Connection lost · ${formatAge(seconds)}` : label,
    stale: stale || clientLost,
    seconds,
    tone: stale || clientLost ? seconds > cutoff * 2 ? "danger" : "warning" : "fresh",
  };
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return "unknown age";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function exactHeadVerdict(item: SnapshotItem | undefined): { label: string; detail: string; tone: string } {
  if (item === undefined || item.head_sha === null || item.head_sha === undefined || item.head_sha.length === 0) {
    return { label: "Unknown", detail: "No bound head SHA", tone: "unknown" };
  }
  if (item.current_head_pass) {
    return { label: "Pass", detail: item.head_sha.slice(0, 9), tone: "success" };
  }
  return { label: "No pass", detail: item.head_sha.slice(0, 9), tone: "warning" };
}

export function emptyFeed(): FeedState {
  return {
    snapshot: null,
    graph: null,
    receivedAt: null,
    loading: true,
    source: "none",
    lastFailure: null,
    graphFailure: null,
    snapshotEtag: null,
    graphEtag: null,
  };
}
