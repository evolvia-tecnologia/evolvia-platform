import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (value) => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`;
const source = ts.transpileModule(readFileSync(new URL('../components/event-evaluation-form.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function harness() {
  const slots = []; const calls = []; let cursor = 0; let complete;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0
      ? { title: 'Avaliação', submittedAt: null, questions: [{ id: 'comentario', label: 'Comentário', kind: 'TEXT', required: false }] }
      : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const h = {
    useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => {},
    fetch: (path, options) => {
      calls.push({ path, ...options });
      return new Promise((resolve, reject) => { complete = { resolve, reject }; });
    },
  };
  const key = `evaluationHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = h;
  const modules = {
    react: url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`),
    'react/jsx-runtime': url('export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
    './event-evaluation.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
  };
  const transformed = `const {fetch}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = () => { cursor = 0; const wrapper = Component({ slug: 'congresso', token: 'opaque-test-token' }); return wrapper.type(wrapper.props); };
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, type); if (found) return found; } return null; }
    return node.type === type ? node : find(node.props?.children, type);
  };
  return {
    calls, render, find,
    submit: () => find(render(), 'form').props.onSubmit({ preventDefault() {} }),
    change: (value) => find(render(), 'textarea').props.onChange({ target: { value } }),
    fail: () => complete.reject(new TypeError('Failed to fetch')),
    reply: (response) => complete.resolve(response),
    cleanup: () => { delete globalThis[key]; },
  };
}

test('duplo envio antes do rerender faz uma única requisição', async () => {
  const h = await harness();
  try {
    const first = h.submit(); await h.submit();
    assert.equal(h.calls.length, 1);
    assert.equal(h.find(h.render(), 'textarea').props.disabled, true);
    h.fail(); await first;
    assert.equal(h.find(h.render(), 'textarea').props.disabled, false);
  } finally { h.cleanup(); }
});

test('resposta perdida permite replay com a mesma chave e corpo', async () => {
  const h = await harness();
  try {
    h.change('Excelente evento');
    const first = h.submit(); h.fail(); await first;
    const retry = h.submit();
    assert.equal(h.calls[1].headers['idempotency-key'], h.calls[0].headers['idempotency-key']);
    assert.equal(h.calls[1].body, h.calls[0].body);
    assert.equal(h.calls[1].headers.authorization, 'Bearer opaque-test-token');
    h.reply({ ok: true, json: async () => ({ submittedAt: '2026-10-05T21:00:00Z', replay: true }) }); await retry;
    assert.equal(h.find(h.render(), 'form'), null);
  } finally { h.cleanup(); }
});

test('editar após recusa gera uma nova chave para o novo conteúdo', async () => {
  const h = await harness();
  try {
    h.change('Primeira resposta');
    const first = h.submit(); h.reply({ ok: false, json: async () => ({ message: 'Resposta inválida' }) }); await first;
    h.change('Resposta corrigida');
    const retry = h.submit();
    assert.notEqual(h.calls[1].headers['idempotency-key'], h.calls[0].headers['idempotency-key']);
    assert.notEqual(h.calls[1].body, h.calls[0].body);
    h.fail(); await retry;
  } finally { h.cleanup(); }
});

test('JSON de sucesso inválido preserva tentativa para confirmar por replay', async () => {
  const h = await harness();
  try {
    const first = h.submit(); h.reply({ ok: true, json: async () => { throw new SyntaxError('HTML'); } }); await first;
    assert.ok(h.find(h.render(), 'form'));
    const retry = h.submit();
    assert.equal(h.calls[1].headers['idempotency-key'], h.calls[0].headers['idempotency-key']);
    h.fail(); await retry;
  } finally { h.cleanup(); }
});
