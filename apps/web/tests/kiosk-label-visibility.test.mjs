import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const data = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const cssProxy = data('export default new Proxy({}, { get: (_, key) => key });');
const hooksUrl = data(`let slots=[],cursor=0,effects=[];
export const reset=()=>{cursor=0};
export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[]};
export const run=()=>{const list=effects;effects=[];list.forEach(f=>f())};
export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{target[i]=typeof v==='function'?v(target[i]):v}]};
export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]};
export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn()})}}`);
const apiUrl = data(`export const calls=[];export const api=(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));`);
const jsxUrl = data('export const Fragment=Symbol.for("react.fragment");export const jsx=(type,props)=>({type,props});export const jsxs=jsx;');
const labelModules = {
  react: data('export const useEffect=()=>{};export const useRef=()=>({current:null});export const useState=v=>[v,()=>{}];'),
  'react/jsx-runtime': jsxUrl,
  './print-surface': data('export default "print-surface";'),
  './credential-barcode': data('export default "barcode";'),
  './credential-qr': data('export default "qr";'),
  './credential-label.module.css': cssProxy,
  '../lib/credential-label-layout': data(compile('../lib/credential-label-layout.ts')),
};
const labelSource = compile('../components/credential-label.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, key) => {
  assert.ok(labelModules[key], `módulo de etiqueta não mapeado: ${key}`);
  return `from ${JSON.stringify(labelModules[key])}`;
});
const labelUrl = data(labelSource);
const kioskModules = {
  react: hooksUrl,
  'react/jsx-runtime': jsxUrl,
  '../lib/api': apiUrl,
  './credential-label': labelUrl,
  './eva-screen-support': data('export default "eva";'),
  './self-service-kiosk.module.css': cssProxy,
};
const { default: View } = await import(data(compile('../components/self-service-kiosk.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, key) => `from ${JSON.stringify(kioskModules[key])}`)));
const hooks = await import(hooksUrl);
const api = await import(apiUrl);
const css = readFileSync(new URL('../components/self-service-kiosk.module.css', import.meta.url), 'utf8');

function classes(node) {
  return new Set(String(node?.props?.className ?? '').split(/\s+/u).filter(Boolean));
}

function parseRules(source) {
  const rules = [];
  let index = 0;
  function parseBlock(media) {
    while (index < source.length) {
      while (/\s/u.test(source[index] ?? '')) index += 1;
      if (index >= source.length || source[index] === '}') return;
      if (source.slice(index, index + 6) === '@media') {
        const open = source.indexOf('{', index);
        const query = source.slice(index + 6, open).trim();
        index = open + 1;
        parseBlock(query);
        if (source[index] === '}') index += 1;
        continue;
      }
      const open = source.indexOf('{', index);
      const selector = source.slice(index, open).trim();
      index = open + 1;
      const bodyStart = index;
      let depth = 1;
      while (index < source.length && depth) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') depth -= 1;
        if (depth) index += 1;
      }
      const body = source.slice(bodyStart, index);
      index += 1;
      const found = body.match(/display\s*:\s*([^;!}]+)\s*(!important)?/iu);
      if (!found) continue;
      rules.push({
        selector,
        media,
        value: found[1].trim(),
        important: Boolean(found[2]),
        order: rules.length,
        specificity: (selector.match(/\.[A-Za-z0-9_-]+/gu) ?? []).length,
      });
    }
  }
  parseBlock(null);
  return rules;
}

function mediaApplies(query, target) {
  if (!query) return true;
  if (/\bprint\b/u.test(query)) return target === 'print';
  return false;
}

function matches(selector, node, parent) {
  const direct = selector.match(/^\.([A-Za-z0-9_-]+)$/u);
  if (direct) return classes(node).has(direct[1]);
  const child = selector.match(/^\.([A-Za-z0-9_-]+)\s*>\s*:not\(\.([A-Za-z0-9_-]+)\)$/u);
  return Boolean(child && parent && classes(parent).has(child[1]) && !classes(node).has(child[2]));
}

const rules = parseRules(css);

function displayFor(node, parent, media) {
  let best = { value: node.type === 'div' || node.type === 'section' || node.type === 'main' || node.type === 'p' ? 'block' : 'inline', important: false, specificity: -1, order: -1 };
  for (const rule of rules) {
    if (!mediaApplies(rule.media, media) || !matches(rule.selector, node, parent)) continue;
    const first = best.order < 0;
    const importantWins = rule.important && !best.important;
    const sameTier = rule.important === best.important;
    if (first || importantWins || (sameTier && (rule.specificity > best.specificity || (rule.specificity === best.specificity && rule.order > best.order)))) best = rule;
  }
  return best.value;
}

function shown(path, media) {
  return path.every((node, index) => displayFor(node, path[index - 1], media) !== 'none');
}

function domPaths(tree, predicate, stack = [], found = []) {
  if (tree == null || typeof tree !== 'object') return found;
  if (Array.isArray(tree)) {
    for (const item of tree) domPaths(item, predicate, stack, found);
    return found;
  }
  if (typeof tree.type === 'function') return domPaths(tree.type(tree.props), predicate, stack, found);
  if (tree.type === Symbol.for('react.fragment')) return domPaths(tree.props?.children, predicate, stack, found);
  if (typeof tree.type !== 'string') return found;
  const next = [...stack, tree];
  if (predicate(tree)) found.push(next);
  return domPaths(tree.props?.children, predicate, next, found);
}

function collect(tree, predicate, found = []) {
  if (tree == null || typeof tree !== 'object') return found;
  if (Array.isArray(tree)) {
    for (const item of tree) collect(item, predicate, found);
    return found;
  }
  if (typeof tree.type === 'function') return collect(tree.type(tree.props), predicate, found);
  if (tree.type === Symbol.for('react.fragment')) return collect(tree.props?.children, predicate, found);
  if (typeof tree.type === 'string' && predicate(tree)) found.push(tree);
  collect(tree.props?.children, predicate, found);
  return found;
}

const text = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node.type === 'function') return text(node.type(node.props));
  return text(node.props?.children);
};

