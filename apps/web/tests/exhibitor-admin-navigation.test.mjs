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
const { default: Central, csvCell, formatMessageDateTime, ordersCsv, priceToCents } = await import(url(source));
const hooks = await import(react);
const empty = { event: {id:'demo'}, canManage: true, publicPath: null, listLimited: {companies:false,credentials:false,orders:false}, summary: {exhibitors:{companies:0,quota:0,credentials:0,credentialed:0,pending:0,printed:0},providers:{companies:0,quota:0,credentials:0,credentialed:0,pending:0,printed:0}}, companies:[],credentials:[],forms:[],products:[],downloads:[],orders:[],messages:[] };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
function render(tab='home', home=empty, error='') {
  hooks.reset(); hooks.set(3, tab); hooks.set(4, home); hooks.set(5, error);
  const child = Central({eventId:'demo'});return child.type(child.props);
}
test('abas locais ativam por setas, Home e End, com um ponto de Tab e painel associado', () => {
  const focused=[];const original=globalThis.document;
  globalThis.document={getElementById:id=>({focus(){focused.push(id);}})};
  try {
    let tree=render(); let tabs=nodes(tree).filter(node=>node.props?.role==='tab');
    assert.equal(tabs.filter(node=>node.props.tabIndex===0).length,1);
    assert.equal(nodes(tree).find(node=>node.props?.role==='tabpanel').props['aria-labelledby'],'central-tab-home');
    let prevented=0;tabs[0].props.onKeyDown({key:'ArrowLeft',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-credentials');
    tree=render('messages');tabs=nodes(tree).filter(node=>node.props?.role==='tab');
    tabs.at(-1).props.onKeyDown({key:'Home',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-financial');
    tabs[0].props.onKeyDown({key:'End',preventDefault(){prevented++;}});
    assert.equal(focused.at(-1),'central-tab-messages');assert.equal(prevented,3);
  } finally {globalThis.document=original;}
});
test('navegação mostra uma área por vez e troca para a primeira opção do grupo', () => {
  hooks.clear();
  const focused=[];const original=globalThis.document;
  globalThis.document={getElementById:id=>({focus(){focused.push(id);}})};
  try {
  let tree=render();
  assert.equal(nodes(tree).filter(node=>node.props?.role==='tab').length,4);
  assert.doesNotMatch(text(tree),/Pedidos e valoresExportarMensagens/);
  const groups=nodes(tree).filter(node=>node.type==='button' && node.props?.['aria-controls']==='central-group-tabs');
  assert.equal(groups.length,3);
  assert.equal(groups[0].props['aria-pressed'],true);
  assert.equal(groups.filter(node=>node.props.tabIndex===0).length,1);
  assert.equal(groups.filter(node=>node.props.tabIndex===-1).length,2);
  groups[0].props.onKeyDown({key:'End',preventDefault(){}});
  assert.equal(focused.at(-1),'central-group-tracking');
  groups[2].props.onClick();
  tree=render('financial');
  assert.equal(nodes(tree).filter(node=>node.props?.role==='tab').length,3);
  assert.equal(nodes(tree).filter(node=>node.props?.role==='tab')[0].props['aria-selected'],true);
  } finally {globalThis.document=original;hooks.clear();}
});
test('seletores de área têm foco visível explícito', () => {
  const css=readFileSync(new URL('../components/event-exhibitors.module.css',import.meta.url),'utf8');
  assert.match(css,/\.groupButton:focus-visible, \.groupActive:focus-visible/);
});
test('área ativa é um grupo anunciado e preserva a subaba atual ao ser acionada novamente', () => {
  hooks.clear();
  let tree=render('registrations');
  const selector=nodes(tree).find(node=>node.props?.role==='group' && node.props?.['aria-label']==='Áreas da central');
  assert.ok(selector);
  const active=nodes(tree).find(node=>node.type==='button' && node.props?.['aria-pressed']===true);
  active.props.onClick();
  tree=render('registrations');
  assert.equal(nodes(tree).find(node=>node.props?.role==='tabpanel').props['aria-labelledby'],'central-tab-registrations');
  hooks.clear();
});
test('estado inicial vazio orienta uma única ação principal', () => {
  const tree=render();
  assert.match(text(tree),/Cadastre a primeira empresa/);
  assert.equal(nodes(tree).filter(node=>node.type==='button' && text(node)==='Incluir primeira empresa').length,1);
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


test('valor brasileiro preserva milhares e rejeita formatos ambíguos', () => {
  assert.equal(priceToCents('1.000'), 100000);
  assert.equal(priceToCents('1.000,50'), 100050);
  assert.equal(priceToCents('1000.50'), 100050);
  assert.equal(priceToCents('10,5'), 1050);
  assert.equal(Number.isNaN(priceToCents('1.000.50')), true);
  assert.equal(Number.isNaN(priceToCents('1,000')), true);
});

test('CSV normaliza valores ausentes e neutraliza fórmulas', () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});

test('data da mensagem é determinística em Brasília e credencial exige empresa', () => {
  assert.equal(formatMessageDateTime('2026-10-08T01:30:00.000Z'), '07/10/2026, 22:30');
  assert.equal(formatMessageDateTime('inválida'), 'Data inválida');
  const tree = render('credentials');
  const button = nodes(tree).find(node => node.type === 'button' && text(node) === 'Adicionar credencial');
  assert.equal(button.props.disabled, true);
});


test('CSV brasileiro abre em colunas e mantém valor numérico somável', () => {
  const csv = ordersCsv([{
    companyKind: 'EXHIBITOR',
    companyTradeName: 'Empresa',
    formTitle: 'Energia',
    productTitle: 'Ponto 20A',
    quantity: 2,
    unit: 'un',
    priceCents: 75000,
    status: 'REQUESTED',
  }], 'EXHIBITOR');
  assert.match(csv, /^sep=;\n/);
  assert.match(csv, /"1500,00"/);
  assert.doesNotMatch(csv, /R\$/);
  assert.equal(csv.split('\n')[1].split(';').length, 7);
});

test('consulta apresenta filtros compactos, resultado vazio e limpeza sem alterar os cadastros', () => {
  hooks.clear();
  let tree = render('registrations');
  assert.match(text(tree), /Consultar empresas/);
  assert.match(text(tree), /Nenhuma empresa encontrada/);
  assert.equal(nodes(tree).find(node => node.type === 'td' && node.props.colSpan === 6).props.colSpan, 6);
  const selects = nodes(tree).filter(node => node.type === 'select');
  assert.equal(selects.length, 2);
  assert.equal(nodes(tree).filter(node => node.type === 'input' && node.props.type === 'radio').length, 0);
  const search = nodes(tree).find(node => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({target:{value:'teste'}});
  selects[0].props.onChange({target:{value:'EMAIL'}});
  selects[1].props.onChange({target:{value:'ALL'}});
  tree = render('registrations');
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Limpar filtros').props.onClick();
  tree = render('registrations');
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.type === 'search').props.value, '');
  assert.equal(nodes(tree).filter(node => node.type === 'select')[0].props.value, 'COMPANY');
  assert.equal(nodes(tree).filter(node => node.type === 'select')[1].props.value, 'EXHIBITOR');
  hooks.clear();
});

test('busca aceita campos de empresa ausentes sem interromper a central', () => {
  hooks.clear();
  const home = {...empty, companies:[{id:'incomplete',kind:'EXHIBITOR',legalName:'Empresa',tradeName:'Empresa',contactName:null,loginEmail:null,contactEmail:null,document:null,city:null,state:null,quotaLimit:0}]};
  try {
    for (const field of ['NAME','EMAIL','DOCUMENT','CITY','STATE']) {
      let tree = render('registrations', home);
      nodes(tree).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({target:{value:'busca'}});
      nodes(tree).find(node => node.type === 'select').props.onChange({target:{value:field}});
      tree = render('registrations', home);
      assert.match(text(tree), /Nenhuma empresa encontrada/);
    }
  } finally { hooks.clear(); }
});

