/* Bounded subprocesses keep dense-router stress from freezing the browser battery. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isoRouteAll } from '../router.ts';
import { buildGallery } from '../original-web/src/layouts.ts';
const cases=['router-empty','gallery-empty','router-sparse','router-chain'] as const;
type Case=typeof cases[number];
const child=process.argv.find(a=>a.startsWith('--child='))?.slice(8) as Case|undefined;
if(child){
 const nodes=Array.from({length:500},(_,i)=>({id:`N${i}`,x:(i%20)*6,y:Math.floor(i/20)*6,w:1,d:1,g:`G${i%5}`}));
 const edges:Array<[string,string]>=child==='router-chain'?nodes.slice(1).map((n,i)=>[nodes[i]!.id,n.id]):child==='router-sparse'?nodes.slice(1,21).map((n,i)=>[nodes[i]!.id,n.id]):[];
 const before=JSON.stringify(nodes);const start=performance.now();
 const result=child==='gallery-empty'?buildGallery(nodes,edges,0x157149):isoRouteAll(nodes,edges);
 if(JSON.stringify(nodes)!==before)throw Error('input mutated');
 const finite=!JSON.stringify(result).includes('null');if(!finite)throw Error('nonfinite numeric result');
 console.log(JSON.stringify({case:child,nodes:500,edges:edges.length,durationMs:performance.now()-start,finite}));
}else{
 interface Result {case:Case;status:'pass'|'fail'|'timeout';exit:number|null;signal:string|null;stdout:string;stderr:string;budgetMs:number}
 const results:Result[]=[];
 for(const name of cases){
  results.push(await new Promise<Result>(resolve=>{
   const p=spawn('bun',[fileURLToPath(import.meta.url),'--child='+name],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
   p.stdout.on('data',(b:Buffer)=>{stdout+=b.toString();});p.stderr.on('data',(b:Buffer)=>{stderr+=b.toString();});
   const timer=setTimeout(()=>{timedOut=true;p.kill('SIGTERM');},15000);
   p.once('exit',(exit,signal)=>{clearTimeout(timer);resolve({case:name,status:timedOut?'timeout':exit===0?'pass':'fail',exit,signal,stdout,stderr,budgetMs:15000});});
   p.once('error',e=>{clearTimeout(timer);resolve({case:name,status:'fail',exit:null,signal:null,stdout,stderr:e.message,budgetMs:15000});});
  }));
 }
 const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out)writeFileSync(out,JSON.stringify({seed:0x157149,total:results.length,results},null,2)+'\n');console.log(results);process.exitCode=results.some(r=>r.status!=='pass')?1:0;
}
