import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const hooksUrl=data(`let slots=[],cursor=0,effects=[];export const reset=()=>{cursor=0;};export const run=()=>{const list=effects;effects=[];list.forEach(fn=>fn());};export function useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];}export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];}export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old[k])){slots[i]=deps;effects.push(fn);}}`);
const apiUrl=data(`export const requests=[],pending=[];export const api=async(path,options)=>{requests.push({path,options});if(!options&&path.endsWith('/batches'))return [];if(!options)return {enabled:true,hours:8,title:'Modelo',body:'Corpo',back:'Verso original',art:null,revision:3,issuedCount:10};return new Promise((resolve,reject)=>pending.push({resolve,reject}));};export const apiBlob=()=>{throw Error('not used');};export const getToken=()=>null;`);
const modules={'react':hooksUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'../lib/api':apiUrl,'../lib/event-communication-draft':data(`let next=0;export const communicationDraftId=()=> (++next===1?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222');`),'./publication-rich-text-field':data('export default function Field(){}'),'./scientific-eva-help':data('export default function Help(){}'),'./event-certificate.module.css':data('export default {};')};
const compiled=ts.transpileModule(readFileSync(new URL('../components/event-certificate.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,key)=>'from '+JSON.stringify(modules[key]));
const {default:Component}=await import(data(compiled)),hooks=await import(hooksUrl),mock=await import(apiUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const tick=()=>new Promise(r=>setTimeout(r,0));
function render(){hooks.reset();const root=Component({eventId:'event-a'});return root.type(root.props);}
const issue=tree=>nodes(tree).find(n=>n.type==='button'&&/Emitir lote/.test(text(n)));
test('emissão não duplica clique, recupera pedido após erro e avança cursor só após resposta confirmada',async()=>{
  let tree=render();hooks.run();await tick();tree=render();hooks.run();assert.equal(issue(tree).props.disabled,false);assert.match(text(tree),/10/);
  issue(tree).props.onClick();issue(tree).props.onClick();assert.equal(mock.pending.length,1);
  const first=JSON.parse(mock.requests.at(-1).options.body);assert.deepEqual(first,{requestId:'11111111-1111-4111-8111-111111111111',expectedRevision:3,afterId:null});
  mock.pending[0].reject(new Error('Resposta perdida'));await tick();tree=render();assert.match(text(tree),/Resposta perdida/);
  issue(tree).props.onClick();assert.deepEqual(JSON.parse(mock.requests.at(-1).options.body),first);
  mock.pending[1].resolve({feeCents:0,issuedCount:2,totalIssued:12,skippedCount:1,nextAfterId:'r-40',pending:true});await tick();tree=render();assert.match(text(tree),/12/);assert.match(text(tree),/1 registros/);
  issue(tree).props.onClick();const next=JSON.parse(mock.requests.at(-1).options.body);assert.equal(next.afterId,'r-40');assert.notEqual(next.requestId,first.requestId);
  mock.pending[2].resolve({feeCents:0,issuedCount:0,totalIssued:12,skippedCount:0,nextAfterId:null,pending:false});await tick();
});
