import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const legacy=url(compile('../lib/post-event-report.ts'));
const options=url(compile('../lib/post-event-report-options.ts').replace(/from ['"]\.\/post-event-report['"]/g,'from '+JSON.stringify(legacy)));
const source=compile('../components/post-event-reports.tsx');
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
async function harness(payload){
 const slots=[],effects=[];let cursor=0;
 const state=initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];};
 const h={useState:state,useRef:initial=>state({current:initial})[0],useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j]))effects.push(fn);slots[i]=deps;},api:async()=>payload};
 const key='reportRecovery'+Math.random().toString(36).slice(2);globalThis[key]=h;
 const modules={
  react:url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`),
  'react/jsx-runtime':url('export const Fragment="fragment";export const jsx=(type,props)=>typeof type==="function"?type(props):({type,props});export const jsxs=jsx;'),
  'next/navigation':url('const router={replace(){}};export const useRouter=()=>router;'),
  '../lib/api':url(`export const api=globalThis[${JSON.stringify(key)}].api;export const getToken=()=>"fixture";export class ApiError extends Error{}`),
  '../lib/event-time-zone':url('export const formatEventDate=()=>"06/10/2026";'),
  '../lib/post-event-report':legacy,'../lib/post-event-report-options':options,
  './post-event-reports.module.css':url('export default new Proxy({}, {get:(_,key)=>key});'),
  './post-event-overview':url('export default ()=>null;'),
  './post-event-report-catalog':url('export default ()=>null;'),
 };
 const {default:Component}=await import(url(source.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
 const render=()=>{cursor=0;return Component({eventId:'e1'});};render();while(effects.length)effects.shift()();await new Promise(setImmediate);
 return {render,choose:value=>nodes(render()).find(n=>n.type==='select'&&n.props.value==='all'&&nodes(n).some(o=>o.type==='option'&&o.props.value==='registration')).props.onChange({target:{value}}),dispose:()=>delete globalThis[key]};
}
const report={event:{id:'e1',name:'Teste',profileLabel:'Corporativo',timeZone:'UTC',status:'FINISHED'},generatedAt:'2026-10-06',registration:{confirmed:1,present:0,absent:1,pending:0,expired:0,cancelled:0},attendanceEnabled:true,categories:null,firstCheckInByDay:null,firstCheckInByHour:undefined,fields:[],payment:null,scientific:null,limitations:[]};
test('tela e recorte de credenciamento carregam com arrays ausentes',async()=>{
 const h=await harness(report);try{assert.match(text(h.render()),/Nenhum registro nesta população/);h.choose('attendance-hour');assert.match(text(h.render()),/Credenciados por horário/);assert.match(text(h.render()),/Nenhum registro disponível/);}finally{h.dispose();}
});
test('exportação indisponível mostra aviso recuperável sem exception ou download',async()=>{
 const h=await harness(report);try{h.choose('payment-category');const button=nodes(h.render()).find(n=>n.type==='button'&&text(n)==='Exportar relatório selecionado');assert.doesNotThrow(()=>button.props.onClick());assert.match(text(h.render()),/Não foi possível exportar o relatório. Atualize a consulta e tente novamente./);}finally{h.dispose();}
});
