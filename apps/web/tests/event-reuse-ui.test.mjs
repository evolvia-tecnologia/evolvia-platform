import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const react = url(`let cursor=0;export const values=[];export const refs=[];export const effects=[];export const writes=[];export const reset=()=>{cursor=0};export const clear=()=>{cursor=0;values.length=0;refs.length=0;effects.length=0;writes.length=0};export const useState=initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=value;writes.push(i)}]};export const useRef=initial=>{const i=cursor++;return refs[i]??=( {current:initial})};export const useEffect=fn=>{effects.push(fn)};`);
const apiUrl = url('export const requests=[];export class ApiError extends Error{};export const api=(path,options)=>new Promise((resolve,reject)=>requests.push({path,options,resolve,reject}));');
const jsx = url('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;');
const modules = {
  react, 'react/jsx-runtime':jsx, 'next/link':url('export default "link";'),
  '../lib/api':apiUrl,
  '../lib/event-reuse':url('export const eventReuseClientIssue=()=>null;export const eventReuseLocalValue=value=>value;export const eventReuseInstant=value=>value;'),
  './event-reuse.module.css':url('export default {};'),
};
const source = ts.transpileModule(readFileSync(new URL('../components/event-reuse.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name));
const {default:Reuse}=await import(url(source));
const hooks=await import(react);
const network=await import(apiUrl);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const payload={event:{name:'Origem'},answers:{timeZone:'UTC',startDate:'2030-01-01T10:00',endDate:'2030-01-01T11:00'}};
function setup(){hooks.clear();network.requests.length=0;const child=Reuse({eventId:'event-a'});hooks.reset();child.type(child.props);const cleanup=hooks.effects[0]();return {child,cleanup};}
function render(child){hooks.reset();return child.type(child.props);}

test('trocar evento remonta formulário e respostas antigas não escrevem após desmontagem',async()=>{
  const {cleanup}=setup();
  assert.equal(Reuse({eventId:'event-a'}).key,'event-a');
  assert.equal(Reuse({eventId:'event-b'}).key,'event-b');
  cleanup();hooks.writes.length=0;
  network.requests[0].resolve(payload);await flush();
  assert.deepEqual(hooks.writes,[]);
});
test('falha tardia do carregamento não altera mensagem do formulário desmontado',async()=>{
  const {cleanup}=setup();cleanup();hooks.writes.length=0;
  network.requests[0].reject(new Error('internal-detail'));await flush();
  assert.deepEqual(hooks.writes,[]);
});
test('dois envios no mesmo turno geram um POST e resposta após saída não escreve estado',async()=>{
  const {child,cleanup}=setup();network.requests[0].resolve(payload);await flush();
  const form=nodes(render(child)).find(node=>node.type==='form');
  const first=form.props.onSubmit({preventDefault(){}});
  await form.props.onSubmit({preventDefault(){}});
  assert.equal(network.requests.length,2);
  assert.equal(network.requests[1].path,'/events/event-a/reuse');
  assert.ok(network.requests[1].options.headers['Idempotency-Key']);
  cleanup();hooks.writes.length=0;
  network.requests[1].resolve({event:{id:'new',name:'Novo'},replay:false,exclusions:[]});await first;
  assert.deepEqual(hooks.writes,[]);
});
test('sem origem carregada não envia; falha de POST libera nova tentativa com a mesma chave',async()=>{
  const {child}=setup();
  await nodes(render(child)).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(network.requests.length,1);
  network.requests[0].resolve(payload);await flush();
  const submit=nodes(render(child)).find(node=>node.type==='form').props.onSubmit;
  const first=submit({preventDefault(){}});const key=network.requests[1].options.headers['Idempotency-Key'];
  network.requests[1].reject(new Error('internal-detail'));await first;
  const retry=submit({preventDefault(){}});
  assert.equal(network.requests[2].options.headers['Idempotency-Key'],key);
  network.requests[2].resolve({event:{id:'new',name:'Novo'},replay:true,exclusions:[]});await retry;
});
