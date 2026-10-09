import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const source=compile('../components/public-event-card.tsx');
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
async function harness(event, schedule=null, audienceText=undefined){
 const states=[];const refs=[];const stateWrites=[];let cursor=0;let refCursor=0;let effects=[];let cleanups=[];let imageElement={complete:false,naturalWidth:0};
 const key='card'+Math.random().toString(36).slice(2);
 globalThis[key]={
  state(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;stateWrites.push({index,value:states[index]});}];},
  ref(initial){const index=refCursor++;if(!(index in refs))refs[index]={current:initial};return refs[index];},
  effect(callback){effects.push(callback);},
  jsx(type,props,key){if(type==='img'&&props?.ref)props.ref.current=imageElement;return {type,props,key};}
 };
 const modules={react:url(`export const useState=globalThis[${JSON.stringify(key)}].state;export const useRef=globalThis[${JSON.stringify(key)}].ref;export const useEffect=globalThis[${JSON.stringify(key)}].effect;`),'react/jsx-runtime':url(`export const jsx=globalThis[${JSON.stringify(key)}].jsx;export const jsxs=jsx;`),'next/link':url('export default "a";'),'../lib/event-time-zone':url(compile('../lib/event-time-zone.ts')),'../lib/public-event-profile':url(compile('../lib/public-event-profile.ts')),'./public-event-card.module.css':url('export default new Proxy({}, {get:(_,key)=>key});')};
 const {default:Card}=await import(url(source.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
 return {
  setEvent(value){event=value;imageElement={complete:false,naturalWidth:0};},
  render(){cursor=0;refCursor=0;effects=[];return Card({event,schedule,audienceText});},
  setImageStatus(value){imageElement={...imageElement,...value};},
  flushEffects(){for(const effect of effects){const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup);}effects=[];},
  stateWrites:()=>[...stateWrites],
  unmount(){for(const cleanup of cleanups)cleanup();cleanups=[];},
  dispose(){this.unmount();delete globalThis[key];}
 };
}
const event={name:'Congresso teste',slug:'congresso / teste',eventType:'Congresso científico',profileCode:'SCIENTIFIC_EVENT',estimatedAudience:1200,format:'HYBRID',startDate:'2026-11-21T01:00:00Z',endDate:'2026-11-22T01:00:00Z',timeZone:'America/Sao_Paulo',venue:'São Paulo/SP',shortDescription:'Pesquisa e inovação',cardMedia:{url:'/api/public/events/congresso%20%2F%20teste/media/COVER',usage:'COVER'}};
test('card preserva capa no SSR, datas no fuso e um único link canônico',async()=>{
 const h=await harness(event,'20 de nov. de 2026 a 21 de nov. de 2026');try{
  const n=nodes(h.render());const img=n.find(x=>x.type==='img');assert.equal(img.props.src,event.cardMedia.url);assert.equal(img.props.loading,'lazy');assert.equal(img.props.alt,'');assert.ok(img.props.ref);assert.equal(n.filter(x=>x.type==='a').length,1);assert.equal(n.find(x=>x.type==='a').props['aria-label'],undefined);assert.equal(text(n.find(x=>x.type==='a')),event.name);assert.equal(n.find(x=>x.type==='a').props.href,'/congresso%20%2F%20teste');assert.match(text(h.render()),/20 de nov.*21 de nov/);assert.doesNotMatch(source,/formatPublicEventSchedule/);assert.match(text(h.render()),/São Paulo\/SP/);assert.match(text(h.render()),/1.200/);
 }finally{h.dispose();}
});
test('texto de audiência do servidor prevalece sobre Intl no cliente',async()=>{
 const h=await harness({...event,estimatedAudience:999},null,'1.200');try{const t=text(h.render());assert.match(t,/Público estimado: 1\.200 pessoas/);assert.doesNotMatch(t,/999/);}finally{h.dispose();}
});
test('erro precoce de imagem só altera a árvore depois da hidratação',async()=>{
 const h=await harness(event);try{
  const initial=nodes(h.render()).find(x=>x.type==='img');initial.props.onError({currentTarget:initial.props.ref.current});assert.ok(nodes(h.render()).some(x=>x.type==='img'));
  h.setImageStatus({complete:true,naturalWidth:0});h.render();h.flushEffects();assert.ok(!nodes(h.render()).some(x=>x.type==='img'));assert.match(text(h.render()),/Congresso teste|São Paulo\/SP/);
 }finally{h.dispose();}
});
test('sem capa, logo público é aceito; URL externa ou de outro evento é recusada',async()=>{
 for(const media of [null,{url:'/api/public/events/congresso%20%2F%20teste/media/LOGO',usage:'LOGO'},{url:'https://tracker.invalid/a',usage:'COVER'},{url:'/api/public/events/outro/media/COVER',usage:'COVER'}]){
  const h=await harness({...event,cardMedia:media});try{const img=nodes(h.render()).find(x=>x.type==='img');assert.equal(Boolean(img),media?.usage==='LOGO');}finally{h.dispose();}
 }
});
test('online e ausência de datas são explícitos; a vitrine não promete vagas ou preço',async()=>{
 const h=await harness({...event,format:'ONLINE',startDate:null,endDate:null,venue:null,estimatedAudience:null,cardMedia:null});try{const t=text(h.render());assert.match(t,/Evento online|Data a confirmar/);assert.doesNotMatch(t,/Público estimado|Inscreva-se|Grátis|R\$/);}finally{h.dispose();}
});

