/* Root builder regression corpus. Run: bun scripts/test-battery-builder.ts --out=/absolute/results.json */
import { buildHtml } from '../build.ts';
import { writeFileSync } from 'node:fs';
interface Result { input:string;pass:boolean;detail:string }
const cases=['plain','$&',"$'",'$`','$$','</script>','<!--','price $& tax',"prefix $' suffix",'💡','quote " test','line\nnext'];
const results:Result[]=cases.map(input=>{
 const spec={title:input,nodes:[],edges:[]};const body=JSON.stringify(spec).replace(/<\/script/gi,'<\\/script');
 const html=buildHtml(spec);const pass=html.includes(body);return {input,pass,detail:pass?'':'serialized spec changed during template insertion'};
});
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(out)writeFileSync(out,JSON.stringify({total:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');
console.log(results);process.exitCode=results.some(r=>!r.pass)?1:0;
