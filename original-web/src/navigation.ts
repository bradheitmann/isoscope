export interface NavigationGroup {
  readonly id: string;
  readonly label: string;
}

export interface NavigationNode {
  readonly id: string;
  readonly name: string;
  readonly groupId: string;
}

export interface NavigationPage<T extends NavigationNode> {
  readonly groups: ReadonlyArray<{ readonly group: NavigationGroup; readonly nodes: ReadonlyArray<T> }>;
  readonly matchCount: number;
  readonly start: number;
  readonly end: number;
  readonly nextOffset: number | null;
}

export function pageNavigation<T extends NavigationNode>(
  groups: ReadonlyArray<NavigationGroup>,
  nodes: ReadonlyArray<T>,
  query: string,
  offset: number,
  pageSize: number
): NavigationPage<T> {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("Navigation page bounds must be nonnegative integers and page size must be positive");
  }
  const labels = new Map(groups.map(group => [group.id, group.label] as const));
  const needle = query.trim().toLocaleLowerCase();
  const matches = nodes.filter(node => {
    if (!needle) return true;
    const haystack = `${node.id} ${node.name} ${labels.get(node.groupId) ?? node.groupId}`.toLocaleLowerCase();
    return haystack.includes(needle);
  });
  const start = Math.min(offset, matches.length);
  const end = Math.min(start + pageSize, matches.length);
  const page = matches.slice(start, end);
  const byGroup = new Map<string, T[]>();
  for (const node of page) {
    const entries = byGroup.get(node.groupId) ?? [];
    entries.push(node);
    byGroup.set(node.groupId, entries);
  }
  const groupById = new Map(groups.map(group => [group.id, group] as const));
  const visibleGroups = [...byGroup].map(([id, entries]) => ({
    group: groupById.get(id) ?? { id, label: id },
    nodes: entries
  }));
  return {
    groups: visibleGroups,
    matchCount: matches.length,
    start,
    end,
    nextOffset: end < matches.length ? end : null
  };
}
