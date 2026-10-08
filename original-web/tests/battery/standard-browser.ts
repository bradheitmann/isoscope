/* Existing UX/AX/typography contracts, with this battery's IPv4-safe private launcher. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Recorder } from '../qa/report';
import { staticTypography, computedTypography } from '../qa/typography';
import { openApp, navigationContracts, viewportMatrix, modalContracts, resizeContract, gestureContract, reducedMotionContract, scene100Contract, type Ctx } from '../qa/contracts';
import { installCleanupHandlers, launchChrome, launchVite, killAll, ownedPids, saveRuntimeLog } from './runtime';
const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??join(appRoot,'tests/qa/out/battery-standard.json');
const rec=new Recorder();let ports:unknown={};
installCleanupHandlers();
try{
 const tuples=staticTypography(rec,appRoot);const vite=await launchVite(appRoot),chrome=await launchChrome();ports={vite:vite.port,cdp:chrome.port,pids:ownedPids()};
 const outDir=out+'.screenshots';mkdirSync(outDir,{recursive:true});const ctx:Ctx={appUrl:vite.url,chromePort:chrome.port,outDir,rec};
 const cases:Array<[string,()=>Promise<void>]>= [
  ['typography',async()=>{const s=await openApp(ctx,1440,900);try{await computedTypography(rec,s,tuples);}finally{await s.close();}}],
  ['navigation',()=>navigationContracts(ctx)],['viewport',()=>viewportMatrix(ctx)],['modal',()=>modalContracts(ctx)],['resize',()=>resizeContract(ctx)],
  ['gestures',()=>gestureContract(ctx)],['motion',()=>reducedMotionContract(ctx)],['scene',()=>scene100Contract(ctx)],
 ];
 for(const [name,fn] of cases){try{await fn();}catch(e){rec.add({contract:name,name:'harness error',status:'fail',detail:String(e)});}}
}catch(e){rec.add({contract:'harness',name:'startup',status:'fail',detail:String(e)});}
finally{await killAll();mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({ports,total:rec.results.length,results:rec.results},null,2)+'\n');saveRuntimeLog(out+'.runtime.log');console.log(rec.summary());}
process.exitCode=rec.results.some(r=>r.status==='fail')?1:0;
