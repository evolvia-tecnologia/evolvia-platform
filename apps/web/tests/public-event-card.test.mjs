import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const source=compile('../components/public-event-card.tsx');
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
async function harness(event){
 let failed=null;const key='card'+Math.random().toString(36).slice(2);globalThis[key]={state:()=>[failed,value=>failed=value]};
 const modules={react:url(`export const useState=globalThis[${JSON.stringify(key)}].state;`),'react/jsx-runtime':url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'next/link':url('export default "a";'),'../lib/event-time-zone':url(compile('../lib/event-time-zone.ts')),'../lib/public-event-profile':url(compile('../lib/public-event-profile.ts')),'./public-event-card.module.css':url('export default new Proxy({}, {get:(_,key)=>key});')};
 const {default:Card}=await import(url(source.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
 return {render:()=>Card({event}),dispose:()=>delete globalThis[key]};
}
const event={name:'Congresso teste',slug:'congresso / teste',eventType:'Congresso científico',profileCode:'SCIENTIFIC_EVENT',estimatedAudience:1200,format:'HYBRID',startDate:'2026-11-21T01:00:00Z',endDate:'2026-11-22T01:00:00Z',timeZone:'America/Sao_Paulo',venue:'São Paulo/SP',shortDescription:'Pesquisa e inovação',cardMedia:{url:'/api/public/events/congresso%20%2F%20teste/media/COVER',usage:'COVER'}};
test('card apresenta capa pública, datas no fuso e um único link canônico',async()=>{
 const h=await harness(event);try{const n=nodes(h.render());const img=n.find(x=>x.type==='img');assert.equal(img.props.src,event.cardMedia.url);assert.equal(img.props.loading,'lazy');assert.equal(img.props.alt,'');assert.equal(n.filter(x=>x.type==='a').length,1);assert.equal(n.find(x=>x.type==='a').props['aria-label'],undefined);assert.equal(text(n.find(x=>x.type==='a')),event.name);assert.equal(n.find(x=>x.type==='a').props.href,'/congresso%20%2F%20teste');assert.match(text(h.render()),/20 de nov.*21 de nov/);assert.match(text(h.render()),/São Paulo\/SP/);assert.match(text(h.render()),/1.200/);}finally{h.dispose();}
});
test('erro de imagem substitui mídia sem quebrar título e informações',async()=>{
 const h=await harness(event);try{nodes(h.render()).find(x=>x.type==='img').props.onError();assert.ok(!nodes(h.render()).some(x=>x.type==='img'));assert.match(text(h.render()),/Congresso teste|São Paulo\/SP/);}finally{h.dispose();}
});
test('sem capa, logo público é aceito; URL externa ou de outro evento é recusada',async()=>{
 for(const media of [null,{url:'/api/public/events/congresso%20%2F%20teste/media/LOGO',usage:'LOGO'},{url:'https://tracker.invalid/a',usage:'COVER'},{url:'/api/public/events/outro/media/COVER',usage:'COVER'}]){
  const h=await harness({...event,cardMedia:media});try{const img=nodes(h.render()).find(x=>x.type==='img');assert.equal(Boolean(img),media?.usage==='LOGO');}finally{h.dispose();}
 }
});
test('online e ausência de datas são explícitos; a vitrine não promete vagas ou preço',async()=>{
 const h=await harness({...event,format:'ONLINE',startDate:null,endDate:null,venue:null,estimatedAudience:null,cardMedia:null});try{const t=text(h.render());assert.match(t,/Evento online|Data a confirmar/);assert.doesNotMatch(t,/Público estimado|Inscreva-se|Grátis|R\$/);}finally{h.dispose();}
});
