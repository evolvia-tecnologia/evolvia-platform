import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../components/exhibitor-caex.tsx', import.meta.url), 'utf8');
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const all = (n, predicate, out = []) => {
 if (!n || typeof n !== 'object') return out;
 if (Array.isArray(n)) { n.forEach(x => all(x,predicate,out)); return out; }
 if(predicate(n)) out.push(n);
 return all(n.props?.children,predicate,out);
};
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');
const flush = () => new Promise(r => setImmediate(r));
const portal = { canManage:true, summary:{exhibitors:{},providers:{}}, companies:[], credentials:[{id:'credential-a',kind:'EXHIBITOR',companyKind:'EXHIBITOR',fullName:'Pessoa A',badgeName:'Pessoa',companyTradeName:'Empresa A',credentialedAt:null,printedAt:null}] };
async function harness(name, api = async () => portal) {
 const slots=[]; let cursor=0; const effects=[];
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];};
 const key='expo'+Math.random();
 globalThis[key]={useState:state,useRef:v=>state({current:v})[0],useId:()=> 'panel',useEffect:(fn,deps)=>{
 const i=cursor++;if(!slots[i] || deps.some((v,j)=>v!==slots[i].deps[j])) effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});
 },api,getToken:()=> 'token',clearSession:()=>{}};
 const modules={
 react:url('export const {useState,useRef,useId,useEffect}=globalThis['+JSON.stringify(key)+'];'),
 'react/jsx-runtime':url('export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;'),
 'next/link':url('export default "a";'),
 './eva-screen-support':url('export default "eva";'),
 './event-exhibitors.module.css':url('export default {};'),
 '../lib/api':url('export class ApiError extends Error{};export const {api,getToken,clearSession}=globalThis['+JSON.stringify(key)+'];'),
 };
 const js=ts.transpileModule(source+'\nexport {CaexDesk,CompanyDirectory,CompanyProfile,CompanyOrders,companyFormStatus};',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=await import(url(js.replace(/from ['"]([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(modules[n]))));
 return {render(props){cursor=0;const tree=mod[name](props);effects.splice(0).forEach(f=>f());return tree;},dispose(){slots.forEach(s=>s?.cleanup?.());delete globalThis[key];}};
}
const button = (tree, label) => all(tree,n=>n.type==='button'&&text(n)===label)[0];

const quotas = ['EXHIBITOR','ASSEMBLER','SERVICE'].map(kind=>({kind,limit:30,used:4,available:26,exceeded:false}));
const result = {items:[{id:'company-a',kind:'EXHIBITOR',tradeName:'Mitte',legalName:'Mitte Tecnologia',booth:'A1'}],hasMore:false,page:0};
test('company search reaches server, opens company profile and preserves search on return',async()=>{
 const calls=[];const h=await harness('CompanyDirectory',async path=>{calls.push(path);return result;});
 try {
  const props={eventId:'event-a',audience:'EXHIBITOR'};
  h.render(props);await flush();let tree=h.render(props);
  const input=all(tree,n=>n.type==='input')[0];input.props.onChange({target:{value:'Mitte & Cia'}});
  tree=h.render(props);all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  h.render(props);await flush();tree=h.render(props);
  assert.match(calls.at(-1),/q=Mitte\+%26\+Cia/);
  button(tree,'Abrir empresa').props.onClick();tree=h.render(props);
  assert.equal(tree.props.companyId,'company-a');
  tree.props.onBack();tree=h.render(props);assert.equal(all(tree,n=>n.type==='input')[0].props.value,'Mitte & Cia');
 }finally{h.dispose();}
});
test('late search cannot overwrite newer company results',async()=>{
 let resolveOld;let call=0;
 const h=await harness('CompanyDirectory',async()=>++call===1?new Promise(r=>resolveOld=r):{...result,items:[{id:'new',kind:'EXHIBITOR',tradeName:'Nova empresa',legalName:'Nova',booth:''}]});
 try {
  const props={eventId:'event-a',audience:'EXHIBITOR'};let tree=h.render(props);
  all(tree,n=>n.type==='input')[0].props.onChange({target:{value:'Nova'}});
  tree=h.render(props);all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  h.render(props);await flush();resolveOld(result);await flush();tree=h.render(props);
  assert.match(text(tree),/Nova empresa/);assert.doesNotMatch(text(tree),/Mitte Tecnologia/);
 }finally{h.dispose();}
});
test('field selector searches on server and clear restores broad search',async()=>{
 const calls=[];const h=await harness('CompanyDirectory',async path=>{calls.push(path);return result;});
 try {
  const props={eventId:'event-a',audience:'EXHIBITOR'};
  h.render(props);await flush();let tree=h.render(props);
  all(tree,n=>n.type==='select')[0].props.onChange({target:{value:'EMAIL'}});
  h.render(props);await flush();assert.match(calls.at(-1),/field=EMAIL/);
  tree=h.render(props);button(tree,'Limpar busca').props.onClick();
  h.render(props);await flush();assert.match(calls.at(-1),/field=ALL/);
 }finally{h.dispose();}
});
test('malformed company response exposes retry without private diagnostics',async()=>{
 const h=await harness('CompanyDirectory',async()=>({items:null}));
 try{const props={eventId:'a',audience:'EXHIBITOR'};h.render(props);await flush();const tree=h.render(props);assert.match(text(tree),/Não foi possível consultar/);assert.ok(button(tree,'Tentar consulta novamente'));}finally{h.dispose();}
});
test('company profile shows credentials and observed forms without claiming payment or approval',async()=>{
 const h=await harness('CompanyProfile',async()=>({company:result.items[0],quotas,total:301,hasMore:true,formsHaveMore:true,credentials:[],forms:[{id:'f',title:'Manual',kind:'DOCUMENT',active:true,required:true,deadline:null,credentialCount:0,visitedAt:'2026-10-24',orderStatuses:[]}]}));
 try{const props={eventId:'a',companyId:'company-a',onBack(){}};h.render(props);await flush();let tree=h.render(props);assert.match(text(tree),/301 credenciais/);assert.equal(button(tree,'Próximas credenciais').props.disabled,false);button(tree,'Formulários').props.onClick();tree=h.render(props);assert.match(text(tree),/Abertura registrada/);assert.equal(button(tree,'Próximos formulários').props.disabled,false);}finally{h.dispose();}
});
test('foreign profile response is rejected and offers safe return',async()=>{
 const h=await harness('CompanyProfile',async()=>({company:{id:'other'},credentials:[],forms:[],total:0,hasMore:false,formsHaveMore:false}));
 try{const props={eventId:'a',companyId:'company-a',onBack(){}};h.render(props);await flush();const tree=h.render(props);assert.match(text(tree),/Não foi possível abrir/);assert.ok(button(tree,'Voltar à busca de empresas'));}finally{h.dispose();}
});
const order = {id:'order-a',productTitle:'Energia',formTitle:'Serviços',unit:'un',quantity:2,unitPriceCents:1500,totalCents:3000,status:'CONFIRMED',createdAt:'2026-10-24T00:00:00Z'};
test('orders show recorded totals and operational state without marking confirmed as paid',async()=>{
 const h=await harness('CompanyOrders',async()=>({companyId:'company-a',page:0,hasMore:true,items:[order]}));
 try{
  const props={eventId:'a',companyId:'company-a'};h.render(props);await flush();const tree=h.render(props);
  assert.match(text(tree),/Energia/);assert.match(text(tree),/30,00/);assert.match(text(tree),/Confirmado/);
  assert.doesNotMatch(text(tree),/Pagamento confirmado|Pago/);
  assert.equal(button(tree,'Próximos pedidos').props.disabled,false);
 }finally{h.dispose();}
});
test('invalid totals and foreign order payloads fail safely and retry only GET',async()=>{
 for(const payload of [{companyId:'other',page:0,hasMore:false,items:[]},
   {companyId:'company-a',page:0,hasMore:false,items:[{...order,totalCents:1}]}]){
  const methods=[];let failure=true;
  const h=await harness('CompanyOrders',async(_path,options={})=>{methods.push(options.method??'GET');return failure?payload:{companyId:'company-a',page:0,hasMore:false,items:[order]};});
  try{
   const props={eventId:'a',companyId:'company-a'};h.render(props);await flush();let tree=h.render(props);
   assert.match(text(tree),/Não foi possível consultar/);
   failure=false;button(tree,'Atualizar pedidos').props.onClick();h.render(props);await flush();tree=h.render(props);
   assert.match(text(tree),/Energia/);assert.deepEqual(methods,['GET','GET']);
  }finally{h.dispose();}
 }
});
test('late orders from an abandoned page cannot overwrite the next page',async()=>{
 let resolveOld;
 const h=await harness('CompanyOrders',async path=>path.endsWith('page=0')?new Promise(r=>resolveOld=r):{companyId:'company-a',page:1,hasMore:false,items:[{...order,id:'new',productTitle:'Pedido atual'}]});
 try{
  // A successful first read enables page navigation; retry the first page with a delayed response.
  const props={eventId:'a',companyId:'company-a'};h.render(props);
  resolveOld({companyId:'company-a',page:0,hasMore:true,items:[order]});await flush();
  let tree=h.render(props);button(tree,'Atualizar pedidos').props.onClick();h.render(props);
  // Keep the previous rendered page callback, as a user can activate it before the loading render.
  button(tree,'Próximos pedidos').props.onClick();h.render(props);await flush();
  resolveOld({companyId:'company-a',page:0,hasMore:true,items:[order]});await flush();
  tree=h.render(props);assert.match(text(tree),/Pedido atual/);assert.doesNotMatch(text(tree),/Energia/);
 }finally{h.dispose();}
});
