declare module "*.mjs" {
  export function isoRouteAll(
    nodes: ReadonlyArray<{ id: string; x: number; y: number; w: number; d: number }>,
    edges: ReadonlyArray<readonly [string, string, string?]>,
  ): {
    routes: Record<string, Array<[number, number]>>;
    hops: Record<string, Array<[number, number]>>;
    qc: Record<string, unknown>;
  };
}
