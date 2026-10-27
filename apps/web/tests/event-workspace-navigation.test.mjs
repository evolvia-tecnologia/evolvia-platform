import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules = {
  react: url('let cursor=0;const state=new Map();export const reset=()=>{cursor=0;};export const clear=()=>{cursor=0;state.clear();};export const useState=initial=>{const index=cursor++;const value=state.has(index)?state.get(index):(typeof initial==="function"?initial():initial);return [value,next=>state.set(index,typeof next==="function"?next(value):next)];};export const useRef=value=>({current:value});export const useEffect=()=>{};'),
  'react/jsx-runtime': url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'),
  'next/link': url('export default "a";'),
  'next/navigation': url('let currentPath = "/eventos/demo/painel/check-in"; export const useRouter = () => ({replace(){}}); export const usePathname = () => currentPath; export const setPathname = (value) => { currentPath = value; };'),
  '../lib/api': url('export class ApiError extends Error{};export const getToken=()=>null;export const api=()=>{throw new Error("Unexpected request");};'),
  '../lib/event-flow': url(compile('../lib/event-flow.ts')),
  './event-admin-dashboard.module.css': url('export default new Proxy({},{get:(_,key)=>key});'),
  './accessibility-panel': url('export default function AccessibilityPanel(){return null;}'),
};
const source = compile('../components/event-workspace.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(modules[name] ?? name));
const {default: Workspace} = await import(url(source));
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
function navigation(scientific, section='check-in', capabilities=[]) {
  const tree = Workspace({eventId:'demo',section,payload:{event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:scientific?'SCIENTIFIC_EVENT':'CORPORATE_TRAINING',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities}},children:'Conteúdo'});
  const nav = nodes(tree).find(node=>node.props?.['aria-label']==='Navegação do evento');
  return nodes(nav).filter(node=>node.type==='a');
}
test('menu renderizado segue preparação, científico, operação e integrações',()=>{
  const links=navigation(true);
  assert.deepEqual(links.map(link=>link.props.href),[
    '/eventos/demo/painel','/eventos/demo/painel/divulgacao','/eventos/demo/painel/comunicacao',
    '/eventos/demo/painel/inscricoes/categorias-lotes','/eventos/demo/painel/inscricoes/ficha','/eventos/demo/painel/inscricoes/beneficios','/eventos/demo/painel/financeiro',
    '/eventos/demo/cientifico/trabalhos','/eventos/demo/cientifico/submissoes#estacao','/eventos/demo/cientifico/grade','/eventos/demo/painel/inscricoes','/eventos/demo/painel/check-in','/eventos/demo/painel/check-in#totens','/eventos/demo/painel/transmissao','/eventos/demo/painel/certificados','/eventos/demo/painel/relatorios','/eventos/demo/painel/integracoes',
  ]);
  assert.match(text(links), /Trabalhos científicosSubmissão, avaliação e decisão/u);
  assert.match(text(links), /Programação científicaPalestrantes/u);
  assert.match(text(links), /Palestrantes, atividades, locais, dias e horários/u);
  assert.doesNotMatch(text(links), /Grade, programação e trabalhos/u);
  const active=links.filter(link=>link.props['aria-current']==='page');assert.equal(active.length,1);assert.match(text(active[0]),/Credenciamento/);
});
test('trilha do filho científico volta ao fluxo e ao painel', async () => {
  const navigationModule = await import(modules['next/navigation']);
  const payload = {event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:[]}};
  navigationModule.setPathname('/eventos/demo/cientifico/avaliacao');
  const reviewTree = Workspace({eventId:'demo',section:'scientific',payload,children:'Conteúdo'});
  const reviewCrumb = nodes(reviewTree).find(node => node.props?.['aria-label'] === 'Você está em');
  const reviewLinks = nodes(reviewCrumb).filter(node => node.type === 'a').map(node => node.props.href);
  assert.ok(reviewLinks.includes('/eventos/demo/painel'));
  assert.ok(reviewLinks.includes('/eventos/demo/cientifico/trabalhos'));
  assert.match(text(reviewCrumb), /Avaliação e decisão/u);
  navigationModule.setPathname('/eventos/demo/cientifico/programacao');
  const programTree = Workspace({eventId:'demo',section:'scientific',payload,children:'Conteúdo'});
  const programCrumb = nodes(programTree).find(node => node.props?.['aria-label'] === 'Você está em');
  const programLinks = nodes(programCrumb).filter(node => node.type === 'a').map(node => node.props.href);
  assert.ok(programLinks.includes('/eventos/demo/cientifico/grade'));
  assert.match(text(programCrumb), /Locais, dias e horários/u);
  navigationModule.setPathname('/eventos/demo/painel/check-in');
});
test('menu corporativo omite científico e mantém integrações por último',()=>{
  const links=navigation(false,'integrations');assert.ok(!links.some(link=>link.props.href.endsWith('/cientifico')));assert.equal(links.at(-1).props.href,'/eventos/demo/painel/integracoes');assert.equal(links.at(-1).props['aria-current'],'page');
});

