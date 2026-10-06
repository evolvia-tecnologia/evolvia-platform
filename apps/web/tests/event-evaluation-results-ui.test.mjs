import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
async function harness(){
 const key='evaluation_'+Math.random().toString(36).slice(2),slots=[],effects=[];let cursor=0;
 const state={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],next=>slots[index]=typeof next==='function'?next(slots[index]):next];},useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},useEffect(effect){effects.push(effect);},useMemo(fn){return fn();},token:true,calls:[],reply:()=>Promise.resolve(data)};
 globalThis[key]=state;
 const modules={react:url(`const s=globalThis[${JSON.stringify(key)}];export const useState=s.useState.bind(s),useRef=s.useRef.bind(s),useEffect=s.useEffect.bind(s),useMemo=s.useMemo.bind(s);`),'react/jsx-runtime':url('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";'),'../lib/api':url(`const s=globalThis[${JSON.stringify(key)}];export const getToken=()=>s.token;export const api=(path,options)=>{s.calls.push({path,options});return s.reply(path,options);};`),'../lib/event-evaluation-results':url(compile('../lib/event-evaluation-results.ts')),'./event-evaluation-results.module.css':url('export default new Proxy({},{get:(_,key)=>key});')};
 const {default:Results}=await import(url(compile('../components/event-evaluation-results.tsx').replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(modules[name]??name))));
 return{state,render(){cursor=0;const scoped=Results({eventId:'evt / 1'});return scoped.type(scoped.props);},dispose(){delete globalThis[key];}};
}
const data={title:'Avaliação',questions:[{id:'r',label:'Conteúdo',kind:'RATING'},{id:'t',label:'Sugestões',kind:'TEXT'}],rows:[{id:'1',answers:{r:5,t:'Ótima organização'}},{id:'2',answers:{r:1,t:'Mais intervalos'}}]};
const click=(tree,label)=>nodes(tree).find(x=>x.type==='button'&&text(x)===label).props.onClick();
const settled=()=>new Promise(resolve=>setImmediate(resolve));
test('resultados exigem carregamento explícito e mostram distribuição e comentários',async()=>{const h=await harness();try{let tree=h.render();assert.equal(h.state.calls.length,0);click(tree,'Carregar resultados');await settled();tree=h.render();assert.equal(h.state.calls[0].path,'/events/evt%20%2F%201/evaluation/responses');assert.match(text(tree),/Nota 1.*Nota 5/);assert.match(text(tree),/Ótima organização/);assert.match(text(tree),/Médias calculadas por pergunta/);const input=nodes(tree).find(x=>x.type==='input');input.props.onChange({target:{value:'intervalos'}});assert.doesNotMatch(text(h.render()),/Ótima organização/);assert.match(text(h.render()),/Mais intervalos/);}finally{h.dispose();}});
test('erro de recarga limpa dados anteriores e não expõe mensagem interna',async()=>{const h=await harness();try{click(h.render(),'Carregar resultados');await settled();assert.match(text(h.render()),/Ótima organização/);h.state.reply=()=>Promise.reject(new Error('database internal tenant'));click(h.render(),'Atualizar resultados');await settled();const t=text(h.render());assert.doesNotMatch(t,/Ótima organização|database internal tenant/);assert.match(t,/Não foi possível carregar/);}finally{h.dispose();}});
test('sem token não consulta respostas',async()=>{const h=await harness();try{h.state.token=false;click(h.render(),'Carregar resultados');await settled();assert.equal(h.state.calls.length,0);assert.match(text(h.render()),/Entre na sua conta/);}finally{h.dispose();}});

test('sem respostas apresenta um único estado vazio sem gráficos ou busca de comentários',async()=>{const h=await harness();try{h.state.reply=()=>Promise.resolve({...data,rows:[]});click(h.render(),'Carregar resultados');await settled();const tree=h.render();assert.match(text(tree),/Ainda não há respostas registradas/);assert.doesNotMatch(text(tree),/Nota 1|Comentários dos participantes/);assert.equal(nodes(tree).filter(x=>x.type==='input').length,0);}finally{h.dispose();}});
