import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const jsx = url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;');
const stub = url('export default function Placeholder(){}');
const modules = {'react':jsx,'react/jsx-runtime':jsx,'next/link':stub,'./public-eva-support':stub,'./public-event-location':stub,'./public-event-share':stub,'./public-rich-text':stub,'../app/evento/[slug]/page.module.css':url('export default new Proxy({}, {get:(_,key)=>key});')};
for (const name of ['event-time-zone','public-event-contact','public-event-profile','public-registration-cta']) modules[`../lib/${name}`]=url(compile(`../lib/${name}.ts`));
const source=compile('../components/public-event-presentation.tsx').replace(/from ['"]([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(modules[name]??name)}`);
const {default:Presentation}=await import(url(source));
const event={event:{name:'Congresso',slug:'congresso',eventType:'Congresso',profileCode:'SCIENTIFIC_EVENT',estimatedAudience:null,format:'HYBRID',startDate:null,endDate:null,timeZone:'America/Sao_Paulo',venue:null},publication:{shortDescription:null,fullDescription:'Conheça o congresso.',publicContactEmail:null,publicContactPhone:null,seoTitle:null,seoDescription:null,accessibilitySummary:null,themeConfig:null},media:{logo:null,cover:null,socialShare:null},organizer:null,sections:[]};
function nodes(node,found=[]){if(Array.isArray(node)){for(const item of node)nodes(item,found);}else if(node&&typeof node==='object'){found.push(node);nodes(node.props?.children,found);}return found;}
test('programação integra a moldura e o menu antes da inscrição',()=>{
 const program={type:'section',props:{id:'programacao',children:'Programação publicada'}};
 const tree=Presentation({event,programContent:program,registrationMode:'FREE'}),all=nodes(tree);
 assert.ok(all.includes(program));
 assert.equal(all.filter(node=>node.type==='a'&&node.props.href==='#programacao').length,1);
 assert.ok(all.indexOf(program)<all.findIndex(node=>node.props.id==='inscricoes'));
 assert.equal(all.filter(node=>node.props.href==='/evento/congresso/inscricao').length,2);
});
test('evento sem programação não oferece âncora vazia',()=>{
 const all=nodes(Presentation({event,programContent:null}));
 assert.equal(all.filter(node=>node.props.href==='#programacao').length,0);
 assert.ok(all.some(node=>node.props.id==='inscricoes'));
});

