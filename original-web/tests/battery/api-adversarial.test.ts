import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApiHandler } from '../../server/api';
import { SEED, rng } from './seed';
let dir:string, server:Server, base:string;
beforeAll(async()=>{
  dir=mkdtempSync(join(tmpdir(),'iso-battery-api-'));
  const handler=createApiHandler({annotationsPath:join(dir,'annotations.json'),uploadDir:join(dir,'uploads'),telemetryDbPath:join(dir,'telemetry.db'),maxTelemetryBytes:4000,maxUploadBytes:1000});
  server=createServer((req,res)=>{void handler(req,res,()=>{res.writeHead(404);res.end();});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async()=>{await new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});rmSync(dir,{recursive:true});});
const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const get=(path:string)=>fetch(base+path);
const ev=(edge:string,status='OK',duration_ms=1)=>({'isoscope.edge':edge,name:'battery',status,duration_ms,end_time_unix_nano:Date.now()*1e6});
describe('real HTTP and node:sqlite integration',()=>{
  it('round-trips batches and validates SQLite count directly',async()=>{
    const list=Array.from({length:20},(_,i)=>ev('batch'+i%2,i%3===0?'ERROR':'OK',i));
    expect(await (await post('/api/telemetry',list)).json()).toEqual({ok:true,count:20});
    const db=new DatabaseSync(join(dir,'telemetry.db'));try{expect((db.prepare('SELECT count(*) n FROM wide_events').get() as {n:number}).n).toBe(20);}finally{db.close();}
  });
  it.each([['?edge=batch0',10],['?edge=batch1',10],['?edge=batch0&status=ERROR',4],['?edge=batch1&status=OK',7],['?status=ERROR',7],['?edge=absent',0],['?limit=0',0],['?limit=3',3]])('filters %s return %i rows',async(query,count)=>{expect(await (await get('/api/telemetry'+query)).json()).toHaveLength(count);});
  it('health aggregate matches independently counted outcomes',async()=>{const h=await (await get('/api/telemetry/health')).json() as Array<{edge:string;total:number;errors:number}>;expect(h.find(x=>x.edge==='batch0')).toMatchObject({total:10,errors:4});});
  it('recovered edge is no longer broken at attention endpoint [F15]',async()=>{await post('/api/telemetry',[ev('recover','ERROR'),ev('recover','OK')]);const h=await (await get('/api/telemetry/attention')).json() as Array<{edge:string;health:string}>;expect(h.find(x=>x.edge==='recover')?.health).not.toBe('broken');});
  it.each(Array.from({length:64},(_,i)=>i))('seeded CRUD module %i preserves other records',async i=>{
    const id=`module-${i}`,rec={notes:`seed ${SEED+i}`,faces:{north:{kind:'doc',text:`note ${i}`}},inside:[]};
    expect((await post('/api/annotations/'+id,rec)).status).toBe(200);expect((await (await get('/api/annotations')).json() as Record<string,unknown>)[id]).toEqual(rec);
    expect((await fetch(base+'/api/annotations/'+id,{method:'DELETE'})).status).toBe(200);expect((await (await get('/api/annotations')).json() as Record<string,unknown>)[id]).toBeUndefined();
  });
  it.each(["' OR 1=1 --",'"; DROP TABLE wide_events; --',"x');DELETE FROM wide_events;--",'__proto__','constructor','%00','../../secret'])('query treats %j literally',async edge=>{
    await post('/api/telemetry',[ev(edge)]);const rows=await (await get('/api/telemetry?edge='+encodeURIComponent(edge))).json() as Record<string,unknown>[];
    expect(rows).toHaveLength(1);expect(rows[0]!['isoscope.edge']).toBe(edge);expect((await get('/api/telemetry/health')).status).toBe(200);
  });
  it.each(['{','[','][','null garbage','{"name":','{"x":NaN}','{"x":Infinity}','\u0000',''])('malformed JSON %j is 400',async body=>{const r=await fetch(base+'/api/telemetry',{method:'POST',body});expect(r.status).toBe(400);expect((await get('/api/annotations')).status).toBe(200);});
  const invalid:unknown[]=[null,[null],42,true,'text',{duration_ms:'not-number'},[{duration_ms:'not-number'}],{duration_ms:[]},[[null]],{end_time_unix_nano:{}}];
  it.each(Array.from({length:100},(_,i)=>({i,body:invalid[i%invalid.length]})))('invalid telemetry seed case $i returns clean 4xx',async({body})=>{const r=await post('/api/telemetry',body);expect(r.status).toBeGreaterThanOrEqual(400);expect(r.status).toBeLessThan(500);expect((await get('/api/annotations')).status).toBe(200);});
  it('partial failing batch rolls back preceding inserted rows',async()=>{const r=await post('/api/telemetry',[ev('rollback'),null]);expect(r.status).toBeGreaterThanOrEqual(400);expect(await (await get('/api/telemetry?edge=rollback')).json()).toEqual([]);});
  it('oversized telemetry and upload are rejected without destabilizing server',async()=>{expect((await post('/api/telemetry',[{name:'x'.repeat(5000)}])).status).toBe(413);expect((await fetch(base+'/api/upload?name=large.png',{method:'POST',body:new Uint8Array(2000)})).status).toBe(413);expect((await get('/api/annotations')).status).toBe(200);});
  it.each(['../../outside.png','..\\..\\outside.png','/tmp/outside.png','a%2Foutside.png','../../a.html','x.svg','x.ts'])('upload path %j cannot escape or execute',async name=>{
    const random=rng(SEED),data=Uint8Array.from({length:32},()=>Math.floor(random()*256));const r=await fetch(base+'/api/upload?name='+encodeURIComponent(name),{method:'POST',body:data});
    if(/\.(html|svg|ts)$/.test(name)){expect(r.status).toBe(415);return;}expect(r.status).toBe(200);const result=await r.json() as {src:string};expect(result.src.startsWith('/media/uploads/')).toBe(true);
    expect(readdirSync(join(dir,'uploads'))).toContain(basename(result.src));expect(readFileSync(join(dir,'uploads',basename(result.src)))).toEqual(Buffer.from(data));
  });
  it('cross-origin telemetry and annotation writes are refused',async()=>{for(const path of ['/api/telemetry','/api/annotations/denied'])expect((await fetch(base+path,{method:'POST',headers:{origin:'https://evil.example'},body:'{}'})).status).toBe(403);});
});
