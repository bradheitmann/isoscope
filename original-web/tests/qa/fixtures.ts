/* Generated spec fixtures for the QA harness. Expectations in contracts derive from the
   returned Fixture (never from hard-coded labels such as "Area 09"). */

export interface FixtureNode {
  id: string;
  g: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  items: Array<{ c: string; l: string }>;
}

export interface FixtureSpec {
  title: string;
  wordmark: string;
  asOf: string;
  groups: Array<{ id: string; label: string }>;
  nodes: FixtureNode[];
  edges: Array<[string, string, string]>;
}

export interface Fixture {
  kind: "sections" | "groups";
  spec: FixtureSpec;
  pageSize: number;
  /** label of the group that owns the final node */
  lastGroupLabel: string;
  lastNodeId: string;
  lastNodeName: string;
  /** ids of the nodes in the last group */
  lastGroupNodeIds: string[];
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

function finish(kind: Fixture["kind"], spec: FixtureSpec): Fixture {
  const last = spec.nodes[spec.nodes.length - 1];
  if (!last) throw new Error("fixture has no nodes");
  const lastGroup = spec.groups.find(group => group.id === last.g);
  if (!lastGroup) throw new Error("fixture last node has no group");
  return {
    kind,
    spec,
    pageSize: 12,
    lastGroupLabel: lastGroup.label,
    lastNodeId: last.id,
    lastNodeName: last.name,
    lastGroupNodeIds: spec.nodes.filter(node => node.g === lastGroup.id).map(node => node.id)
  };
}

/** 100 sections SEC000-SEC099 spread across `groupCount` groups ("Area NN"), chained by 99 edges. */
export function sectionsFixture(total = 100, groupCount = 10): Fixture {
  const per = Math.ceil(total / groupCount);
  const groups = Array.from({ length: groupCount }, (_, i) => ({ id: `area-${pad(i, 2)}`, label: `Area ${pad(i, 2)}` }));
  const columns = Math.ceil(Math.sqrt(total));
  const nodes: FixtureNode[] = Array.from({ length: total }, (_, i) => ({
    id: `SEC${pad(i, 3)}`,
    g: `area-${pad(Math.floor(i / per), 2)}`,
    name: `Module ${pad(i, 3)}`,
    x: (i % columns) * 2,
    y: Math.floor(i / columns) * 2,
    w: 1,
    d: 1,
    h: 1,
    items: []
  }));
  const edges = nodes.slice(1).map((node, i): [string, string, string] => [nodes[i]!.id, node.id, "data"]);
  return finish("sections", { title: "QA 100 sections", wordmark: "QA", asOf: "fixture", groups, nodes, edges });
}

/** 100 groups with one module each ("Section NNN"), chained by 99 edges. */
export function groupsFixture(total = 100): Fixture {
  const groups = Array.from({ length: total }, (_, i) => ({ id: `section-${pad(i, 3)}`, label: `Section ${pad(i, 3)}` }));
  const columns = Math.ceil(Math.sqrt(total));
  const nodes: FixtureNode[] = groups.map((group, i) => ({
    id: `GRP${pad(i, 3)}`,
    g: group.id,
    name: `Unit ${pad(i, 3)}`,
    x: (i % columns) * 2,
    y: Math.floor(i / columns) * 2,
    w: 1,
    d: 1,
    h: 1,
    items: []
  }));
  const edges = nodes.slice(1).map((node, i): [string, string, string] => [nodes[i]!.id, node.id, "data"]);
  return finish("groups", { title: "QA 100 groups", wordmark: "QA", asOf: "fixture", groups, nodes, edges });
}
