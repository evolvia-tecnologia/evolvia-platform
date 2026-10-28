import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules={react:url('export const useEffect=()=>{}; export const useState=v=>[typeof v==="function"?v():v,()=>{}];'),'react/jsx-runtime':url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'./print-surface':url('export default "print-surface";'),'./credential-barcode':url('export default "barcode";'),'./credential-qr':url('export default "qr";'),'./credential-label':url('export default "label";'),'../lib/api':url('export const api=(...args)=>globalThis.__labelSaveApi(...args);')};
async function load(p,css){return (await import(url(compile(p).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name===css?url('export default new Proxy({},{get:(_,key)=>key});'):modules[name]??name))))).default;}
const Label=await load('../components/credential-label.tsx','./credential-label.module.css');
const Settings=await load('../components/credential-label-settings.tsx','./credential-label-settings.module.css');
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const base={eventName:'Evento',name:'Nome do participante',company:'Instituição',category:'Participante',protocol:'DEMO-001',qr:'EVQ1.demo',barcode:null,widthMm:90,heightMm:40};
test('etiqueta sem linhas opcionais permanece renderizável e com dimensões finitas',()=>{
 for(const lines of [undefined,null,[]]){const n=Label({label:{...base,lines},preview:true});assert.match(text(n),/Nome do participante/);assert.equal(n.props.style.width,'90mm');assert.ok(Number.isFinite(n.props.style['--label-scale']));assert.equal(nodes(n).filter(x=>x.props?.className==='line').length,0);}
});
test('texto ocupa área própria e barcode é irmão da área QR, sem dividir a coluna de texto',()=>{
 const n=Label({label:{...base,lines:['Área'],barcode:'EVB1.demo'},preview:true});assert.deepEqual(n.props.children.filter(Boolean).map(x=>x.props.className),['copy','codes','barcode']);assert.equal(n.props['data-qr'],true);assert.equal(n.props['data-barcode'],true);
});
test('configuração aceita extraFields ausente na carga e no retorno de salvamento',async()=>{
 const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',showCategory:true,codeMode:'QR'};
 let request;globalThis.__labelSaveApi=async(path,options)=>{request={path,options};return{label:initial};};
 try{let saved;const done=new Promise(resolve=>{const tree=Settings({eventId:'evt / 1',initial,fields:[],onSaved:(message,label)=>{saved=label;resolve();},onError:message=>{throw new Error(message);}});nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();});await done;assert.deepEqual(JSON.parse(request.options.body).extraFields,[]);assert.equal(request.path,'/events/evt%20%2F%201/desk/label');assert.deepEqual(saved.extraFields,[]);assert.equal(saved.widthMm,90);}finally{delete globalThis.__labelSaveApi;}
});

