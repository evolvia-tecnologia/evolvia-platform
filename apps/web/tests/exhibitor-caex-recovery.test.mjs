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
 const js=ts.transpileModule(source+'\nexport {CaexDesk};',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod=await import(url(js.replace(/from ['"]([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(modules[n]))));
 return {render(props){cursor=0;const tree=mod[name](props);effects.splice(0).forEach(f=>f());return tree;},dispose(){slots.forEach(s=>s?.cleanup?.());delete globalThis[key];}};
}
const button = (tree, label) => all(tree,n=>n.type==='button'&&text(n)===label)[0];
test('CAEX blocks mouse and keyboard tab changes during pending attendance and releases after failure',async()=>{
 let reject;
 const h=await harness('CaexDesk',async(path,opts={})=>opts.method==='POST'?new Promise((_,r)=>reject=r):portal);
 try {
  h.render({eventId:'a'});await flush();
  const tree=openCredentials(h), tab=button(tree,'Prestadores');
  const pending=button(tree,'Credenciar').props.onClick();
  tab.props.onClick();tab.props.onKeyDown({key:'Home',preventDefault(){throw Error('navigation must not run');}});
  const busyTree=h.render({eventId:'a'});
  assert.equal(button(busyTree,'Credenciais de expositores').props['aria-selected'],true);
  assert.equal(button(busyTree,'Prestadores').props.disabled,true);
  reject(Error('offline'));await pending;
  const ready=h.render({eventId:'a'});assert.equal(button(ready,'Prestadores').props.disabled,false);
  button(ready,'Prestadores').props.onClick();
  assert.equal(button(h.render({eventId:'a'}),'Prestadores').props['aria-selected'],true);
 }finally{h.dispose();}
});
function openCredentials(h) {
 button(h.render({eventId:'a'}),'Credenciais de expositores').props.onClick();
 return h.render({eventId:'a'});
}
test('event switch remounts CAEX with a separate company and credential context',async()=>{
 const h=await harness('default');
 try {
  const first=h.render({eventId:'a'}),second=h.render({eventId:'b'});
  assert.equal(first.key,'a');assert.equal(second.key,'b');
  assert.equal(first.type.name,'CaexDesk');assert.equal(second.type.name,'CaexDesk');
 }finally{h.dispose();}
});
test('initial CAEX load failure exposes GET-only retry without server diagnostics',async()=>{
 const calls=[];let fail=true;
 const h=await harness('CaexDesk',async(path,opts={})=>{calls.push(opts.method??'GET');if(fail)throw Error('private@example.test SQL');return portal;});
 try {
  h.render({eventId:'a'});await flush();
  const tree=h.render({eventId:'a'});
  assert.doesNotMatch(text(tree),/private@example|SQL/);
  fail=false;await button(tree,'Tentar novamente').props.onClick();
  assert.ok(button(h.render({eventId:'a'}),'Credenciais de expositores'));
  assert.deepEqual(calls,['GET','GET']);
 }finally{h.dispose();}
});
test('confirmed attendance with failed refresh blocks stale writes and recovers only with GET',async()=>{
 const calls=[];let release;let fail=true;
 const h=await harness('CaexDesk',async(path,opts={})=>{
  calls.push(opts.method??'GET');
  if(opts.method==='POST')return new Promise(r=>release=r);
  if(calls.length>1&&fail)throw Error('private@example.test SQL');
  return portal;
 });
 try {
  h.render({eventId:'a'});await flush();
  const action=button(openCredentials(h),'Credenciar');
  const first=action.props.onClick();
  await action.props.onClick();assert.deepEqual(calls,['GET','POST']);
  release();await first;
  let tree=h.render({eventId:'a'});
  assert.match(text(tree),/Pessoa credenciada/);assert.match(text(tree),/operação foi confirmada/);
  assert.equal(button(tree,'Credenciar').props.disabled,true);
  assert.equal(button(tree,'Marcar impresso').props.disabled,true);
  await action.props.onClick();assert.deepEqual(calls,['GET','POST','GET']);
  await button(tree,'Atualizar CAEX').props.onClick();
  tree=h.render({eventId:'a'});assert.match(text(tree),/Pessoa credenciada/);
  assert.match(text(tree),/operação foi confirmada/);assert.doesNotMatch(text(tree),/private@example|SQL/);
  fail=false;await button(tree,'Atualizar CAEX').props.onClick();
  tree=h.render({eventId:'a'});assert.equal(button(tree,'Credenciar').props.disabled,false);
  assert.equal(button(tree,'Atualizar CAEX'),undefined);
  assert.deepEqual(calls,['GET','POST','GET','GET','GET']);
 }finally{h.dispose();}
});
test('failed attendance preserves snapshot, hides diagnostics and permits deliberate retry',async()=>{
 const calls=[];let fail=true;
 const h=await harness('CaexDesk',async(path,opts={})=>{calls.push(opts.method??'GET');if(opts.method==='POST'&&fail)throw Error('private@example.test SQL');return portal;});
 try {
  h.render({eventId:'a'});await flush();
  await button(openCredentials(h),'Credenciar').props.onClick();
  let tree=h.render({eventId:'a'});assert.match(text(tree),/Pessoa A/);
  assert.match(text(tree),/Não foi possível concluir/);assert.doesNotMatch(text(tree),/private@example|SQL/);
  assert.equal(button(tree,'Credenciar').props.disabled,false);
  assert.equal(button(tree,'Atualizar CAEX'),undefined);
  fail=false;await button(tree,'Credenciar').props.onClick();
  assert.deepEqual(calls,['GET','POST','POST','GET']);
 }finally{h.dispose();}
});
test('attendance completing after event unmount never requests old context again',async()=>{
 const calls=[];let release;
 const h=await harness('CaexDesk',async(path,opts={})=>{calls.push(opts.method??'GET');if(opts.method==='POST')return new Promise(r=>release=r);return portal;});
 h.render({eventId:'a'});await flush();
 const pending=button(openCredentials(h),'Credenciar').props.onClick();
 h.dispose();release();await pending;
 assert.deepEqual(calls,['GET','POST']);
});
test('late initial response after unmount cannot populate another CAEX context',async()=>{
 let release;
 const old=await harness('CaexDesk',()=>new Promise(r=>release=r));
 old.render({eventId:'a'});old.dispose();
 const fresh=await harness('CaexDesk',async()=>{throw Error('Forbidden');});
 try {
  fresh.render({eventId:'b'});release(portal);await flush();
  const tree=fresh.render({eventId:'b'});
  assert.equal(button(tree,'Credenciais de expositores'),undefined);
  assert.doesNotMatch(text(tree),/Pessoa A|Empresa A/);
  assert.ok(button(tree,'Tentar novamente'));
 }finally{fresh.dispose();}
});