const blockedBadge = {
  eventName: 'Corrida', name: 'Nome completo '.repeat(30), company: null, lines: [], category: null,
  protocol: 'EVO-1', qr: 'EVQ1.fixture', barcode: null, widthMm: 40, heightMm: 8, alreadyCheckedIn: true,
};
const readableBadge = {
  eventName: 'Corrida', name: 'Ana Lima', company: null, lines: [], category: '5 km',
  protocol: 'EVO-1', qr: 'EVQ1.fixture', barcode: null, widthMm: 90, heightMm: 40, alreadyCheckedIn: true,
};

function render() {
  hooks.reset();
  const root = View({ slug: 'corrida' });
  return root.type(root.props);
}

async function openSuccess(badge) {
  globalThis.window = { setTimeout() { return 1; }, clearTimeout() {}, print() { globalThis.__kioskPrinted = (globalThis.__kioskPrinted ?? 0) + 1; } };
  globalThis.__kioskPrinted = 0;
  render();
  hooks.run();
  api.calls.at(-1).resolve({ eventName: 'Corrida', logoUrl: null, logoAlt: null, methods: ['QR'] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = render();
  hooks.run();
  const input = collect(tree, (node) => node.props?.['aria-label'] === 'QR Code')[0];
  input.props.onChange({ target: { value: 'EVQ1.fixture' } });
  tree = render();
  const form = collect(tree, (node) => node.type === 'form')[0];
  form.props.onSubmit({ preventDefault() {} });
  api.calls.at(-1).resolve({ name: 'Ana Lima', category: '5 km', company: null, alreadyCheckedIn: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = render();
  collect(tree, (node) => node.type === 'button' && text(node) === 'Imprimir')[0].props.onClick();
  api.calls.at(-1).resolve(badge);
  await new Promise((resolve) => setTimeout(resolve, 0));
  tree = render();
  hooks.run();
  return tree;
}

test('prévia ilegível fica visível na tela e some na impressão, sem virar etiqueta', async () => {
  try {
    const tree = await openSuccess(blockedBadge);
    const preview = domPaths(tree, (node) => node.props?.['data-kiosk-label-state'] === 'preview')[0];
    assert.ok(preview, 'a prévia bloqueada precisa estar na árvore da tela de sucesso');
    assert.equal(shown(preview, 'screen'), true, 'a prévia precisa aparecer na tela');
    assert.equal(shown(preview, 'print'), false, 'a prévia e o aviso precisam ficar fora da impressão');
    assert.equal(domPaths(tree, (node) => classes(node).has('label')).length, 0, 'etiqueta ilegível não pode ocupar a área de impressão');
    const alerts = domPaths(tree, (node) => node.props?.role === 'alert');
    assert.ok(alerts.length >= 1, 'o participante precisa ver o aviso');
    for (const path of alerts) {
      assert.equal(path.some((node) => classes(node).has('label')), false);
      assert.equal(shown(path, 'print'), false, 'aviso de erro não pode ser impresso como etiqueta');
      assert.equal(shown(path, 'screen'), true);
    }
    assert.equal(globalThis.__kioskPrinted ?? 0, 0);
    const reprint = collect(tree, (node) => node.type === 'button' && text(node) === 'Imprimir de novo')[0];
    assert.equal(reprint.props.disabled, true);
  } finally {
    hooks.unmount();
    api.calls.length = 0;
    delete globalThis.window;
    delete globalThis.__kioskPrinted;
  }
});

test('etiqueta que cabe continua oculta na tela e visível só na impressão', async () => {
  try {
    const tree = await openSuccess(readableBadge);
    assert.equal(domPaths(tree, (node) => node.props?.['data-kiosk-label-state'] === 'preview').length, 0);
    const label = domPaths(tree, (node) => node.props?.['data-kiosk-label-state'] === 'print')[0];
    assert.ok(label);
    assert.equal(classes(label.at(-1)).has('label'), true);
    assert.equal(shown(label, 'screen'), false, 'a etiqueta física não aparece na tela do totem');
    assert.equal(shown(label, 'print'), true, 'a etiqueta que cabe volta a aparecer na mídia de impressão');
    assert.equal(collect(tree, (node) => node.props?.role === 'alert').length, 0);
    const printable = collect(label.at(-1), (node) => node.type === 'print-surface');
    assert.equal(printable.length, 1, 'só o miolo que cabe segue para a impressora');
  } finally {
    hooks.unmount();
    api.calls.length = 0;
    delete globalThis.window;
    delete globalThis.__kioskPrinted;
  }
});
