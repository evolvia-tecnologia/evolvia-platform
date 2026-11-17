import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const hooksUrl = url('let slots=[],cursor=0;export const useState=init=>{const i=cursor++;if(!(i in slots))slots[i]=init;return[slots[i],v=>{slots[i]=typeof v==="function"?v(slots[i]):v}];};export const begin=()=>{cursor=0};export const reset=()=>{slots=[];cursor=0};');
const modules = {
  react: hooksUrl,
  'react/jsx-runtime': url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),
  'next/link': url('export default "a";'),
  './post-event-reports.module.css': url('export default new Proxy({},{get:(_,key)=>key});'),
};
const compiled=ts.transpileModule(readFileSync(new URL('../components/post-event-report-catalog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const {default:View}=await import(url(compiled.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
const hooks=await import(hooksUrl);
const Catalog=props=>{hooks.begin();return View(props);};
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

test('assunto selecionado abre, demais recolhem e busca expõe resultados sem mudar seleção',()=>{
 hooks.reset();let selected='registration';
 const render=()=>Catalog({options,selected,onSelect:id=>{selected=id},links:[]});
 let tree=render();let groups=nodes(tree).filter(n=>n.type==='details');
 assert.deepEqual(groups.map(n=>n.props.open),[true,false]);
 assert.equal(nodes(tree).filter(n=>n.type==='summary').length,2);
 nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'pagamentos'}});
 tree=render();groups=nodes(tree).filter(n=>n.type==='details');
 assert.equal(groups.length,1);assert.equal(groups[0].props.open,true);
 assert.equal(selected,'registration');
 nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(selected,'payment');
 hooks.reset();tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==='details').map(n=>n.props.open),[false,true]);
 hooks.reset();
});

test('toggle manual persiste por relatório e busca sem divergir do elemento nativo',()=>{
 hooks.reset();let selected='registration';
 const render=()=>Catalog({options,selected,onSelect:id=>{selected=id},links:[]});
 let tree=render();let groups=nodes(tree).filter(n=>n.type==='details');
 groups[0].props.onToggle({currentTarget:{open:false}});
 groups[1].props.onToggle({currentTarget:{open:true}});
 tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==='details').map(n=>n.props.open),[false,true]);
 nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'inscricoes'}});
 tree=render();groups=nodes(tree).filter(n=>n.type==='details');assert.equal(groups[0].props.open,true);
 groups[0].props.onToggle({currentTarget:{open:false}});
 tree=render();assert.equal(nodes(tree).filter(n=>n.type==='details')[0].props.open,false);
 nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:''}});
 tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==='details').map(n=>n.props.open),[false,true]);
 selected='payment';tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==='details').map(n=>n.props.open),[false,true]);
 selected='registration';tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==='details').map(n=>n.props.open),[false,true]);
 hooks.reset();
});

