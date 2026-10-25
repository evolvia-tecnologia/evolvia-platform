import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const hooksUrl=data(`let slots=[],cursor=0,effects=[];export const reset=()=>{cursor=0;};export const run=()=>{const list=effects;effects=[];list.forEach(fn=>fn());};export function useState(init){let i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];}export function useRef(init){let i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];}export function useEffect(fn,deps){let i=cursor++;const old=slots[i];if(!old||deps.some((v,k)=>v!==old[k])){slots[i]=deps;effects.push(fn);}}`);
const apiUrl=data(`export const requests=[];export const pending=[];export const api=async(path,options)=>{requests.push({path,options});if(!options)return [{id:'cat-a',name:'Categoria A'}];return new Promise((resolve,reject)=>pending.push({resolve,reject}));};`);
const modules={'react':hooksUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'../lib/api':apiUrl,'./event-communication.module.css':data('export default {};')};
const source=ts.transpileModule(readFileSync(new URL('../components/event-communication-audience.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,key)=>'from '+JSON.stringify(modules[key]));
const {default:Component}=await import(data(source));const hooks=await import(hooksUrl),mock=await import(apiUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const tick=()=>new Promise(r=>setTimeout(r,0));
function render(){hooks.reset();const root=Component({eventId:'event-a'});return root.type(root.props);}
const button=tree=>nodes(tree).find(n=>n.type==='button');
const response=(name,total=1)=>({total,matchedRegistrations:total,missingEmail:0,duplicates:0,page:1,items:[{name,email:`${name}@example.test`}]});
test('prévia renderizada invalida filtro antigo, descarta resposta atrasada e preserva contrato POST',async()=>{
  let tree=render();hooks.run();await tick();tree=render();hooks.run();assert.equal(button(tree).props.disabled,false);
  button(tree).props.onClick();assert.equal(mock.pending.length,1);mock.pending[0].resolve(response('Antigo'));await tick();tree=render();assert.match(text(tree),/Antigo/);
  nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'PAID'}});tree=render();assert.doesNotMatch(text(tree),/Antigo/);
  button(tree).props.onClick();const body=JSON.parse(mock.requests.at(-1).options.body);assert.deepEqual(body,{categoryIds:[],payment:'PAID',page:1});assert.match(mock.requests.at(-1).path,/event-a\/communication\/audience\/preview$/);
  // Simulates a delayed result after a filter changed before completion.
  nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'ZERO'}});tree=render();
  mock.pending[1].resolve(response('RespostaAtrasada'));await tick();tree=render();assert.doesNotMatch(text(tree),/RespostaAtrasada/);assert.equal(button(tree).props.disabled,false);
});
