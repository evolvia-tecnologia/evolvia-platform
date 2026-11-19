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
const agendaModel = url(compile(readFileSync(new URL('../lib/scientific-program-agenda.ts', import.meta.url), 'utf8')));
const source = compile(readFileSync(new URL('../components/scientific-program.tsx', import.meta.url), 'utf8'));

async function harness(reject = false, deferPatch = false) {
  const slots = []; const effects = []; const calls = [];
  let cursor = 0;
  let eventId = 'e1'; let completePatch;
  const activity = { id: 'a1', title: 'Mesa original', activityType: 'Debate', startAt: '2026-10-10T12:00:00.123Z', endAt: '2026-10-10T13:00:00.456Z', spaceId: 's1', space: { id: 's1', name: 'Sala 1', active: true }, status: 'READY_FOR_REVIEW', participants: [] };
  const payload = { event: { id: 'e1', name: 'Congresso' }, summary: { spaces: 1, activities: 1, blockingConflicts: 0, readyForReview: 1 }, spaces: [activity.space], people: [], taxonomy: [], conflicts: [], activities: [activity], nextAction: 'Revisar' };
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const h = {
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.values?.[name] ?? null; } },
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
        if (deferPatch) await new Promise((resolve) => { completePatch = resolve; });
        return { ...payload, activities: [{ ...activity, ...JSON.parse(options.body), status: 'DRAFT' }], summary: { ...payload.summary, readyForReview: 0 } };
      }
      if (options.method === 'POST' && /\/(publish|unpublish)$/.test(path)) {
        const status = path.endsWith('/publish') ? 'PUBLISHED' : 'READY_FOR_REVIEW';
        return { ...payload, activities: [{ ...activity, status }], summary: { ...payload.summary, published: status === 'PUBLISHED' ? 1 : 0 } };
      }
      return path.includes('/e2/') ? { ...payload, event: { id: 'e2', name: 'Outro evento' } } : payload;
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
    '../lib/scientific-program-agenda': agendaModel,
    'next/link': url('export default "a";'),
    'next/navigation': url('const router={replace(){}}; export const useRouter=()=>router;'),
    './scientific-eva-help': url('export default "aside";'),
    './scientific-program-agenda': url('export default "agenda";'),
    './scientific-program.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
  };
  const transformed = `const {FormData}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/from ['"]([^'"]+)['"]/g, (match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = () => { cursor = 0; return Component({ eventId }); };
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
  const switchEvent = async () => { eventId = 'e2'; render(); while (effects.length) effects.shift()(); await new Promise(setImmediate); return render(); };
  return { render, find, text, button, open, form, calls, switchEvent, completePatch: () => completePatch(), cleanup: () => { delete globalThis[key]; } };
}

test('PATCH atrasado do evento anterior não substitui payload nem aviso do evento atual', async () => {
  const h = await harness(false, true);
  try {
    let tree = h.open();
    h.find(h.form(tree), (node) => node.type === 'input' && node.props.maxLength === 180).props.onChange({ target: { value: 'Título atrasado' } });
    const pending = h.form(h.render()).props.onSubmit({ preventDefault() {} });
    tree = await h.switchEvent();
    assert.match(h.text(tree), /Outro evento/);
    h.completePatch(); await pending;
    tree = h.render();
    assert.match(h.text(tree), /Outro evento/);
    assert.doesNotMatch(h.text(tree), /Título atrasado|Alterações salvas/);
    assert.equal(h.form(tree), null);
  } finally { h.cleanup(); }
});

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

test('ação da agenda abre o mesmo editor e mantém cancelamento sem escrita', async () => {
  const h = await harness();
  try {
    let tree = h.render();
    const agenda = h.find(tree, (node) => node.type === 'agenda');
    const opener = { focus() {} };
    agenda.props.onEdit('a1', opener);
    tree = h.render(); assert.ok(h.form(tree));
    h.button(tree, 'Cancelar').props.onClick(); assert.equal(h.form(h.render()), null);
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

test('vínculo do trabalho aceito grava na atividade sem reabrir o editor', async () => {
  const h = await harness();
  try {
    let tree = h.render();
    assert.match(h.text(tree), /Nenhum trabalho científico vinculado/);
    const form = h.find(tree, (node) => node.type === 'form' && String(node.props['aria-label'] ?? '').startsWith('Vínculo do trabalho científico'));
    await form.props.onSubmit({ preventDefault() {}, currentTarget: { values: { submissionId: 'csubmission001' } } });
    tree = h.render();
    const saved = h.calls.filter((call) => call.method === 'PUT');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].path, '/scientific-events/e1/program/activities/a1/confirmed-work');
    assert.deepEqual(JSON.parse(saved[0].body), { submissionId: 'csubmission001' });
    assert.match(h.text(h.find(tree, (node) => node.props?.role === 'status')), /Trabalho aceito vinculado/);
    assert.equal(h.form(tree), null);
    const again = h.find(h.render(), (node) => node.type === 'form' && String(node.props['aria-label'] ?? '').startsWith('Vínculo do trabalho científico'));
    await again.props.onSubmit({ preventDefault() {}, currentTarget: { values: { submissionId: '' } } });
    assert.deepEqual(JSON.parse(h.calls.filter((call) => call.method === 'PUT')[1].body), { submissionId: null });
  } finally { h.cleanup(); }
});

test('atividade revisada pode ser publicada e retirada da página do evento', async () => {
  const h = await harness();
  try {
    let tree = h.render();
    assert.equal(h.button(tree, 'Marcar como pronta').props.disabled, true);
    await h.button(tree, 'Publicar na página do evento').props.onClick();
    tree = h.render();
    const publish = h.calls.filter((call) => call.method === 'POST');
    assert.equal(publish.at(-1).path, '/scientific-events/e1/program/activities/a1/publish');
    assert.match(h.text(tree), /Publicada na página do evento/);
    assert.match(h.text(h.find(tree, (node) => node.props?.role === 'status')), /convite confirmado/);
    await h.button(tree, 'Retirar da página do evento').props.onClick();
    tree = h.render();
    assert.equal(h.calls.filter((call) => call.method === 'POST').at(-1).path, '/scientific-events/e1/program/activities/a1/unpublish');
    assert.match(h.text(tree), /Pronta para revisão/);
    assert.ok(h.button(tree, 'Publicar na página do evento'));
  } finally { h.cleanup(); }
});
