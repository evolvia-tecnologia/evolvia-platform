import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const hooksUrl=data(`let slots=[],cursor=0,effects=[],deferred=false,updates=[];export const defer=value=>{deferred=value;};export const flush=()=>{const list=updates;updates=[];list.forEach(fn=>fn());};export const reset=()=>{cursor=0;};export const run=()=>{const list=effects;effects=[];list.forEach(fn=>fn());};export function useState(init){let i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{const apply=()=>{slots[i]=typeof v==='function'?v(slots[i]):v;};if(deferred&&typeof v==='function')updates.push(apply);else apply();}];}export function useRef(init){let i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];}export function useEffect(fn,deps){let i=cursor++;const old=slots[i];if(!old||deps.some((v,k)=>v!==old[k])){slots[i]=deps;effects.push(fn);}}`);
const apiUrl=data(`export const requests=[];export const pending=[];export const api=async(path,options)=>{requests.push({path,options});if(!options)return [{id:'cat-a',name:'Categoria A'}];return new Promise((resolve,reject)=>pending.push({resolve,reject}));};`);
const modules={'react':hooksUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'../lib/api':apiUrl,'./event-communication.module.css':data('export default {};')};
const source=ts.transpileModule(readFileSync(new URL('../components/event-communication-audience.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,key)=>'from '+JSON.stringify(modules[key]));
const {default:Component}=await import(data(source));const hooks=await import(hooksUrl),mock=await import(apiUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const tick=()=>new Promise(r=>setTimeout(r,0));
function render(){hooks.reset();const root=Component({eventId:'event-a'});return root.type(root.props);}
const button=tree=>nodes(tree).find(n=>n.type==='button');
const response=(name,total=1)=>({total,matchedRegistrations:total,missingEmail:0,duplicates:0,page:1,pageSize:50,items:[{name,email:`${name}@example.test`}]});
test('prévia renderizada invalida filtro antigo, descarta resposta atrasada e preserva contrato POST',async()=>{
  let tree=render();hooks.run();await tick();tree=render();hooks.run();assert.equal(button(tree).props.disabled,false);
  button(tree).props.onClick();assert.equal(mock.pending.length,1);mock.pending[0].resolve(response('Antigo'));await tick();tree=render();assert.match(text(tree),/Antigo/);
  nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Situação financeira').props.onChange({target:{value:'PAID'}});tree=render();assert.doesNotMatch(text(tree),/Antigo/);
  button(tree).props.onClick();const body=JSON.parse(mock.requests.at(-1).options.body);assert.deepEqual(body,{categoryIds:[],payment:'PAID',page:1});assert.match(mock.requests.at(-1).path,/event-a\/communication\/audience\/preview$/);
  // Simulates a delayed result after a filter changed before completion.
  nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Situação financeira').props.onChange({target:{value:'ZERO'}});tree=render();
  mock.pending[1].resolve(response('RespostaAtrasada'));await tick();tree=render();assert.doesNotMatch(text(tree),/RespostaAtrasada/);assert.equal(button(tree).props.disabled,false);
});

test('checkbox captura checked antes de updater adiado e paginação segue pageSize do servidor',async()=>{
  let tree=render();const checkbox=nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');
  const event={target:{checked:true}};hooks.defer(true);checkbox.props.onChange(event);event.target.checked=false;hooks.flush();hooks.defer(false);tree=render();
  assert.equal(nodes(tree).find(n=>n.type==='input').props.checked,true);
  button(tree).props.onClick();assert.deepEqual(JSON.parse(mock.requests.at(-1).options.body).categoryIds,['cat-a']);
  mock.pending.at(-1).resolve({...response('Primeiro',2),pageSize:1});await tick();tree=render();
  let next=nodes(tree).find(n=>n.type==='button'&&text(n)==='Próxima');assert.equal(next.props.disabled,false);next.props.onClick();
  assert.equal(JSON.parse(mock.requests.at(-1).options.body).page,2);
  mock.pending.at(-1).resolve({...response('Segundo',2),page:2,pageSize:1});await tick();tree=render();
  next=nodes(tree).find(n=>n.type==='button'&&text(n)==='Próxima');assert.equal(next.props.disabled,true);
  assert.equal(nodes(tree).find(n=>n.type==='button'&&text(n)==='Anterior').props.disabled,false);
});

test('trocar para autores limpa prévia e filtros financeiros, envia situação científica explícita',async()=>{
  let tree=render();nodes(tree).find(n=>n.props?.['aria-label']==='Público').props.onChange({target:{value:'CORRESPONDING_AUTHORS'}});tree=render();assert.doesNotMatch(text(tree),/Segundo/);
  assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='Situação financeira').props.disabled,true);
  nodes(tree).find(n=>n.props?.['aria-label']==='Situação do trabalho').props.onChange({target:{value:'ACCEPTED'}});tree=render();button(tree).props.onClick();assert.deepEqual(JSON.parse(mock.requests.at(-1).options.body),{audience:'CORRESPONDING_AUTHORS',submissionStatus:'ACCEPTED',page:1});
  mock.pending.at(-1).resolve({...response('Autora'),audience:'CORRESPONDING_AUTHORS',matchedRegistrations:0,matchedAuthors:2});await tick();tree=render();assert.match(text(tree),/2 autorias correspondentes/);assert.match(text(tree),/Autora/);
  nodes(tree).find(n=>n.props?.['aria-label']==='Público').props.onChange({target:{value:'CONFIRMED_REGISTRATIONS'}});tree=render();assert.doesNotMatch(text(tree),/Autora/);assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='Situação financeira').props.disabled,false);
});

test('autores e coautores possuem opção própria, situação científica e contagens sem prometer envio',async()=>{
  let tree=render();
  assert.ok(nodes(tree).some(n=>n.type==='option'&&n.props.value==='ALL_SCIENTIFIC_AUTHORS'));
  nodes(tree).find(n=>n.props?.['aria-label']==='Público').props.onChange({target:{value:'ALL_SCIENTIFIC_AUTHORS'}});tree=render();
  assert.match(text(tree),/mesmo sem inscrição/);
  assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='Situação financeira').props.disabled,true);
  nodes(tree).find(n=>n.props?.['aria-label']==='Situação do trabalho').props.onChange({target:{value:'UNDER_REVIEW'}});tree=render();button(tree).props.onClick();
  assert.deepEqual(JSON.parse(mock.requests.at(-1).options.body),{audience:'ALL_SCIENTIFIC_AUTHORS',submissionStatus:'UNDER_REVIEW',page:1});
  mock.pending.at(-1).resolve({...response('Coautora'),audience:'ALL_SCIENTIFIC_AUTHORS',matchedRegistrations:0,matchedAuthors:4,missingEmail:1,duplicates:2});await tick();tree=render();
  assert.match(text(tree),/4 autorias científicas/);assert.match(text(tree),/1 sem e-mail válido/);assert.match(text(tree),/2 contatos repetidos/);assert.match(text(tree),/não é autorização nem confirmação de envio/);
  nodes(tree).find(n=>n.props?.['aria-label']==='Público').props.onChange({target:{value:'CORRESPONDING_AUTHORS'}});tree=render();assert.doesNotMatch(text(tree),/Coautora/);
});

