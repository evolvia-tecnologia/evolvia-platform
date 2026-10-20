import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../components/exhibitor-company-area.tsx', import.meta.url), 'utf8');
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const all = (n, predicate, out = []) => {
 if (!n || typeof n !== 'object') return out;
 if (Array.isArray(n)) { n.forEach(x => all(x,predicate,out)); return out; }
 if(predicate(n)) out.push(n);
 return all(n.props?.children,predicate,out);
};
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');
const flush = () => new Promise(r => setImmediate(r));
const portal = { needsChoice:false,canManage:true,accountName:'Conta',event:{name:'Feira'},company:{id:'company',tradeName:'Empresa'},forms:[],representatives:[] };
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
 './exhibitor-company-area.module.css':url('export default {};'),
 '../lib/api':url('export class ApiError extends Error{};export const {api,getToken,clearSession}=globalThis['+JSON.stringify(key)+'];'),
 };
 const js=ts.transpileModule(source+'\nexport {CompanyDesk,Representatives,CredentialForm,Profile,CredentialList,Payments,Downloads,FormCard};',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=await import(url(js.replace(/from ['"]([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(modules[n]))));
 return {render(props){cursor=0;const tree=mod[name](props);effects.splice(0).forEach(f=>f());return tree;},dispose(){slots.forEach(s=>s?.cleanup?.());delete globalThis[key];}};
}
for (const name of ['Representatives','CredentialForm']) test(name+' preserves fields on rejection and clears only confirmed save',async()=>{
 let accept=false;const callback=async()=>accept;
 const props=name==='Representatives'?{portal,busy:false,onAdd:callback,onRemove:()=>{}}:{form:{id:'f',credentialKind:'EXHIBITOR'},disabled:false,onSubmit:callback};
 const h=await harness(name);
 try {
 let tree=h.render(props);
 all(tree,n=>n.type==='input').forEach(n=>n.props.onChange({target:{value:'Preserved'}}));
 tree=h.render(props);await all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.ok(all(h.render(props),n=>n.type==='input').every(n=>n.props.value==='Preserved'));
 accept=true;await all(h.render(props),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.ok(all(h.render(props),n=>n.type==='input').every(n=>n.props.value===''));
 }finally{h.dispose();}
});
test('confirmed mutation with failed refresh supports GET-only retry and synchronous duplicate lock',async()=>{
 const calls=[];let release;let failRefresh=true;
 const h=await harness('CompanyDesk',async(path,opts={})=>{
 calls.push(opts.method??'GET');
 if(opts.method==='POST')return new Promise(r=>release=r);
 if(calls.length>1&&failRefresh)throw Error('GET unavailable private@example.test');
 return portal;
 });
 try {
 h.render({slug:'feira'});await flush();
 let tree=h.render({slug:'feira'});
 all(tree,n=>n.type==='button'&&text(n)==='Representantes')[0].props.onClick();
 tree=h.render({slug:'feira'});
 const reps=all(tree,n=>typeof n.type==='function'&&n.type.name==='Representatives')[0];
 const first=reps.props.onAdd({name:'A'});
 assert.equal(await reps.props.onAdd({name:'A'}),false);
 release();assert.equal(await first,true);
 assert.equal(await reps.props.onAdd({name:'Stale callback'}),false);
 assert.deepEqual(calls,['GET','POST','GET']);
 tree=h.render({slug:'feira'});
 assert.equal(all(tree,n=>typeof n.type==='function'&&n.type.name==='Representatives')[0].props.busy,true);
 assert.match(text(tree),/Representante salvo/);assert.match(text(tree),/operação foi confirmada/);
 await all(tree,n=>n.type==='button'&&text(n)==='Atualizar área da empresa')[0].props.onClick();
 tree=h.render({slug:'feira'});
 assert.match(text(tree),/Representante salvo/);
 assert.match(text(tree),/operação foi confirmada/);
 assert.doesNotMatch(text(tree),/private@example/);
 failRefresh=false;
 await all(tree,n=>n.type==='button'&&text(n)==='Atualizar área da empresa')[0].props.onClick();
 assert.deepEqual(calls,['GET','POST','GET','GET','GET']);
 assert.doesNotMatch(text(h.render({slug:'feira'})),/operação foi confirmada/);
 }finally{h.dispose();}
});
test('event switch remounts desk with independent company context',async()=>{
 const h=await harness('default');
 try{
 const a=h.render({slug:'a'}),b=h.render({slug:'b'});
 const desk=t=>all(t,n=>typeof n.type==='function'&&n.type.name==='CompanyDesk')[0];
 assert.equal(desk(a).key,'a');assert.equal(desk(b).key,'b');
 }finally{h.dispose();}
});

test('initial load failure exposes GET-only recovery',async()=>{
 const calls=[];let failing=true;
 const h=await harness('CompanyDesk',async(path,opts={})=>{calls.push(opts.method??'GET');if(failing)throw Error('Offline private@example.test');return portal;});
 try{
 h.render({slug:'feira'});await flush();
 const tree=h.render({slug:'feira'});
 assert.doesNotMatch(text(tree),/private@example/);
 failing=false;await all(tree,n=>n.type==='button'&&text(n)==='Tentar novamente')[0].props.onClick();
 assert.match(text(h.render({slug:'feira'})),/Empresa/);
 assert.deepEqual(calls,['GET','GET']);
 }finally{h.dispose();}
});
test('mutation completing after unmount never fetches old company again',async()=>{
 const calls=[];let release;
 const h=await harness('CompanyDesk',async(path,opts={})=>{calls.push(opts.method??'GET');if(opts.method==='POST')return new Promise(r=>release=r);return portal;});
 h.render({slug:'feira'});await flush();
 all(h.render({slug:'feira'}),n=>n.type==='button'&&text(n)==='Representantes')[0].props.onClick();
 const reps=all(h.render({slug:'feira'}),n=>typeof n.type==='function'&&n.type.name==='Representatives')[0];
 const pending=reps.props.onAdd({name:'A'});
 h.dispose();release();
 assert.equal(await pending,false);
 assert.deepEqual(calls,['GET','POST']);
});

test('failed mutation hides server diagnostics, preserves snapshot and permits deliberate retry',async()=>{
 const calls=[];let failing=true;
 const h=await harness('CompanyDesk',async(path,opts={})=>{
  calls.push(opts.method??'GET');
  if(opts.method==='POST'&&failing)throw Error('private@example.test SQL connection details');
  return portal;
 });
 try {
  h.render({slug:'feira'});await flush();
  all(h.render({slug:'feira'}),n=>n.type==='button'&&text(n)==='Representantes')[0].props.onClick();
  const reps=()=>all(h.render({slug:'feira'}),n=>typeof n.type==='function'&&n.type.name==='Representatives')[0];
  assert.equal(await reps().props.onAdd({name:'A'}),false);
  assert.match(text(h.render({slug:'feira'})),/dados preenchidos foram preservados/);
  assert.doesNotMatch(text(h.render({slug:'feira'})),/private@example|SQL connection/);
  assert.equal(reps().props.busy,false);
  assert.deepEqual(calls,['GET','POST']);
  failing=false;
  assert.equal(await reps().props.onAdd({name:'A'}),true);
  assert.deepEqual(calls,['GET','POST','POST','GET']);
 }finally{h.dispose();}
});


test('profile fields remain controlled when optional API fields are absent or null',async()=>{
 const h=await harness('Profile');
 try {
  const tree=h.render({portal:{...portal,company:{...portal.company,contactName:null}},busy:false,onSave:()=>{}});
  const inputs=all(tree,n=>n.type==='input');
  assert.equal(inputs.length,12);
  assert.ok(inputs.every(n=>n.props.value===''));
 }finally{h.dispose();}
});
for(const name of ['Representatives','CredentialList','Payments','Downloads']) test(name+' table can be reached by keyboard and has a specific accessible name',async()=>{
 const h=await harness(name);
 try {
  const tree=h.render({portal:{...portal,credentials:[{id:'c',kind:'EXHIBITOR'}],downloads:[{id:'d',url:'https://example.test/document'}]},busy:false,onAdd:async()=>false,onRemove:()=>{},kind:null});
  const regions=all(tree,n=>n.props?.role==='region');
  assert.equal(regions.length,1);
  assert.equal(regions[0].props.tabIndex,0);
  assert.ok(regions[0].props['aria-label']);
  assert.ok(all(regions[0],n=>n.type==='table').length);
 }finally{h.dispose();}
});


test('profile reflects normalized server response after successful refresh',async()=>{
 const h=await harness('Profile');
 try {
  const props={portal:{...portal,company:{...portal.company,contactName:'Original'}},busy:false,onSave:()=>{}};
  h.render(props);
  const updated={...props,portal:{...props.portal,company:{...props.portal.company,contactName:'Normalized'}}};
  h.render(updated);
  const inputs=all(h.render(updated),n=>n.type==='input');
  assert.equal(inputs[0].props.value,'Normalized');
 }finally{h.dispose();}
});

test('committed profile fallback recovers by GET without repeating PATCH or discarding the form',async()=>{
 const calls=[];let failRefresh=true;
 const updated={...portal,company:{...portal.company,contactName:'Normalized'}};
 const h=await harness('CompanyDesk',async(path,opts={})=>{
  calls.push(opts.method??'GET');
  if(opts.method==='PATCH')return {saved:true,refreshRequired:true,companyId:'company'};
  if(calls.length>1&&failRefresh)throw Error('private database detail');
  return calls.length===1?portal:updated;
 });
 try {
  h.render({slug:'feira'});await flush();
  all(h.render({slug:'feira'}),n=>n.type==='button'&&text(n)==='Dados cadastrais')[0].props.onClick();
  const profile=()=>all(h.render({slug:'feira'}),n=>typeof n.type==='function'&&n.type.name==='Profile')[0];
  assert.equal(await profile().props.onSave({contactName:'Edited'}),true);
  assert.equal(profile().props.busy,true);
  assert.equal(profile().props.portal.company.id,'company');
  assert.equal(await profile().props.onSave({contactName:'Repeated'}),false);
  assert.deepEqual(calls,['GET','PATCH','GET']);
  const tree=h.render({slug:'feira'});
  assert.match(text(tree),/Dados do contato salvos/);
  assert.doesNotMatch(text(tree),/private database/);
  failRefresh=false;
  await all(tree,n=>n.type==='button'&&text(n)==='Atualizar área da empresa')[0].props.onClick();
  assert.deepEqual(calls,['GET','PATCH','GET','GET']);
  assert.equal(profile().props.portal.company.contactName,'Normalized');
  assert.equal(profile().props.busy,false);
 }finally{h.dispose();}
});

test('profile normal response keeps the existing portal contract without a second GET',async()=>{
 const calls=[];const updated={...portal,company:{...portal.company,contactName:'Saved'}};
 const h=await harness('CompanyDesk',async(path,opts={})=>{calls.push(opts.method??'GET');return opts.method==='PATCH'?updated:portal;});
 try {
  h.render({slug:'feira'});await flush();
  all(h.render({slug:'feira'}),n=>n.type==='button'&&text(n)==='Dados cadastrais')[0].props.onClick();
  const profile=()=>all(h.render({slug:'feira'}),n=>typeof n.type==='function'&&n.type.name==='Profile')[0];
  assert.equal(await profile().props.onSave({contactName:'Saved'}),true);
  assert.equal(profile().props.portal.company.contactName,'Saved');
  assert.deepEqual(calls,['GET','PATCH']);
 }finally{h.dispose();}
});
for(const name of ['Downloads','FormCard'])test(name+' opens documents without replacing portal tab',async()=>{
 const h=await harness(name);let visits=0;
 try {
  const tree=h.render({portal:{...portal,quotaUsed:{EXHIBITOR:0},downloads:[{id:'d',url:'https://example.test/d'}]},form:{kind:'DOCUMENT',pdfUrl:'https://example.test/p.pdf',wordUrl:'https://example.test/w.doc',progress:'PENDING'},busy:false,onVisit:async()=>{visits++;return true;}});
  const links=all(tree,n=>n.type==='a');assert.equal(links.length,name==='FormCard'?2:1);
  for(const link of links){assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noopener noreferrer');link.props.onClick?.();}
  if(name==='FormCard')assert.equal(visits,2);
 }finally{h.dispose();}
});
