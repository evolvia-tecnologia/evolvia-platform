import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const hooksUrl = url('let v="";export const useState=()=>[v,n=>{v=n}];export const reset=()=>{v=""};');
const modules = {
  react: hooksUrl,
  'react/jsx-runtime': url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),
  'next/link': url('export default "a";'),
  './post-event-reports.module.css': url('export default new Proxy({},{get:(_,key)=>key});'),
};
const compiled=ts.transpileModule(readFileSync(new URL('../components/post-event-report-catalog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const {default:Catalog}=await import(url(compiled.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
const hooks=await import(hooksUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const options=[{id:'registration',title:'Inscrições por categoria',group:'Inscrições',description:'Confirmadas'},{id:'payment',title:'Resumo de pagamentos',group:'Financeiro',description:'Recebido'}];
test('busca sem acentos filtra consultas e links, seleção preserva relatório explícito',()=>{
  hooks.reset();let chosen='';
  const render=()=>Catalog({options,selected:'registration',onSelect:id=>{chosen=id},links:[{id:'reviews',title:'Avaliações',group:'Científico',description:'Pareceres',href:'/eventos/A/cientifico/avaliacao'}]});
  let tree=render();
  const input=()=>nodes(tree).find(n=>n.type==='input');
  input().props.onChange({target:{value:'inscricoes'}});
  tree=render();
  const buttons=nodes(tree).filter(n=>n.type==='button');
  assert.equal(buttons.length,1);assert.match(text(buttons),/categoria/);
  assert.equal(buttons[0].props['aria-pressed'],true);
  buttons[0].props.onClick();assert.equal(chosen,'registration');
  input().props.onChange({target:{value:'cientifico'}});tree=render();
  assert.equal(nodes(tree).filter(n=>n.type==='button').length,0);
  assert.equal(nodes(tree).find(n=>n.type==='a').props.href,'/eventos/A/cientifico/avaliacao');
  assert.equal(chosen,'registration','filtrar catálogo não muda seleção/exportação');
  input().props.onChange({target:{value:'sem resultado'}});tree=render();
  assert.match(text(tree),/Nenhum relatório corresponde/);
  input().props.onChange({target:{value:''}});tree=render();
  assert.equal(nodes(tree).filter(n=>n.type==='button').length,2);
  hooks.reset();
});
