import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
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
beforeEach(()=>{hooks.unmount();api.calls.length=0;});
afterEach(()=>hooks.unmount());
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const render=(eventId='event-a')=>{hooks.reset();return View({eventId});};
const tick=()=>new Promise(r=>setTimeout(r,0));
test('clique duplo antes do render emite um único POST e falha permite retry',async()=>{
 render();hooks.run();api.calls[0].resolve({cap:1,pending:false,suggestions:[{submissionId:'s',versionId:'v',title:'Trabalho',reviewerPersonId:'r',reviewerName:'Pessoa'}]});await tick();
 let tree=render();let button=nodes(tree).find(n=>n.type==='button');button.props.onClick();button.props.onClick();
 assert.equal(api.calls.filter(c=>c.options?.method==='POST').length,1);
 api.calls.at(-1).reject(Error('Falha recuperável'));await tick();tree=render();button=nodes(tree).find(n=>n.type==='button');assert.equal(button.props.disabled,false);button.props.onClick();assert.equal(api.calls.filter(c=>c.options?.method==='POST').length,2);
 api.calls.at(-1).reject(Error('Falha'));await tick();hooks.unmount();
});

const preview = title => ({cap:1,pending:false,suggestions:[{submissionId:'s',versionId:'v',title,reviewerPersonId:'r',reviewerName:'Pessoa'}]});
test('troca de evento oculta prévia antiga e ignora GET atrasado',async()=>{
 const start=api.calls.length;render();hooks.run();api.calls[start].resolve(preview('Evento A'));await tick();
 assert.ok(nodes(render()).some(n=>n.props?.children==='Evento A'));
 const beforeEffect=render('event-b');
 const postCount=api.calls.filter(c=>c.options?.method==='POST').length;
 assert.equal(nodes(beforeEffect).find(n=>n.type==='button').props.disabled,true);
 assert.equal(nodes(beforeEffect).filter(n=>n.type==='td').length,0);
 nodes(beforeEffect).find(n=>n.type==='button').props.onClick();
 assert.equal(api.calls.filter(c=>c.options?.method==='POST').length,postCount);
 hooks.run();const b=api.calls.at(-1);
 render('event-c');hooks.run();const c=api.calls.at(-1);
 c.resolve(preview('Evento C'));await tick();b.resolve(preview('Evento B'));await tick();
 const tree=render('event-c');assert.ok(nodes(tree).some(n=>n.props?.children==='Evento C'));assert.ok(!nodes(tree).some(n=>n.props?.children==='Evento B'));hooks.unmount();
});

for(const settle of ['resolve','reject'])test(`POST antigo ${settle} não altera painel do novo evento`,async()=>{
 const start=api.calls.length;render();hooks.run();api.calls[start].resolve(preview('Evento A'));await tick();
 nodes(render()).find(n=>n.type==='button').props.onClick();const oldPost=api.calls.at(-1);
 render('event-b');hooks.run();api.calls.at(-1).resolve(preview('Evento B'));await tick();
 const count=api.calls.length;
 if(settle==='resolve')oldPost.resolve({assignedCount:1,pending:false,cap:1});else oldPost.reject(Error('Falha antiga'));
 await tick();const tree=render('event-b');assert.equal(api.calls.length,count);assert.ok(nodes(tree).some(n=>n.props?.children==='Evento B'));assert.ok(!nodes(tree).some(n=>n.props?.role==='alert'||n.props?.role==='status'));assert.equal(nodes(tree).find(n=>n.type==='button').props.disabled,false);hooks.unmount();
});

test('refresh do lote anterior e resposta após desmontar não escrevem no painel',async()=>{
 const start=api.calls.length;render();hooks.run();api.calls[start].resolve(preview('Evento A'));await tick();
 nodes(render()).find(n=>n.type==='button').props.onClick();api.calls.at(-1).resolve({assignedCount:1,pending:false,cap:1});await tick();const oldRefresh=api.calls.at(-1);
 render('event-b');hooks.run();api.calls.at(-1).resolve(preview('Evento B'));await tick();
 oldRefresh.resolve(preview('Evento A antigo'));await tick();
 assert.ok(nodes(render('event-b')).some(n=>n.props?.children==='Evento B'));
 nodes(render('event-b')).find(n=>n.type==='button').props.onClick();const pendingPost=api.calls.at(-1);const before=hooks.lateWrites();hooks.unmount();pendingPost.reject(Error('Falha após saída'));await tick();assert.equal(hooks.lateWrites(),before);
});

for (const invalid of [false,true]) test(`POST confirmado bloqueia prévia antiga quando refresh ${invalid?'inválido':'falha'}`,async()=>{
 const start=api.calls.length;render();hooks.run();api.calls[start].resolve({cap:1,pending:false,suggestions:[{submissionId:'s',versionId:'v',title:'Trabalho',reviewerPersonId:'r',reviewerName:'Pessoa'}]});await tick();
 nodes(render()).find(n=>n.type==='button').props.onClick();api.calls.at(-1).resolve({assignedCount:1,pending:false,cap:1});await tick();
 if(invalid) api.calls.at(-1).resolve({});else api.calls.at(-1).reject(Error('Rede indisponível'));await tick();
 const tree=render();assert.equal(nodes(tree).find(n=>n.type==='button').props.disabled,true);assert.equal(nodes(tree).filter(n=>n.type==='td').length,0);assert.ok(nodes(tree).some(n=>n.props?.role==='status'));hooks.unmount();
});

