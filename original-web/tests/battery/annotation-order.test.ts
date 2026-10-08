import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
describe('annotation persistence initialization and ordering',()=>{
 it('saved mirror survives the first production-style edit [F01]',async()=>{
  vi.resetModules();const memory=new Map([['isoscope.annotations',JSON.stringify({A:{notes:'old',faces:{north:{kind:'doc',text:'preserve'}}}})]]);
  vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true})));
  const a=await import('../../src/annotations');await a.setNotes('A','new');expect(JSON.parse(memory.get('isoscope.annotations')!).A.faces).toEqual({north:{kind:'doc',text:'preserve'}});
 });
 it('later desired state cannot be overwritten by earlier request [F03]',async()=>{
  vi.resetModules();vi.stubGlobal('localStorage',{setItem(){}});let durable='';const pending:Array<()=>void>=[];
  vi.stubGlobal('fetch',vi.fn((url:string,opts?:RequestInit)=>{
   if(url==='api/annotations'&&!opts?.method)return Promise.resolve({ok:true,json:async()=>({})});
   if(opts?.method!=='POST'||!url.startsWith('api/annotations/'))return Promise.resolve({ok:true});
   return new Promise(resolve=>pending.push(()=>{durable=String(opts.body);resolve({ok:true});}));
  }));
  const a=await import('../../src/annotations');const first=a.setNotes('A','old');const second=a.setNotes('A','new');
  // Flush the newer request first if writes are parallel. A serialized implementation submits only the first.
  await vi.waitFor(()=>expect(pending.length).toBeGreaterThan(0));
  if(pending.length===2){pending[1]!();pending[0]!();}else{pending[0]!();await first;await vi.waitFor(()=>expect(pending.length).toBe(2));pending[1]!();}
  await Promise.all([first,second]);expect(JSON.parse(durable)).toEqual(a.getModule('A'));
 });
});
