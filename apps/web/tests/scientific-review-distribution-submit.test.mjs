import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooksUrl = data(`let slots=[],cursor=0,effects=[],late=0;
export const reset=()=>{cursor=0;};
export const lateWrites=()=>late;
export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[];};
export const run=()=>{const work=effects;effects=[];work.forEach(fn=>fn());};
export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{if(target!==slots){late++;return;}target[i]=typeof v==='function'?v(target[i]):v;}];}
export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];}
export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn();});}}`);

const apiUrl=data(`export const calls=[];export const api=(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}));`);
const modules={react:hooksUrl,'../lib/api':apiUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'), './scientific-review-distribution.module.css':data('export default {};')};
const source=readFileSync(new URL('../components/scientific-review-distribution.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const {default:View}=await import(data(compiled.replace(/from ['"]([^'"]+)['"]/g,(_,key)=>`from ${JSON.stringify(modules[key])}`)));
const hooks=await import(hooksUrl), api=await import(apiUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const render=()=>{hooks.reset();return View({eventId:'event-a'});};
const tick=()=>new Promise(r=>setTimeout(r,0));
test('clique duplo antes do render emite um único POST e falha permite retry',async()=>{
 render();hooks.run();api.calls[0].resolve({cap:1,pending:false,suggestions:[{submissionId:'s',versionId:'v',title:'Trabalho',reviewerPersonId:'r',reviewerName:'Pessoa'}]});await tick();
 let tree=render();let button=nodes(tree).find(n=>n.type==='button');button.props.onClick();button.props.onClick();
 assert.equal(api.calls.filter(c=>c.options?.method==='POST').length,1);
 api.calls.at(-1).reject(Error('Falha recuperável'));await tick();tree=render();button=nodes(tree).find(n=>n.type==='button');assert.equal(button.props.disabled,false);button.props.onClick();assert.equal(api.calls.filter(c=>c.options?.method==='POST').length,2);
 api.calls.at(-1).reject(Error('Falha'));await tick();hooks.unmount();
});
