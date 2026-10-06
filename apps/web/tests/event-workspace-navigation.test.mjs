import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules = {
  react: url('export const useState = initial => [typeof initial === "function" ? initial() : initial, () => {}]; export const useRef = value => ({current:value}); export const useEffect = () => {};'),
  'react/jsx-runtime': url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'),
  'next/link': url('export default "a";'),
  'next/navigation': url('export const useRouter = () => ({replace(){}});'),
  '../lib/api': url('export class ApiError extends Error{};export const getToken=()=>null;export const api=()=>{throw new Error("Unexpected request");};'),
  '../lib/event-flow': url(compile('../lib/event-flow.ts')),
  './event-admin-dashboard.module.css': url('export default new Proxy({},{get:(_,key)=>key});'),
  './accessibility-panel': url('export default function AccessibilityPanel(){return null;}'),
};
const source = compile('../components/event-workspace.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(modules[name] ?? name));
const {default: Workspace} = await import(url(source));
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
function navigation(scientific, section='check-in') {
  const tree = Workspace({eventId:'demo',section,payload:{event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:scientific?'SCIENTIFIC_EVENT':'CORPORATE_TRAINING',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:[]}},children:'Conteúdo'});
  const nav = nodes(tree).find(node=>node.props?.['aria-label']==='Navegação do evento');
  return nodes(nav).filter(node=>node.type==='a');
}
test('menu renderizado segue preparação, científico, operação e integrações',()=>{
  const links=navigation(true);
  assert.deepEqual(links.map(link=>link.props.href),[
    '/eventos/demo/painel','/eventos/demo/painel/divulgacao',
    '/eventos/demo/painel/inscricoes/categorias-lotes','/eventos/demo/painel/inscricoes/ficha','/eventos/demo/painel/inscricoes/beneficios','/eventos/demo/painel/financeiro',
    '/eventos/demo/cientifico','/eventos/demo/painel/inscricoes','/eventos/demo/painel/check-in','/eventos/demo/painel/transmissao','/eventos/demo/painel/integracoes',
  ]);
  const active=links.filter(link=>link.props['aria-current']==='page');assert.equal(active.length,1);assert.match(text(active[0]),/Credenciamento/);
});
test('menu corporativo omite científico e mantém integrações por último',()=>{
  const links=navigation(false,'integrations');assert.ok(!links.some(link=>link.props.href.endsWith('/cientifico')));assert.equal(links.at(-1).props.href,'/eventos/demo/painel/integracoes');assert.equal(links.at(-1).props['aria-current'],'page');
});
