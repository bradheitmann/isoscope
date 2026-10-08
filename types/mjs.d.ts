// see D28: temporary typed declarations for the untyped .mjs engine files; drop when they are ported to TS.
declare module "*/build.mjs" {
  export function buildHtml(spec: unknown, opts?: { specLabel?: string }): string;
}
declare module "*/router.mjs" {
  export function isoRouteAll(nodes: any[], edges: any[]): { qc: any; [k: string]: any };
}
