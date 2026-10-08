export const SEED = 0x157149;
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}
export interface TestNode { id: string; g: string; name: string; x: number; y: number; w: number; d: number; h: number }
export interface TestSpec {
  title: string; groups: Array<{ id: string; label: string }>; nodes: TestNode[];
  edges: Array<[string, string, string]>; status: Record<string, { state: string; items: Array<{c: string; l: string}> }>;
  levels: Record<string, number>; trace: string[]; traceText: Record<string, string>;
  intro: { eyebrow: string; title: string; sub: string; proseHTML: string };
}
export function spec(seed: number, count = seed % 6, edges = true): TestSpec {
  const random = rng(seed);
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `N${i}`, g: `G${i % 3}`, name: `Node ${i}`, x: (i % 20) * 6 - 12,
    y: Math.floor(i / 20) * 6 - 6, w: 1 + Math.floor(random() * 3), d: 1 + Math.floor(random() * 3), h: 1,
  }));
  return { title: `Seed ${seed}`, groups: Array.from({ length: 3 }, (_, i) => ({ id: `G${i}`, label: `Group ${i}` })), nodes,
    edges: edges && count > 1 ? nodes.slice(1).map((n,i) => [nodes[i]!.id,n.id,'data']) : [],
    status: Object.fromEntries(nodes.map(n => [n.id,{state:'ok',items:[]}])) ,
    levels: Object.fromEntries(nodes.map((n,i) => [n.id,i % 3])), trace: [], traceText: {},
    intro: { eyebrow: 'battery', title: `Seed ${seed}`, sub: '', proseHTML: '<p>Fixture</p>' } };
}
export function overlap(nodes: Array<{id:string; w:number; d:number}>, positions: Record<string,{x:number;y:number}>): boolean {
  return nodes.some((a,i) => nodes.slice(i+1).some(b => {
    const x=positions[a.id]!, y=positions[b.id]!;
    return x.x < y.x+b.w && x.x+a.w > y.x && x.y < y.y+b.d && x.y+a.d > y.y;
  }));
}