test('montagem com imagem saudável ou sem mídia não solicita nova renderização',async()=>{
 for(const media of [event.cardMedia,null]){
  const h=await harness({...event,cardMedia:media});try{
   h.setImageStatus({complete:true,naturalWidth:640});
   const before=h.render();h.flushEffects();
   assert.deepEqual(h.stateWrites(),[]);
   assert.equal(Boolean(nodes(before).find(x=>x.type==='img')),Boolean(media));
   assert.equal(Boolean(nodes(h.render()).find(x=>x.type==='img')),Boolean(media));
  }finally{h.dispose();}
 }
});
test('erro de imagem depois da montagem ativa o fallback sem perder informações',async()=>{
 const h=await harness(event);try{
  h.setImageStatus({complete:true,naturalWidth:640});
  const image=nodes(h.render()).find(x=>x.type==='img');h.flushEffects();
  assert.deepEqual(h.stateWrites(),[]);
  image.props.onError({currentTarget:image.props.ref.current});
  assert.equal(h.stateWrites().length,1);
  assert.ok(!nodes(h.render()).some(x=>x.type==='img'));
  assert.match(text(h.render()),/Congresso teste|São Paulo\/SP/);
 }finally{h.dispose();}
});
test('callback de erro tardio após desmontagem não escreve estado',async()=>{
 const h=await harness(event);try{
  h.render();h.flushEffects();
  const image=nodes(h.render()).find(x=>x.type==='img');
  const before=h.stateWrites();h.unmount();
  image.props.onError({currentTarget:image.props.ref.current});
  assert.deepEqual(h.stateWrites(),before);
 }finally{h.dispose();}
});


test('imagem substituída tem chave própria e ignora erro do elemento anterior',async()=>{
 const h=await harness(event);try{
  const old=nodes(h.render()).find(x=>x.type==='img');h.flushEffects();
  const oldElement=old.props.ref.current;
  h.setEvent({...event,cardMedia:{url:'/api/public/events/congresso%20%2F%20teste/media/LOGO',usage:'LOGO'}});
  const next=nodes(h.render()).find(x=>x.type==='img');h.flushEffects();
  assert.equal(next.key,next.props.src);assert.notEqual(next.key,old.key);
  old.props.onError({currentTarget:oldElement});assert.deepEqual(h.stateWrites(),[]);
  next.props.onError({currentTarget:next.props.ref.current});assert.equal(h.stateWrites().length,1);
  assert.ok(!nodes(h.render()).some(x=>x.type==='img'));
 }finally{h.dispose();}
});
