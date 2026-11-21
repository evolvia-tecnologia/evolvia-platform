import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const data = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooksUrl = data(`let slots=[],cursor=0,effects=[];
export const reset=()=>{cursor=0};
export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[]};
export const run=()=>{const list=effects;effects=[];list.forEach(fn=>fn())};
export function useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}
export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]};
export function useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn()})}}`);
const apiUrl = data(`export const calls=[];export const getToken=()=>'fixture';export const api=(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));`);
const compile = (path) => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const jsxRuntime = data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;');
const css = data('export default new Proxy({},{get:(_,k)=>k})');

const audienceSource = compile('../components/event-communication-audience.tsx').replace(
  /from ['"]([^'"]+)['"]/g,
  (_, key) => `from ${JSON.stringify({
    react: hooksUrl,
    'react/jsx-runtime': jsxRuntime,
    '../lib/api': apiUrl,
    './event-communication.module.css': css,
  }[key])}`,
);

const modules = {
  react: hooksUrl,
  'react/jsx-runtime': jsxRuntime,
  '../lib/api': apiUrl,
  '../lib/event-communication-draft': data('export const communicationDraftId=()=>"11111111-1111-4111-8111-111111111111";'),
  './publication-rich-text-field': data('export default function Field(props){return {type:"textarea",props};}'),
  './event-communication-audience': data(audienceSource),
  './event-communication.module.css': css,
};

const parentSource = compile('../components/event-communication.tsx').replace(
  /from ['"]([^'"]+)['"]/g,
  (_, key) => `from ${JSON.stringify(modules[key])}`,
);

const { default: View } = await import(data(parentSource));
const hooks = await import(hooksUrl);
const api = await import(apiUrl);

const nodes = (n) => (Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : []);
const text = (n) => (Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? ''));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props ?? {}));
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
}

const render = () => {
  hooks.reset();
  const root = View({ eventId: 'event-a' });
  return expand(typeof root.type === 'function' ? root.type(root.props) : root);
};

const button = (tree, label) => nodes(tree).find((n) => n.type === 'button' && text(n) === label);
const select = (tree, label) => nodes(tree).find((n) => n.type === 'select' && n.props['aria-label'] === label);

async function boot() {
  hooks.unmount();
  api.calls.length = 0;
  let tree = render();
  hooks.run();
  const listing = api.calls.find((call) => /communication\/drafts$/.test(call.path) && !call.options?.method);
  assert.ok(listing, 'deve carregar a listagem de rascunhos');
  listing.resolve({ eventId: 'event-a', drafts: [], sendingAvailable: false });
  await tick();
  tree = render();
  hooks.run();
  const categories = api.calls.find((call) => /audience\/categories$/.test(call.path));
  assert.ok(categories, 'deve carregar categorias da prévia');
  categories.resolve([{ id: 'cat-a', name: 'Categoria A' }]);
  await tick();
  return render();
}

test('abas Escrever/Rascunhos/Prévia/Histórico sem falso enviado e role=status só em avisos dinâmicos', async () => {
  try {
    let tree = await boot();
    assert.ok(button(tree, 'Escrever'));
    assert.ok(button(tree, 'Rascunhos (0)'));
    assert.ok(button(tree, 'Prévia do público'));
    assert.ok(button(tree, 'Histórico'));
    assert.match(text(tree), /Envio em lote ainda indisponível/);

    button(tree, 'Histórico').props.onClick();
    tree = render();
    assert.match(text(tree), /A API ainda não publica histórico de disparos/);
    assert.doesNotMatch(text(tree), /E-mail enviado com sucesso|Mensagem enviada|Nenhum envio registrado neste evento/);
    const historyCard = nodes(tree).find((n) => n.type === 'section' && n.props['aria-label'] === 'Histórico de envios');
    assert.ok(historyCard);
    const staticHistory = nodes(historyCard).filter((n) => n.type === 'p');
    assert.ok(staticHistory.every((node) => node.props.role !== 'status'));
  } finally {
    hooks.unmount();
  }
});

test('filtros da prévia sobrevivem à troca Escrever → Rascunhos → Prévia', async () => {
  try {
    let tree = await boot();
    assert.ok(select(tree, 'Situação financeira'), 'prévia montada em Escrever');
    select(tree, 'Situação financeira').props.onChange({ target: { value: 'PAID' } });
    tree = render();
    assert.equal(select(tree, 'Situação financeira').props.value, 'PAID');

    button(tree, 'Rascunhos (0)').props.onClick();
    tree = render();
    const wrapper = nodes(tree).find((n) => n.type === 'div' && n.props.hidden === true);
    assert.ok(wrapper, 'prévia permanece montada oculta em Rascunhos');
    assert.equal(select(tree, 'Situação financeira').props.value, 'PAID');

    button(tree, 'Prévia do público').props.onClick();
    tree = render();
    assert.equal(select(tree, 'Situação financeira').props.value, 'PAID');
    assert.equal(nodes(tree).find((n) => n.type === 'div' && Object.prototype.hasOwnProperty.call(n.props, 'hidden')).props.hidden, false);
  } finally {
    hooks.unmount();
  }
});
