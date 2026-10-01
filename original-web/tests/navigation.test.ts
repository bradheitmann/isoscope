import { describe, expect, it } from "vitest";
import { pageNavigation, type NavigationGroup, type NavigationNode } from "../src/navigation";

describe("module navigation paging", () => {
  const groups: NavigationGroup[] = Array.from({ length: 100 }, (_, index) => ({
    id: `section-${String(index).padStart(3, "0")}`,
    label: `Section ${String(index).padStart(3, "0")}`
  }));
  const nodes: NavigationNode[] = groups.map((group, index) => ({
    id: `SEC${String(index).padStart(3, "0")}`,
    name: `Module ${String(index).padStart(3, "0")}`,
    groupId: group.id
  }));

  it("bounds initial rendering and restores complete results through paging", () => {
    const first = pageNavigation(groups, nodes, "", 0, 12);
    expect(first.matchCount).toBe(100);
    expect(first.end).toBe(12);
    expect(first.groups.flatMap(group => group.nodes)).toHaveLength(12);
    expect(first.groups).toHaveLength(12);
    expect(first.nextOffset).toBe(12);

    const last = pageNavigation(groups, nodes, "", 96, 12);
    expect(last.matchCount).toBe(100);
    expect(last.start).toBe(96);
    expect(last.end).toBe(100);
    expect(last.nextOffset).toBeNull();
    expect(last.groups[0]?.group.label).toBe("Section 096");
  });

  it("finds a target by module id, module name, or its group label", () => {
    for (const query of ["SEC099", "Module 099", "Section 099"]) {
      const result = pageNavigation(groups, nodes, query, 0, 12);
      expect(result.matchCount).toBe(1);
      expect(result.groups[0]?.group.label).toBe("Section 099");
      expect(result.groups[0]?.nodes[0]?.id).toBe("SEC099");
    }
  });

  it("search resets naturally to a bounded first page and reports empty results", () => {
    const narrowed = pageNavigation(groups, nodes, "Module", 84, 12);
    expect(narrowed.start).toBe(84);
    expect(narrowed.nextOffset).toBe(96);
    const noResults = pageNavigation(groups, nodes, "not present", 0, 12);
    expect(noResults.matchCount).toBe(0);
    expect(noResults.groups).toHaveLength(0);
    expect(noResults.nextOffset).toBeNull();
  });

  it("rejects invalid page bounds instead of silently expanding the rendered list", () => {
    expect(() => pageNavigation(groups, nodes, "", -1, 12)).toThrow(RangeError);
    expect(() => pageNavigation(groups, nodes, "", 0, 0)).toThrow(RangeError);
  });
});