test('menu de entretenimento inclui acessos e catracas do show', () => {
  const tree = Workspace({eventId:'demo',section:'show',payload:{event:{id:'demo',name:'Show',status:'PUBLISHED',profileCode:'ENTERTAINMENT',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:[]}},children:'Conteúdo'});
  const nav = nodes(tree).find(node=>node.props?.['aria-label']==='Navegação do evento');
  const links = nodes(nav).filter(node=>node.type==='a');
  const show = links.find(link => link.props.href === '/eventos/demo/painel/show');
  assert.ok(show);
  assert.equal(show.props['aria-current'], 'page');
  assert.match(text(show), /Acessos e catracas/);
  assert.match(text(nav), /Ingressos e vendas/);
  assert.match(text(links), /Ingressos vendidos/);
  assert.ok(!navigation(false).some(link => link.props.href.endsWith('/painel/show')));
});

test('expositor aparece por recurso habilitado, inclusive fora do perfil feira', () => {
  for (const scientific of [true, false]) {
    const links = navigation(scientific, 'exhibitors', ['exhibitor']);
    const exhibitor = links.find(link => link.props.href === '/eventos/demo/painel/expositores');
    assert.ok(exhibitor);
    assert.equal(exhibitor.props['aria-current'], 'page');
    assert.match(text(exhibitor), /Empresas, cotas, formulários e pedidos/);
  }
  assert.ok(!navigation(false, 'overview').some(link => link.props.href.endsWith('/expositores')));
});


test('expositor ocupa um grupo próprio fora dos links de operação', () => {
  const tree = Workspace({eventId:'demo',section:'exhibitors',payload:{event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:'CORPORATE_TRAINING',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:['exhibitor']}},children:'Conteúdo'});
  const nav = nodes(tree).find(node => node.props?.['aria-label'] === 'Navegação do evento');
  const group = nodes(nav).find(node => node.props?.role === 'group' && node.props['aria-labelledby'] === 'exhibitor-navigation-title');
  assert.ok(group);
  assert.deepEqual(nodes(group).filter(node => node.type === 'a').map(node => node.props.href), ['/eventos/demo/painel/expositores', '/eventos/demo/painel/caex']);
  const children = nav.props.children.flat().filter(Boolean);
  assert.ok(children.indexOf(group) > children.findIndex(node => node.props?.href === '/eventos/demo/painel/certificados'));
  assert.ok(children.indexOf(group) < children.findIndex(node => node.props?.children === 'Conexões'));
});

