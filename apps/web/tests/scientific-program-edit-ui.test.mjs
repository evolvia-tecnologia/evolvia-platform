import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const time = url(compile(readFileSync(new URL('../lib/event-time-zone.ts', import.meta.url), 'utf8')));
const edit = url(compile(readFileSync(new URL('../lib/scientific-program-edit.ts', import.meta.url), 'utf8')).replace(/['"]\.\/event-time-zone['"]/, JSON.stringify(time)));
const source = compile(readFileSync(new URL('../components/scientific-program.tsx', import.meta.url), 'utf8'));

async function harness(reject = false) {
  const slots = []; const effects = []; const calls = [];
  let cursor = 0;
  const activity = { id: 'a1', title: 'Mesa original', activityType: 'Debate', startAt: '2026-10-10T12:00:00.123Z', endAt: '2026-10-10T13:00:00.456Z', spaceId: 's1', space: { id: 's1', name: 'Sala 1', active: true }, status: 'READY_FOR_REVIEW', participants: [] };
  const payload = { event: { id: 'e1', name: 'Congresso' }, summary: { spaces: 1, activities: 1, blockingConflicts: 0, readyForReview: 1 }, spaces: [activity.space], people: [], taxonomy: [], conflicts: [], activities: [activity], nextAction: 'Revisar' };
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const h = {
    useState: state,
    useRef: (initial) => state({ current: initial })[0],
    useMemo: (fn) => { cursor++; return fn(); },
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) effects.push(fn);
      slots[index] = deps;
    },
    api: async (path, options = {}) => {
      calls.push({ path, ...options });
      if (options.method === 'PATCH') {
        if (reject) throw new Error('Sala ocupada por outra atividade.');
        return { ...payload, activities: [{ ...activity, ...JSON.parse(options.body), status: 'DRAFT' }], summary: { ...payload.summary, readyForReview: 0 } };
      }
      return payload;
    },
  };
  const key = `programEditHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = h;
  const react = url(`const h=globalThis[${JSON.stringify(key)}]; export const {useState,useEffect,useMemo,useRef}=h;`);
  const api = url(`export const api=globalThis[${JSON.stringify(key)}].api; export const getToken=()=> 'test-token';`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;');
  const modules = {
    'react/jsx-runtime': jsx, react, '../lib/api': api,
    '../lib/scientific-program-edit': edit,
    'next/link': url('export default "a";'),
    'next/navigation': url('export const useRouter=()=>({replace(){}});'),
    './scientific-eva-help': url('export default "aside";'),
    './scientific-program.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
  };
  const transformed = source.replace(/from ['"]([^'"]+)['"]/g, (match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = () => { cursor = 0; return Component({ eventId: 'e1' }); };
  render();
  while (effects.length) effects.shift()();
  await new Promise(setImmediate);
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  };
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
  const button = (tree, name) => find(tree, (node) => node.type === 'button' && text(node).startsWith(name));
  const open = () => { const tree = render(); button(tree, 'Editar ou reagendar').props.onClick({ currentTarget: { focus() {} } }); return render(); };
  const form = (tree) => find(tree, (node) => node.type === 'form' && node.props['aria-labelledby'] === 'edit-heading-a1');
  return { render, find, text, button, open, form, calls, cleanup: () => { delete globalThis[key]; } };
}

test('cancelar e salvar sem mudança não enviam PATCH', async () => {
  const h = await harness();
  try {
    let tree = h.open();
    assert.match(h.text(h.form(tree)), /fuso deste navegador/);
    h.button(tree, 'Cancelar').props.onClick();
    assert.equal(h.form(h.render()), null);
    tree = h.open();
    await h.form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.form(h.render()), null);
    assert.equal(h.calls.filter((call) => call.method === 'PATCH').length, 0);
  } finally { h.cleanup(); }
});

for (const reject of [false, true]) {
  test(reject ? 'conflito mantém o formulário preenchido e mostra erro' : 'PATCH atualiza grade e retorna a rascunho', async () => {
    const h = await harness(reject);
    try {
      let tree = h.open();
      h.find(h.form(tree), (node) => node.type === 'input' && node.props.maxLength === 180).props.onChange({ target: { value: 'Mesa corrigida' } });
      tree = h.render();
      await h.form(tree).props.onSubmit({ preventDefault() {} });
      tree = h.render();
      const calls = h.calls.filter((call) => call.method === 'PATCH');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].path, '/scientific-events/e1/program/activities/a1');
      assert.deepEqual(JSON.parse(calls[0].body), { title: 'Mesa corrigida' });
      if (reject) {
        assert.equal(h.find(h.form(tree), (node) => node.type === 'input' && node.props.maxLength === 180).props.value, 'Mesa corrigida');
        assert.match(h.text(h.find(tree, (node) => node.props?.role === 'alert')), /Sala ocupada/);
      } else {
        assert.equal(h.form(tree), null);
        assert.match(h.text(tree), /Mesa corrigida/);
        assert.match(h.text(tree), /Rascunho/);
        assert.match(h.text(h.find(tree, (node) => node.props?.role === 'status')), /Alterações salvas/);
      }
    } finally { h.cleanup(); }
  });
}
