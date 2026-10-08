/* Only processes started here are shut down. IPv4 bind prevents the legacy IPv6/IPv4 free-port false positive. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../qa/procs';
const owned:Array<{name:string;child:ChildProcess}>=[];
const profiles:string[]=[];
let logs='';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function assignedPort(child:ChildProcess,read:()=>number|undefined):Promise<number>{
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  if(child.exitCode!==null||child.signalCode!==null)throw Error('owned process exited: '+logs);
  const port=read();if(port){if(port===4190||port===9333)throw Error('reserved port assigned');return port;}
  await sleep(100);
 }throw Error('No assigned port published: '+logs);
}
function start(name:string,cmd:string,args:string[],cwd?:string,env=process.env):ChildProcess{
 const child=spawn(cmd,args,{cwd,env,stdio:['ignore','pipe','pipe']});owned.push({name,child});
 child.stdout?.on('data',(data:Buffer)=>{logs+=`${name}: ${data.toString()}`;});child.stderr?.on('data',(data:Buffer)=>{logs+=`${name}: ${data.toString()}`;});
 child.on('error',error=>{logs+=`${name}: ${error.message}\n`;});return child;
}
async function ready(child:ChildProcess,url:string):Promise<void>{
 const deadline=Date.now()+30000;while(Date.now()<deadline){
  if(child.exitCode!==null||child.signalCode!==null)throw Error(`owned process exited before readiness: ${logs}`);
  try{if((await fetch(url)).ok)return;}catch{/* retry startup */}await sleep(100);
 }throw Error('private runtime failed readiness: '+logs);
}
export async function launchVite(appRoot:string):Promise<{pid:number;port:number;url:string}>{
 const store=mkdtempSync(join(tmpdir(),'iso-rsch-store-'));profiles.push(store);logs+=`store: ${store}\n`;
 // Vite 7 treats port 0 as its default port. Probe an OS-assigned IPv4 port,
 // then retry the entire start if another listener wins the close/bind window.
 for(let attempt=0;attempt<5;attempt++){
  const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');server.close(error=>error?reject(error):resolve(address.port));});});
  const offset=logs.length;
  const child=start('vite',join(appRoot,'node_modules/.bin/vite'),['--config','tests/battery/vite.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort'],appRoot,{...process.env,ISO_BATTERY_STORE_DIR:store});
  try{
   const assigned=await assignedPort(child,()=>{const match=logs.slice(offset).match(/ISO_BATTERY_PORT=(\d+)/);return match?Number(match[1]):undefined;});
   const url=`http://127.0.0.1:${assigned}/`;await ready(child,url);return {pid:child.pid!,port:assigned,url};
  }catch(error){if(!/already in use|EADDRINUSE/.test(logs.slice(offset))||attempt===4)throw error;}
 }
 throw Error('Vite exhausted port retries');
}
export async function launchChrome():Promise<{pid:number;port:number}>{
 const profile=mkdtempSync(join(tmpdir(),'iso-rsch-browser-'));profiles.push(profile);const binary=findChrome();
 const args=['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1440,900','about:blank'];
 if(!binary.includes('headless'))args.unshift('--headless=new');const child=start('chrome',binary,args);
 const port=await assignedPort(child,()=>{try{return Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{return undefined;}});
 await ready(child,`http://127.0.0.1:${port}/json/version`);return {pid:child.pid!,port};
}
export function ownedPids():Array<{name:string;pid:number|undefined}>{return owned.map(({name,child})=>({name,pid:child.pid}));}
export async function killAll():Promise<void>{
 for(const {child} of owned)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
 for(let i=0;i<40&&owned.some(({child})=>child.exitCode===null&&child.signalCode===null);i++)await sleep(100);
 for(const {child} of owned)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
 for(const profile of profiles.splice(0))rmSync(profile,{recursive:true});
}
export function installCleanupHandlers():void{
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'] as const)process.once(signal,()=>{void killAll().then(()=>process.exit(130));});
}
export function saveRuntimeLog(path:string):void{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,logs);}