test('menu lateral pode ser ocultado e expandido com indicação acessível e conteúdo preservado', async () => {
  const hooks = await import(modules.react);
  hooks.clear();
  const payload = {event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:'CORPORATE_TRAINING',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:['exhibitor']}};
  const render = () => {
    hooks.reset();
    return Workspace({eventId:'demo',section:'exhibitors',payload,children:'Conteúdo do expositor'});
  };
  const toggle = tree => nodes(tree).find(node => node.type === 'button' && node.props['aria-controls'] === 'event-admin-navigation');
  const sidebar = tree => nodes(tree).find(node => node.type === 'aside');
  try {
    let tree = render();
    assert.equal(toggle(tree).props['aria-expanded'], true);
    assert.equal(text(toggle(tree)), '‹Ocultar menu');
    assert.equal(toggle(tree).props['aria-label'], 'Ocultar menu lateral');
    const banner = nodes(tree).find(node => node.type === 'header');
    assert.ok(!nodes(banner).includes(toggle(tree)));
    assert.ok(!nodes(sidebar(tree)).includes(toggle(tree)));
    toggle(tree).props.onClick();
    tree = render();
    assert.equal(sidebar(tree).props.hidden, true);
    assert.equal(sidebar(tree).props['aria-hidden'], true);
    assert.equal(toggle(tree).props['aria-expanded'], false);
    assert.equal(text(toggle(tree)), '☰Mostrar menu');
    assert.equal(toggle(tree).props['aria-label'], 'Mostrar menu lateral');
    assert.ok(nodes(sidebar(tree)).filter(node => node.type === 'a').every(node => node.props.tabIndex === -1));
    assert.match(text(tree), /Conteúdo do expositor/);
    toggle(tree).props.onClick();
    tree = render();
    assert.equal(sidebar(tree).props.hidden, false);
    assert.equal(toggle(tree).props['aria-expanded'], true);
    assert.ok(nodes(sidebar(tree)).filter(node => node.type === 'a').every(node => node.props.tabIndex === undefined));
  } finally { hooks.clear(); }
});

test('relatórios têm entrada própria ativa sem liberar painel ao operador', async () => {
  const hooks = await import(modules.react); hooks.clear();
  const links = navigation(false, 'reports');
  const selected = links.filter(link => link.props['aria-current'] === 'page');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].props.href, '/eventos/demo/painel/relatorios');
  assert.match(text(selected[0]), /Relatórios/);
  const { workspaceShell } = await import(modules['../lib/event-flow']);
  assert.equal(workspaceShell({section:'reports',eventId:'demo',phase:'error',payloadEventId:null}), 'error');
  hooks.clear();
});


test('trabalhos e programação possuem grupos separados e um único item ativo em cada rota filha', async () => {
  const hooks = await import(modules.react);
  const route = await import(modules['next/navigation']);
  const payload = {event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:[]}};
  try {
    for (const [path, label, href] of [
      ['avaliacao','Trabalhos científicos','trabalhos'],
      ['submissoes','Trabalhos científicos','trabalhos'],
      ['palestrantes','Programação científica','grade'],
      ['programacao','Programação científica','grade'],
    ]) {
      hooks.clear(); route.setPathname('/eventos/demo/cientifico/' + path);
      const tree = Workspace({eventId:'demo',section:'scientific',payload,children:'Conteúdo'});
      const nav = nodes(tree).find(node=>node.props?.['aria-label']==='Navegação do evento');
      const groups = nodes(nav).filter(node=>node.props?.role==='group');
      const works = groups.find(node=>node.props['aria-label']==='Trabalhos científicos');
      const program = groups.find(node=>node.props['aria-label']==='Programação científica');
      assert.ok(works); assert.ok(program); assert.notEqual(works, program);
      assert.deepEqual(nodes(works).filter(node=>node.type==='a').map(node=>node.props.href), ['/eventos/demo/cientifico/trabalhos', '/eventos/demo/cientifico/submissoes#estacao']);
      assert.deepEqual(nodes(program).filter(node=>node.type==='a').map(node=>node.props.href), ['/eventos/demo/cientifico/grade']);
      const active = nodes(nav).filter(node=>node.props?.['aria-current']==='page');
      assert.equal(active.length,1); assert.equal(active[0].props.href,'/eventos/demo/cientifico/'+href);
      assert.match(text(active[0]),new RegExp(label));
    }
  } finally { hooks.clear(); route.setPathname('/eventos/demo/painel/check-in'); }
});


test('secretaria agrupa credenciamento e totens sem incluir expositor', () => {
  const tree = Workspace({eventId:'demo',section:'check-in',payload:{event:{id:'demo',name:'Evento',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT',organization:{name:'Organização'}},session:{completionPercent:100},answers:{capabilities:['exhibitor']}},children:'Conteúdo'});
  const group = nodes(tree).find(node=>node.props?.role==='group' && node.props['aria-label']==='Secretaria e credenciamento');
  assert.ok(group);
  assert.deepEqual(nodes(group).filter(node=>node.type==='a').map(node=>node.props.href), ['/eventos/demo/painel/check-in','/eventos/demo/painel/check-in#totens']);
  assert.match(text(group), /consulta, ficha, etiqueta e check-in/);
  assert.doesNotMatch(text(group), /CAEX|Expositor/);
});
