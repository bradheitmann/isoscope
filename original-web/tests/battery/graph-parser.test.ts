import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SEED } from './seed';
let dir:string;
beforeAll(()=>{
  dir=mkdtempSync(join(tmpdir(),'iso-battery-graph-'));mkdirSync(join(dir,'src'));
  writeFileSync(join(dir,'src/a.ts'),'export const a=1;');writeFileSync(join(dir,'src/b.ts'),'export const b=1;');
  writeFileSync(join(dir,'grouping.json'),JSON.stringify({groups:[{id:'g',label:'sources'}],rules:[{match:'^src/a\\.ts$',mod:{id:'A',tag:'A',g:'g',name:'A',blurb:'A'}},{match:'^src/b\\.ts$',mod:{id:'B',tag:'B',g:'g',name:'B',blurb:'B'}},{match:'^<ext>:',mod:{id:'EXT',tag:'E',g:'g',name:'External',blurb:'External'}}]}));
  execFileSync('git',['init','--quiet',dir]);execFileSync('git',['-C',dir,'add','src']);
});
afterAll(()=>rmSync(dir,{recursive:true}));
function generate(text:string): {edges:string[][];nodes:Array<{id:string}>}{
  writeFileSync(join(dir,'src/a.ts'),text);return JSON.parse(execFileSync('bun',[resolve('scripts/codebase-graph.ts'),'--repo',dir,'--src',join(dir,'src'),'--grouping',join(dir,'grouping.json'),'--no-root-files'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})) as {edges:string[][];nodes:Array<{id:string}>};
}
const valid=[`import {b} from './b';`,`import type {B} from './b';`,`export {b} from './b';`,`export * from './b';`,`import './b';`,`const b=import('./b');`,`import {\n b\n} from\n './b';`,`import {b} from './b.ts?raw';`];
const falseImports=[`// import './ghost';`,`/* import './ghost'; */`,`const example = "import './ghost';";`,`const example = \`import './ghost';\`;`,`// export {x} from './ghost';`,`/* const example=import('./ghost'); */`];
describe('repo-agnostic graph parser integration',()=>{
  it.each(Array.from({length:64},(_,i)=>({i,text:valid[i%valid.length]!})))('real import seed $i produces A→B',({i,text})=>{expect(generate(`// seed ${SEED+i}\n${text}`).edges).toContainEqual(['A','B','data']);});
  it.each(Array.from({length:64},(_,i)=>({i,text:falseImports[i%falseImports.length]!})))('non-import seed $i does not invent dependencies [F13]',({i,text})=>{expect(generate(`// seed ${SEED+i}\n${text}\nexport const a=1;`).edges).toEqual([]);});
  it('emitted .js spelling resolves to tracked .ts source [F14]',()=>{const g=generate(`import {b} from './b.js';`);expect(g.edges).toContainEqual(['A','B','data']);expect(g.nodes).toHaveLength(2);});
  it('untracked scratch files never become scanned modules',()=>{writeFileSync(join(dir,'src/scratch.ts'),'export const scratch=1;');expect(generate('export const a=1;').nodes).toHaveLength(2);});
  it('same source gives deterministic JSON graph',()=>{const text=`import {b} from './b';`;expect(generate(text)).toEqual(generate(text));});
});
