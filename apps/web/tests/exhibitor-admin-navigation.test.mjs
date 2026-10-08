import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { buildEventFlow, workspaceShell } from '../lib/event-flow.ts';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const react = url(`let cursor=0;const overrides=new Map();export const reset=()=>{cursor=0;};export const set=(index,value)=>overrides.set(index,value);export const clear=()=>overrides.clear();export const useState=initial=>{const index=cursor++;const value=overrides.has(index)?overrides.get(index):(typeof initial==='function'?initial():initial);return [value,next=>overrides.set(index,typeof next==='function'?next(value):next)];};export const useId=()=>"central";export const useRef=value=>({current:value});export const useCallback=fn=>fn;export const useEffect=()=>{};`);
const jsx = url('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";');
const modules = {
  react, 'react/jsx-runtime': jsx,
  '../lib/api': url('export class ApiError extends Error{};export const api=()=>{throw new Error("Unexpected request");};'),
  './event-exhibitors.module.css': url('export default new Proxy({},{get:(_,key)=>key});'),
};
const source = ts.transpileModule(readFileSync(new URL('../components/event-exhibitors.tsx', import.meta.url), 'utf8'), { compilerOptions: { module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX } }).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(modules[name] ?? name));
const { default: Central } = await import(url(source));
const hooks = await import(react);
const empty = { event: {id:'demo'}, canManage: true, publicPath: null, listLimited: {companies:false,credentials:false,orders:false}, summary: {exhibitors:{companies:0,quota:0,credentials:0,credentialed:0,pending:0,printed:0},providers:{companies:0,quota:0,credentials:0,credentialed:0,pending:0,printed:0}}, companies:[],credentials:[],forms:[],products:[],downloads:[],orders:[],messages:[] };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
function render(tab='home', home=empty, error='') {
  hooks.reset(); hooks.set(3, tab); hooks.set(4, home); hooks.set(5, error);
  const child = Central({eventId:'demo'});return child.type(child.props);
}
test('abas ativam por setas, Home e End, com um ponto de Tab e painel associado', () => {
  const focused=[];const original=globalThis.document;
  globalThis.document={getElementById:id=>({focus(){focused.push(id);}})};
  try {
    let tree=render(); let tabs=nodes(tree).filter(node=>node.props?.role==='tab');
    assert.equal(tabs.filter(node=>node.props.tabIndex===0).length,1);
    assert.equal(nodes(tree).find(node=>node.props?.role==='tabpanel').props['aria-labelledby'],'central-tab-home');
    let prevented=0;tabs[0].props.onKeyDown({key:'ArrowLeft',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-messages');
    tree=render('messages');tabs=nodes(tree).filter(node=>node.props?.role==='tab');
    tabs.at(-1).props.onKeyDown({key:'Home',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-home');
    tabs[0].props.onKeyDown({key:'End',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-messages');assert.equal(prevented,3);
  } finally {globalThis.document=original;}
});
test('sem acesso ao shell do evento, expositor fecha em vez de cair na moldura operacional', () => {
  assert.equal(workspaceShell({section:'exhibitors',eventId:'demo',phase:'error',payloadEventId:null}),'error');
  assert.equal(buildEventFlow({eventId:'demo',status:'PUBLISHED',section:'exhibitors',scientific:false}).find(step=>step.screen)?.id,'operation');
});
test('pedidos têm legenda, vazio explícito e declaração de que confirmação não é pagamento', () => {
  const tree=render('financial');assert.match(text(tree),/Confirmar um pedido não registra pagamento/);
  assert.match(text(tree),/Nenhum pedido registrado/);
  assert.equal(nodes(tree).find(node=>node.type==='caption').props.children,'Pedidos de serviços');
  assert.ok(nodes(tree).filter(node=>node.type==='th').every(node=>node.props.scope==='col'));
});
test('recorte de pedidos não produz exportação apresentada como completa', () => {
  const tree=render('export',{...empty,listLimited:{...empty.listLimited,orders:true}});
  const buttons=nodes(tree).filter(node=>node.type==='button' && /Pedidos do/.test(text(node)));
  assert.equal(buttons.length,2);assert.ok(buttons.every(node=>node.props.disabled===true));
});
test('falha inicial oferece retry e revisão; troca de evento remonta os dados', () => {
  const tree=render('home',null,'Acesso indisponível');assert.match(text(tree),/Tentar novamente/);
  const alert=nodes(tree).find(node=>node.props?.role==='alert');assert.equal(alert.props.tabIndex,-1);
  assert.equal(Central({eventId:'event-a'}).key,'event-a');
  assert.equal(Central({eventId:'event-b'}).key,'event-b');
});
