import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const result = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const scopedRequire = (name) => {
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
    if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    if (name === '../lib/api') return { getToken: () => null };
    if (name === './eva-screen-support') return () => null;
    if (name.startsWith('.')) {
      const base = resolve(dirname(path), name);
      return load([base, base + '.tsx', base + '.ts'].find(existsSync));
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', result.outputText)(scopedRequire, module, module.exports);
  return module.exports;
}
const Form = load(fileURLToPath(new URL('../components/public-registration-form.tsx', import.meta.url))).default;
const options = (terms = true) => ({
  event: { name: 'Evento QA', slug: 'qa', registrationMode: 'FREE', profileCode: 'CORPORATE' },
  categories: [{ id: 'category-qa', name: 'Participante', proofRequirement: 'NONE', lots: [{ id: 'lot-qa', name: 'Lote QA', priceCents: 0, remaining: 10, endsAt: '2026-12-01T12:00:00Z' }] }],
  fields: [{ code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true }, { code: 'preferred_name', label: 'Como deseja ser chamado', type: 'TEXT', required: true }, { code: 'phone', label: 'Celular', type: 'PHONE', required: true }, { code: 'terms_acceptance', label: 'Aceito o aviso fictício', type: 'CONSENT', required: true }],
  terms: terms ? { fileName: 'aviso-qa.pdf', version: 1, url: '/qa/termos' } : null,
  paymentEnabled: false,
});
const json = (value) => new Response(JSON.stringify(value), { status: 200 });
function input(root, label) { return root.findAllByType('label').find((item) => item.children[0] === label).findByType('input'); }

test('formulário real sugere nome, respeita edição, envia telefone e evita POST duplicado', async () => {
  const before = globalThis.fetch;
  const posts = [];
  let finish;
  globalThis.fetch = async (_url, init) => {
    if (!init?.method) return json(options());
    posts.push(JSON.parse(init.body));
    return new Promise((resolve) => { finish = () => resolve(json({ protocol: 'QA-FICTICIO', status: 'CONFIRMED', basePriceCents: 0, discountPercent: 0, finalPriceCents: 0, paymentEnabled: false })); });
  };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(Form, { slug: 'qa' })); });
    await act(async () => { tree.root.findByProps({ name: 'registration-category' }).props.onChange(); });
    await act(async () => { input(tree.root, 'Nome completo').props.onChange({ target: { value: 'Ana Silva' } }); });
    assert.equal(input(tree.root, 'Como deseja ser chamado').props.value, 'Ana');
    await act(async () => { input(tree.root, 'Como deseja ser chamado').props.onChange({ target: { value: 'Dra. Ana' } }); });
    await act(async () => { input(tree.root, 'Nome completo').props.onChange({ target: { value: 'Ana Costa' } }); });
    assert.equal(input(tree.root, 'Como deseja ser chamado').props.value, 'Dra. Ana');
    await act(async () => { input(tree.root, 'DDD').props.onChange({ target: { value: '11' } }); });
    await act(async () => { input(tree.root, 'Número').props.onChange({ target: { value: '999999999' } }); });
    assert.equal(tree.root.findByProps({ id: 'terms-acceptance' }).props.checked, false);
    await act(async () => { tree.root.findByProps({ id: 'terms-acceptance' }).props.onChange({ target: { checked: true } }); });
    await act(async () => {
      void tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
      void tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].answers.phone, '+5511999999999');
    assert.equal(posts[0].answers.preferred_name, 'Dra. Ana');
    await act(async () => { finish(); });
    assert.match(JSON.stringify(tree.toJSON()), /QA-FICTICIO/);
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.fetch = before; }
});

test('falta de documento explica bloqueio sem inventar aceite nem enviar dados', async () => {
  const before = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => { if (init?.method) calls += 1; return json(options(false)); };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(Form, { slug: 'qa' })); });
    assert.equal(tree.root.findByProps({ id: 'terms-acceptance' }).props.disabled, true);
    assert.match(JSON.stringify(tree.toJSON()), /Inscrição indisponível: a organização precisa anexar os termos/);
    await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.equal(calls, 0);
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.fetch = before; }
});
