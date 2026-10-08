/* Private-port CDP battery. Run from original-web: bun tests/battery/browser.ts --out=/absolute/results.json */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { transpileModule, ScriptTarget } from 'typescript';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Session } from '../qa/cdp';
import { installCleanupHandlers, killAll, launchChrome, launchVite, ownedPids, saveRuntimeLog } from './runtime';
import { SEED, spec, type TestSpec } from './seed';
const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const rendererSource=readFileSync(join(appRoot,'src/original-renderer.ts'),'utf8');
const iconSource=transpileModule(rendererSource.slice(rendererSource.indexOf('function setCanonicalIcon('),rendererSource.indexOf('setCanonicalIcon($')), {compilerOptions:{target:ScriptTarget.ES2022,strict:true}}).outputText;
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??join(appRoot,'tests/qa/out/battery-browser.json');
interface Result { name:string; category:string; status:'pass'|'fail'; detail:string; durationMs:number }
const results:Result[]=[];
const assert=(condition:unknown,message:string):void=>{if(!condition)throw Error(message);};
async function check(category:string,name:string,fn:()=>Promise<void>):Promise<void>{
  const start=performance.now();try{await fn();results.push({category,name,status:'pass',detail:'',durationMs:performance.now()-start});}
  catch(e){const detail=e instanceof Error?e.message:String(e);results.push({category,name,status:'fail',detail,durationMs:performance.now()-start});console.log('FAIL',category,name,detail.slice(0,300));}
}
interface Swap {nodes:Array<{id:string;lvl:number;anchor:number[]}>; grids:number[];edges:Record<string,unknown>;stacked:boolean;center:{x:number;z:number}; bounds:{x0:number;x1:number;z0:number;z1:number}}
let page:Session|undefined;
let appUrl='';let ports:unknown={};let runtimeExceptions:string[]=[];
const state=()=>page!.eval<Swap>('window.__isoSwapState()');
const click=(id:string)=>page!.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
const apply=(s:TestSpec)=>page!.eval(`window.__isoApplySpec(${JSON.stringify(s)})`);
async function boot(url=appUrl):Promise<void>{await page!.navigate(url,'typeof window.__isoApplySpec === "function" && window.__lblTick > 1',45000);}
installCleanupHandlers();
try{
  const vite=await launchVite(appRoot),chrome=await launchChrome();appUrl=vite.url;ports={vite:vite.port,cdp:chrome.port,pids:ownedPids()};
  console.log(JSON.stringify({seed:SEED,...ports as object}));page=await Session.open(chrome.port);
  await page.send('Network.enable');await page.send('Network.setBlockedURLs',{urls:['*.mp4','*.mp3','*.webm','*.wav','*.m4a','*.mov']});
  await page.setReducedMotion(true);await page.setViewport(1440,900);
  await check('regression','boot and SVG points icon registration',async()=>{await boot();assert(page!.exceptions.length===0,page!.exceptions.join('\n'));assert((await state()).nodes.length>0,'no nodes');assert(await page!.eval('document.querySelectorAll("#mapControls svg").length > 5'),'rail icons missing');});
  await check('regression','SVG polyline points attribute does not crash registration',async()=>{assert(await page!.eval(`(()=>{${iconSource};const button=document.createElement('button');setCanonicalIcon(button,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="1 2 3 4"/></svg>');return button.querySelector('polyline').getAttribute('points')==='1 2 3 4';})()`),'points lost');});
  for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg" onload="window.__batteryXss=4"/>','<svg xmlns="http://www.w3.org/2000/svg"><script>window.__batteryXss=4</script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="javascript:alert(1)"/></svg>'])await check('security',`unsafe SVG refused: ${svg}`,async()=>{assert(await page!.eval(`(()=>{${iconSource};try{setCanonicalIcon(document.createElement('button'),${JSON.stringify(svg)});return false;}catch{return true;}})()`),'unsafe SVG accepted');});
  const original=(await state()).nodes.map(n=>n.id);
  await check('regression','SPEC clone survives three codebase round-trips',async()=>{for(let i=0;i<3;i++){await click('btnCodebase');assert(JSON.stringify((await state()).nodes.map(n=>n.id))!==JSON.stringify(original),'codebase did not change');await click('btnCodebase');assert(JSON.stringify((await state()).nodes.map(n=>n.id))===JSON.stringify(original),'curated spec corrupted');}});
  await check('regression','shuffle visits seven boards and wraps',async()=>{const titles:string[]=[];for(let i=0;i<8;i++){await click('btnShuffle');titles.push(await page!.eval<string>('document.getElementById("btnShuffle").title'));}assert(titles.slice(0,7).every((t,i)=>t.includes(`(${i+1}/7)`)),JSON.stringify(titles));assert(titles[7]===titles[0],'wrap differs');});
  await check('regression','Stack grids match zero-based node levels',async()=>{const s=spec(SEED,6,false);await apply(s);if(!(await state()).stacked)await click('btnStack');const st=await state();const expected=[...new Set(st.nodes.map(n=>n.lvl*2.8-0.01))].sort((a,b)=>a-b);assert(JSON.stringify(st.grids.sort((a,b)=>a-b))===JSON.stringify(expected),JSON.stringify(st));});
  await check('e2e','grid toggle survives Stack rebuild',async()=>{await click('btnGrid');const before=await page!.eval('document.getElementById("btnGrid").getAttribute("aria-pressed")');await click('btnStack');assert(await page!.eval('document.getElementById("btnGrid").getAttribute("aria-pressed")')===before,'grid preference lost');await click('btnGrid');});
  for(const kind of ['module','edge'] as const)await check('e2e',`deep link ${kind}`,async()=>{const s=spec(SEED,3);await apply(s);const id=kind==='module'?'N1':'N0-N1';await page!.eval(`location.hash=${JSON.stringify('#/'+kind+'/'+id)}`);await page!.eval('new Promise(r=>setTimeout(r,30))');const selected=await page!.eval<{pinned:string|null;selEdge:string|null}>('window.__isoSwapState()');assert(kind==='module'?selected.pinned===id:selected.selEdge===id,JSON.stringify(selected));});
  for(let i=0;i<120;i++)await check('fuzz',`valid applySpec seed ${SEED+i}`,async()=>{
    const s=spec(SEED+i,i%6);if(i%4===0&&s.nodes.length)s.edges.push([s.nodes[0]!.id,s.nodes[0]!.id,'data']);if(i%7===0&&s.nodes.length>1)s.edges.push([s.nodes.at(-1)!.id,s.nodes[0]!.id,'data']);
    if(i%11===0)s.nodes.forEach(n=>{n.x+=1e6;n.y-=1e6;});await apply(s);const st=await state();assert(st.nodes.length===s.nodes.length,'node loss');assert(st.nodes.every(n=>n.anchor.every(Number.isFinite)),'nonfinite anchors');
  });
  for(let i=0;i<60;i++)await check('validation',`invalid applySpec is rejected atomically ${i}`,async()=>{
    await apply(spec(SEED,3));const before=await state();const s:unknown=(()=>{const v=spec(SEED+i,3);switch(i%6){case 0:v.nodes[1]!.id=v.nodes[0]!.id;return v;case 1:v.edges.push(['N0','MISSING','data']);return v;case 2:return {...v,nodes:null};case 3:v.nodes[0]!.w=-1;return v;case 4:v.nodes[0]!.x=Number.NaN;return v;default:return {...v,nodes:[null]};}})();
    const outcome=await page!.eval<{threw:boolean;name?:string;message?:string}>(`(()=>{try{const value=${JSON.stringify(s)};if(${i%6===4})value.nodes[0].x=NaN;window.__isoApplySpec(value);return {threw:false};}catch(e){return {threw:true,name:e.name,message:e.message};}})()`);
    assert(outcome.threw,'invalid spec was accepted');assert(outcome.name==='Error'&&!/Cannot read/.test(outcome.message??''),'unclean validation: '+JSON.stringify(outcome));assert(JSON.stringify((await state()).nodes)===JSON.stringify(before.nodes),'partial mutation');
  });
  await check('stress','500-node applySpec without edges',async()=>{await apply(spec(SEED,500,false));const st=await state();assert(st.nodes.length===500,'missing nodes');assert(st.nodes.every(n=>n.anchor.every(Number.isFinite)),'NaN');});
  await check('security','intro and node name markup does not execute',async()=>{
    const s=spec(SEED,1);s.nodes[0]!.name='<img src=x onerror="window.__batteryXss=1">';s.intro.proseHTML='<img src=x onerror="window.__batteryXss=1"><a href="javascript:window.__batteryXss=1">click</a>';await page!.eval('window.__batteryXss=0');await apply(s);await page!.eval('new Promise(r=>setTimeout(r,60))');assert(await page!.eval('window.__batteryXss')===0,'executable markup');assert(await page!.eval('!document.querySelector("#panelProse [onerror], #panelProse a[href^=javascript]")'),'unsafe attribute survived');
  });
  await check('security','overview status label cannot execute HTML [F02]',async()=>{
    const s=spec(SEED,1);s.status.N0={state:'ok',items:[{c:'amber',l:'<img src="/battery-missing.png" onerror="window.__batteryXss=2">'}]};await page!.eval('window.__batteryXss=0');await apply(s);await page!.eval('new Promise(r=>setTimeout(r,100))');assert(await page!.eval('window.__batteryXss')===0,'overview injected handler executed');
  });
  await check('security','annotation doc text cannot execute HTML',async()=>{
    await boot();const s=spec(SEED,1);await apply(s);await page!.eval(`(async()=>{const a=await import('/src/annotations.ts');await a.setFace('N0','north',{kind:'doc',text:'<img src=x onerror="window.__batteryXss=3">'});window.__batteryXss=0;})()`);await apply(s);await page!.eval('new Promise(r=>setTimeout(r,60))');assert(await page!.eval('window.__batteryXss')===0,'annotation executed');
  });
  await check('integration','real Vite annotations CRUD and telemetry SQLite routes',async()=>{
    const rec={notes:'Vite battery'};let r=await fetch(appUrl+'api/annotations/battery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)});assert(r.status===200,'post '+r.status);
    const store=await (await fetch(appUrl+'api/annotations')).json() as Record<string,unknown>;assert(JSON.stringify(store.battery)===JSON.stringify(rec),'CRUD read mismatch');r=await fetch(appUrl+'api/annotations/battery',{method:'DELETE'});assert(r.status===200,'delete failed');
    const query=appUrl+'api/telemetry?edge=battery-vite&status=OK&limit=500';const before=(await (await fetch(query)).json() as unknown[]).length;
    r=await fetch(appUrl+'api/telemetry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([{'isoscope.edge':'battery-vite',name:'vite',status:'OK',duration_ms:1,end_time_unix_nano:Date.now()*1e6}])});assert(r.status===200,'SQLite POST '+r.status);
    assert((await (await fetch(query)).json() as unknown[]).length===Math.min(500,before+1),'filter mismatch');for(const route of ['health','attention'])assert((await fetch(appUrl+'api/telemetry/'+route)).status===200,route+' failed');
  });
  await check('e2e','foreign ?spec map and disabled unrelated codebase pair',async()=>{
    const s=spec(SEED,4);await page!.send('Fetch.enable',{patterns:[{urlPattern:appUrl+'battery-foreign.json',requestStage:'Request'}]});
    page!.on('Fetch.requestPaused',params=>{void page!.send('Fetch.fulfillRequest',{requestId:params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(s)).toString('base64')});});
    await boot(appUrl+'?spec='+encodeURIComponent('/battery-foreign.json'));await page!.eval('new Promise(r=>setTimeout(r,150))');assert((await state()).nodes.length===4,'foreign map not loaded');assert(await page!.eval('document.getElementById("btnCodebase").getAttribute("aria-disabled")')==='true','foreign map can jump to unrelated repo');await page!.send('Fetch.disable');
  });
  await check('security','?spec encoded traversal does not expose outside-root secret',async()=>{
    const response=await fetch(appUrl+'@fs/etc/passwd');assert(response.status===403,'outside-root filesystem URL was exposed: '+response.status);
  });
  await check('e2e','390px rail opens, dismisses and remains within viewport',async()=>{
    await page!.setViewport(390,844);await boot();assert(await page!.eval('document.getElementById("railToggle").getAttribute("aria-expanded")')!=='true','rail starts open');await click('railToggle');assert(await page!.eval('document.getElementById("mapControls").classList.contains("rail-open")'),'rail failed to open');
    await page!.eval('document.getElementById("canvasWrap").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');assert(await page!.eval('document.getElementById("railToggle").getAttribute("aria-expanded")')==='false','rail failed dismissal');assert(await page!.eval('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow');
  });
  runtimeExceptions=page.exceptions;
}catch(e){results.push({name:'harness execution',category:'harness',status:'fail',detail:String(e),durationMs:0});}
finally{
  if(page)await page.close();await killAll();mkdirSync(dirname(out),{recursive:true});saveRuntimeLog(out+'.runtime.log');
  const summary={seed:SEED,ports,passed:results.filter(r=>r.status==='pass').length,failed:results.filter(r=>r.status==='fail').length,total:results.length,results,runtimeExceptions,cleanup:'owned processes stopped by harness'};
  writeFileSync(out,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed,out}));
}
process.exitCode=results.some(r=>r.status==='fail')?1:0;
