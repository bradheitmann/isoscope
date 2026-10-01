export type Stage =
  | "planned"
  | "ready"
  | "claimed"
  | "running"
  | "blocked"
  | "delivered"
  | "qa"
  | "guard"
  | "merged"
  | "closed"
  | "unknown";

export interface Observation {
  dimension: string;
  value: string;
  provenance: string;
  observed_at: string;
  source_url?: string | null;
}

export interface Evidence {
  id: string;
  at: string;
  edited_at: string;
  kind: string;
  source_url: string;
  sha256: string;
  body: string;
}

export interface SnapshotItem {
  number: number;
  kind: string;
  title: string;
  url: string;
  unit?: string | null;
  category: string;
  stage: Stage;
  labels: string[];
  head_sha?: string | null;
  dependency_eligible?: boolean | null;
  blockers: string[];
  responsible_seat: string;
  next_action: string;
  candidate_ready_at?: string | null;
  stage_since?: string | null;
  stage_age_seconds?: number | null;
  current_head_pass: boolean;
  history: Evidence[];
  warnings: string[];
  observed_dimensions: Observation[];
  metrics_seconds: Record<string, number>;
}

export interface PlanNode {
  id: string;
  title: string;
  planned: string;
  dependencies: string[];
  critical_path: boolean;
  issue_number?: number | null;
}

export interface SourceCoverage {
  endpoint: string;
  pages: number;
  count: number;
  sha256: string;
}

export interface Snapshot {
  schema: string;
  repository: string;
  collected_at: string;
  plan_commit: string;
  content_sha256: string;
  status: string;
  stale_after_seconds: number;
  last_error?: string | null;
  coverage: SourceCoverage[];
  warnings: string[];
  items: SnapshotItem[];
  plan_nodes: PlanNode[];
  queues: Record<string, number>;
  owner_observations: Observation[];
  native_runtime_status: string;
  token_cost_status: string;
}

export interface GraphSpecNode {
  id: string;
  name?: string | undefined;
  title?: string | undefined;
  tag?: string | undefined;
  g?: string | undefined;
  group?: string | undefined;
  does?: string | undefined;
  built?: string | undefined;
  refs?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  w?: number | undefined;
  d?: number | undefined;
  h?: number | undefined;
  stack?: number | undefined;
}

export type GraphEdgeTuple = readonly [from: string, to: string, kind?: string];

export interface GraphSpec {
  title?: string | undefined;
  groups?: Array<{ id: string; label: string }> | undefined;
  nodes?: GraphSpecNode[] | undefined;
  edges?: GraphEdgeTuple[] | undefined;
  status?: Record<string, { state?: string | undefined; items?: Array<{ c?: string | undefined; l?: string | undefined }> | undefined }> | undefined;
  levels?: Record<string, number> | undefined;
  trace?: string[] | undefined;
  traceText?: Record<string, string> | undefined;
  edgeStatus?: Record<string, string> | undefined;
  edgeDocs?: Record<string, { title?: string | undefined; carries?: string | undefined; refs?: string | undefined }> | undefined;
  short?: Record<string, string> | undefined;
}

export type NodeSignal = "danger" | "warning" | "info" | "success" | "accent" | "muted";

export interface MapNode {
  id: string;
  title: string;
  tag: string;
  groupId: string;
  groupLabel: string;
  description: string;
  detail: string;
  sourceRefs: string[];
  stage: string;
  signal: NodeSignal;
  criticalPath: boolean;
  position?: { x: number; z: number; elevation: number } | undefined;
  item?: SnapshotItem | undefined;
  planned?: string | undefined;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  label: string;
  signal: NodeSignal;
  broken: boolean;
}

export interface MapModel {
  title: string;
  groups: Array<{ id: string; label: string }>;
  nodes: MapNode[];
  edges: MapEdge[];
  trace: string[];
  traceText: Record<string, string>;
  source: "plan" | "graph";
}

export interface FeedState {
  snapshot: Snapshot | null;
  graph: GraphSpec | null;
  receivedAt: number | null;
  loading: boolean;
  source: "api" | "embedded" | "fixture" | "none";
  lastFailure: string | null;
  graphFailure: string | null;
  snapshotEtag: string | null;
  graphEtag: string | null;
}
