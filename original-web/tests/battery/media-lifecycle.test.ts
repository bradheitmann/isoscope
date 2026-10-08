/* Focused lifecycle behavior over named AST declarations: renderer has no importable DOM-free seam.
   These probes supplement, and do not replace, browser integration. */
import { describe, expect, it } from 'vitest';
import { declarations } from './renderer-declarations';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
function run(code:string,context:Record<string,unknown>={}):unknown{return runInNewContext(transpileModule(code,{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.CommonJS,strict:true}}).outputText,{exports:{},...context});}
const warm=declarations('warmupQueue','warmupScheduled','pvByVideo','startVideo','promoteAllNow','scheduleWarmup','idle');
const release=declarations('keepMediaAlive','releaseVideo');
describe('media queue and shared-source lifecycle contracts',()=>{
 it('warmup can be scheduled again after its queue drains [F04]',()=>{
  const callbacks:Array<()=>void>=[];
  /* startVideo now fetches the whole file into a blob before attaching (connection-
     cap fix); the never-resolving fetch stub keeps this lifecycle probe synchronous */
  const result=run(warm+`const a={started:false,video:{},src:'a'};warmupQueue.push(a);scheduleWarmup();callbacks.shift()();const b={started:false,video:{},src:'b'};warmupQueue.push(b);scheduleWarmup();callbacks.length;`,{callbacks,window:{requestIdleCallback:(fn:()=>void)=>callbacks.push(fn)},fetch:()=>new Promise(()=>{}),Promise,emitWide(){}});
  expect(result).toBe(1);
 });
 it('released queue entries cannot be resurrected [F05]',()=>{
  const result=run(warm+release+`const v={src:'',pause(){},removeAttribute(){this.src='';},load(){}};const pv={video:v,src:'gone.mp4',refs:1};videoPool[pv.src]=pv;warmupQueue.push(pv);releaseVideo(pv.src);promoteAllNow();v.src;`,{window:{},videoPool:{},leaveSyncGroup(){}});
  expect(result).toBe('');
 });
 it('delayed media-on cannot override later off [F06]',()=>{
  const q:Array<()=>void>=[];const body=declarations('mediaGen','applyMediaMode');
  const result=run(`let mediaMode=true;const v={paused:true,currentTime:0,play(){this.paused=false;return Promise.resolve();}};const videoPool={a:{video:v,live:false}};`+body+`applyMediaMode();mediaMode=false;v.paused=true;q.shift()();v.paused;`,{q,setTimeout:(fn:()=>void)=>q.push(fn),applySurfaceVisibility(){},promoteAllNow(){},applyAudio(){},refreshTransport(){},RM:false,Promise});
  expect(result).toBe(true);
 });
 it.each([1,2,3,4,6])('%i faces toggle one pooled source only once [F08]',count=>{
  const body=declarations('pvByVideo','mediaControls');
  const result=run(`const v={paused:false,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};const faces=Object.fromEntries(Array.from({length:count},(_,i)=>[i,{video:v}]));const surfacesById={a:faces};`+body+`mediaControls.togglePlay('a');v.paused;`,{count,audibleEntry:()=>null,setAudioFocus(){},Promise});
  expect(result).toBe(true);
 });
 it('preserved release/acquire balances references without stopping video',()=>{
  const body=declarations('acquireVideo');
  const context={videoPool:{src:{refs:1,video:{pause(){throw Error('pause called');}}}},leaveSyncGroup(){}};
  const result=run(warm+release+body+`keepMediaAlive=true;releaseVideo('src');keepMediaAlive=false;acquireVideo('src',{}).refs;`,context);expect(result).toBe(1);
 });
});
