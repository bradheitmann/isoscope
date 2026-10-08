/* Focused lifecycle behavior over exact source excerpts: renderer has no importable DOM-free seam.
   These probes supplement, and do not replace, browser integration. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
const source=readFileSync(new URL('../../src/original-renderer.ts',import.meta.url),'utf8');
function part(start:string,end:string):string{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('renderer probe boundary missing');return source.slice(a,b);}
function run(code:string,context:Record<string,unknown>={}):unknown{return runInNewContext(transpileModule(code,{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.CommonJS,strict:true}}).outputText,{exports:{},...context});}
const warm=part('const warmupQueue:','function acquireVideo(');
const release=part('let keepMediaAlive=','/* one VideoTexture');
describe('media queue and shared-source lifecycle contracts',()=>{
 it('warmup can be scheduled again after its queue drains [F04]',()=>{
  const callbacks:Array<()=>void>=[];
  const result=run(warm+`const a={started:false,video:{},src:'a'};warmupQueue.push(a);scheduleWarmup();callbacks.shift()();const b={started:false,video:{},src:'b'};warmupQueue.push(b);scheduleWarmup();callbacks.length;`,{callbacks,window:{requestIdleCallback:(fn:()=>void)=>callbacks.push(fn)}});
  expect(result).toBe(1);
 });
 it('released queue entries cannot be resurrected [F05]',()=>{
  const result=run(warm+release+`const v={src:'',pause(){},removeAttribute(){this.src='';},load(){}};const pv={video:v,src:'gone.mp4',refs:1};videoPool[pv.src]=pv;warmupQueue.push(pv);releaseVideo(pv.src);promoteAllNow();v.src;`,{window:{},videoPool:{},leaveSyncGroup(){}});
  expect(result).toBe('');
 });
 it('delayed media-on cannot override later off [F06]',()=>{
  const q:Array<()=>void>=[];const body=part('function applyMediaMode()','$("btnMedia").addEventListener');
  const result=run(`let mediaMode=true;const v={paused:true,currentTime:0,play(){this.paused=false;return Promise.resolve();}};const videoPool={a:{video:v,live:false}};`+body+`applyMediaMode();mediaMode=false;v.paused=true;q.shift()();v.paused;`,{q,setTimeout:(fn:()=>void)=>q.push(fn),applySurfaceVisibility(){},promoteAllNow(){},applyAudio(){},refreshTransport(){},RM:false,Promise});
  expect(result).toBe(true);
 });
 it.each([1,2,3,4,6])('%i faces toggle one pooled source only once [F08]',count=>{
  const body=part('const mediaControls=','/* ————— the one audio button');
  const result=run(`const v={paused:false,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};const faces=Object.fromEntries(Array.from({length:count},(_,i)=>[i,{video:v}]));const surfacesById={a:faces};`+body+`mediaControls.togglePlay('a');v.paused;`,{count,audibleEntry:()=>null,setAudioFocus(){},Promise});
  expect(result).toBe(true);
 });
 it('preserved release/acquire balances references without stopping video',()=>{
  const body=part('function acquireVideo(','/* a layout-only rebuild');
  const context={videoPool:{src:{refs:1,video:{pause(){throw Error('pause called');}}}},leaveSyncGroup(){}};
  const result=run(release+body+`keepMediaAlive=true;releaseVideo('src');keepMediaAlive=false;acquireVideo('src',{}).refs;`,context);expect(result).toBe(1);
 });
});
