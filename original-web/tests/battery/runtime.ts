/* Only processes started here are shut down. IPv4 bind prevents the legacy IPv6/IPv4 free-port false positive. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../qa/procs';
const owned:Array<{name:string;child:ChildProcess}>=[];
const profiles:string[]=[];
let logs='';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function free(range:readonly[number,number]):Promise<number>{
 for(let port=range[0];port<=range[1];port++){
  const available=await new Promise<boolean>(resolve=>{const s=createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
  if(available)return port;
 }throw Error('No private IPv4 port available');
}
function start(name:string,cmd:string,args:string[],cwd?:string):ChildProcess{
 const child=spawn(cmd,args,{cwd,stdio:['ignore','pipe','pipe']});owned.push({name,child});
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
 const port=await free([4300,4399]);const child=start('vite',join(appRoot,'node_modules/.bin/vite'),['--host','127.0.0.1','--port',String(port),'--strictPort'],appRoot);
 const url=`http://127.0.0.1:${port}/`;await ready(child,url);await sleep(100);if(child.exitCode!==null)throw Error('Vite startup raced another listener: '+logs);
 return {pid:child.pid!,port,url};
}
export async function launchChrome():Promise<{pid:number;port:number}>{
 const port=await free([9400,9499]);const profile=mkdtempSync(join(tmpdir(),'iso-rsch-browser-'));profiles.push(profile);const binary=findChrome();
 const args=[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1440,900','about:blank'];
 if(!binary.includes('headless'))args.unshift('--headless=new');const child=start('chrome',binary,args);await ready(child,`http://127.0.0.1:${port}/json/version`);return {pid:child.pid!,port};
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
