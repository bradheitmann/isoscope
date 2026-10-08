import { describe, expect, it } from 'vitest';
import { buildGallery, genLinear, genPhased, genRandom, scoreLayout } from '../../src/layouts';
import { isoRouteAll } from '../../../router.ts';
import { SEED, overlap, rng, spec } from './seed';

const seeds=Array.from({length:128},(_,i)=>SEED+i);
describe('seeded layout properties',()=>{
  it.each(seeds)('gallery seed %i is finite, deterministic and input-pure',(seed)=>{
    const s=spec(seed,seed%5), before=JSON.stringify(s);
    const g=buildGallery(s.nodes,s.edges,seed);
    expect(g).toEqual(buildGallery(s.nodes,s.edges,seed));
    expect(JSON.stringify(s)).toBe(before);
    for(const c of g){
      expect(Number.isFinite(c.score)).toBe(true);
      expect(Object.keys(c.positions).sort()).toEqual(s.nodes.map(n=>n.id).sort());
      for(const p of Object.values(c.positions))expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);
      expect(overlap(s.nodes,c.positions)).toBe(false);
    }
  });
  it.each(Array.from({length:200},(_,i)=>SEED+1000+i))('router seed %i supports cycles/self-edges without NaN',(seed)=>{
    const s=spec(seed,1+seed%7);
    s.edges.push([s.nodes.at(-1)!.id,s.nodes[0]!.id,'data']);
    if(seed%2===0)s.edges.push([s.nodes[0]!.id,s.nodes[0]!.id,'data']);
    const out=isoRouteAll(s.nodes,s.edges);
    expect(out).toEqual(isoRouteAll(s.nodes,s.edges));
    for(const points of Object.values(out.routes))for(const p of points)expect(p.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(scoreLayout(s.nodes,s.edges))).toBe(true);
  });
  it('mixed footprints stay disjoint after a coordinate permutation [F12]',()=>{
    const n=[{id:'a',x:0,y:0,w:1,d:1},{id:'b',x:2,y:0,w:5,d:1}];
    expect(overlap(n,genRandom(n,()=>0).positions)).toBe(false);
  });
  it('cyclic remainder is id-sorted regardless of input order',()=>{
    const s=spec(SEED,3);s.edges.push(['N2','N0','data']);
    expect(genLinear(s.nodes,s.edges,true).positions).toEqual(genLinear([...s.nodes].reverse(),s.edges,true).positions);
  });
  it('journey precedes topological remainder (regression: degree sort)',()=>{
    const s=spec(SEED,5), p=genLinear(s.nodes,s.edges,true,['N3','N4']).positions;
    expect(p.N3!.x).toBeLessThan(p.N4!.x);expect(p.N4!.x).toBeLessThan(p.N0!.x);
    expect(p.N0!.x).toBeLessThan(p.N1!.x);expect(p.N1!.x).toBeLessThan(p.N2!.x);
  });
  it.each([0,1,500])('%i-node unconnected stress is finite and deterministic',count=>{
    const s=spec(SEED,count,false);const g=buildGallery(s.nodes,s.edges,SEED);
    expect(g).toEqual(buildGallery(s.nodes,s.edges,SEED));
    expect(g.every(c=>Number.isFinite(c.score)&&!overlap(s.nodes,c.positions))).toBe(true);
  });
  it.each([-1e9,-100,0,1e9])('finite extreme coordinates %i',coordinate=>{
    const s=spec(SEED,2);s.nodes[0]!.x=coordinate;
    expect(Number.isFinite(scoreLayout(s.nodes,s.edges))).toBe(true);
  });
  it('phased placement is input-pure',()=>{const s=spec(SEED,8),before=JSON.stringify(s);genPhased(s.nodes,s.edges);expect(JSON.stringify(s)).toBe(before);});
  it('same random seed generates the same coordinate permutation',()=>{const s=spec(SEED,20);expect(genRandom(s.nodes,rng(SEED))).toEqual(genRandom(s.nodes,rng(SEED)));});
});
