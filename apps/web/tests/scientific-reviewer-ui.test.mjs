import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = ts.transpileModule(readFileSync(new URL('../app/evento/[slug]/avaliador/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function harness({ loadOnly = false } = {}) {
  const slots = [], effects = [], calls = [];
  let cursor = 0, parses = 0;
  const area = { reviewerName: 'Avaliador', coordinatorDecidesStatus: false, evaluationStyle: 'ANALYTIC',
    criteria: [{ id: 'required000001', required: true, minScore: 0, maxScore: 10 }, { id: 'optional000001', required: false, minScore: 3, maxScore: 10 }],
    assignments: [{ id: 'assignment001', status: 'ASSIGNED', conflictStatus: 'PENDING', submission: { title: 'Pesquisa', authors: [] } }] };
  const values = { conflict: 'no', recommendation: 'ACCEPT', 'score-required000001': '7', 'score-optional000001': '' };
  class FormData { get(name) { return values[name] ?? null; } }
  const key = `reviewerHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = {
    useState: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = index === 0 ? 'opaque-test' : index === 1 && !loadOnly ? area : initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useEffect: (effect) => effects.push(effect), useParams: () => ({ slug: 'congresso' }), FormData,
    fetch: async (path, options) => { calls.push({ path, ...options }); return { ok: false, json: async () => { parses++; if (loadOnly) throw new SyntaxError('HTML do proxy'); return { message: 'Recusado' }; } }; },
  };
  const react = url(`export const {useState,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const navigation = url(`export const {useParams}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,key)=>key});');
  const component = (name) => url(`export default function ${name}(props){return {type:${JSON.stringify(name)},props};}`);
  const modules = { react, 'react/jsx-runtime': jsx, 'next/navigation': navigation, 'next/link': component('Link'),
    '../../../../components/public-site-header': component('PublicSiteHeader'), '../../../../components/scientific-reviews.module.css': css };
  const transformed = `const {fetch,FormData}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/from ['"]([^'"]+)['"]/g, (match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = () => { cursor = 0; return Component(); };
  const find = (node, predicate) => { if (!node || typeof node !== 'object') return null; if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; } return predicate(node) ? node : find(node.props?.children, predicate); };
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
  return { render, find, text, effects, calls, parses: () => parses, cleanup: () => { delete globalThis[key]; } };
}

test('critério opcional vazio não vira nota zero no parecer', async () => {
  const h = await harness();
  try {
    const form = h.find(h.render(), (node) => node.type === 'form');
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(h.calls[0].body).scores, [{ criterionId: 'required000001', value: 7 }]);
  } finally { h.cleanup(); }
});

test('HTML de erro ao abrir área não é analisado nem exibido ao avaliador', async () => {
  const h = await harness({ loadOnly: true });
  try {
    h.render();
    const dispose = h.effects[1]();
    await new Promise(setImmediate);
    assert.equal(h.parses(), 0);
    assert.match(h.text(h.render()), /Não foi possível abrir a área do avaliador/u);
    dispose();
  } finally { h.cleanup(); }
});

test('área do avaliador mantém cabeçalho público, foco e retorno ao evento em todos os estados', async () => {
  const assertFrame = (h, tree, state) => {
    assert.equal(h.find(tree, (node) => node.props?.className === 'skip-link')?.props.href, '#main-content', state);
    assert.equal(h.find(tree, (node) => node.type?.name === 'PublicSiteHeader')?.props.current, 'evento', state);
    const main = h.find(tree, (node) => node.type === 'main');
    assert.equal(main?.props.id, 'main-content', state);
    assert.equal(main?.props.tabIndex, -1, state);
    const back = h.find(tree, (node) => node.type?.name === 'Link');
    assert.equal(back?.props.href, '/evento/congresso', state);
    assert.match(h.text(back), /Voltar ao evento/u, state);
    assert.doesNotMatch(String(back?.props.href), /acesso|opaque-test/u, state);
  };
  const loading = await harness({ loadOnly: true });
  try {
    assertFrame(loading, loading.render(), 'carregando');
    assert.match(loading.text(loading.render()), /Abrindo os trabalhos atribuídos/u);
    loading.effects[1]();
    await new Promise(setImmediate);
    assertFrame(loading, loading.render(), 'indisponível');
  } finally { loading.cleanup(); }
  const loaded = await harness();
  try { assertFrame(loaded, loaded.render(), 'acesso por link'); } finally { loaded.cleanup(); }
});

test('declarar conflito exige motivo e libera notas/recomendação da validação obrigatória', async () => {
  const h = await harness();
  try {
    const choice = h.find(h.render(), (node) => node.type === 'select' && node.props.name === 'conflict');
    choice.props.onChange({ target: { value: 'yes' } });
    const tree = h.render();
    assert.equal(h.find(tree, (node) => node.type === 'input' && node.props.name === 'score-required000001').props.disabled, true);
    assert.equal(h.find(tree, (node) => node.type === 'select' && node.props.name === 'recommendation').props.disabled, true);
    assert.equal(h.find(tree, (node) => node.type === 'textarea' && node.props.name === 'reason').props.required, true);
  } finally { h.cleanup(); }
});
