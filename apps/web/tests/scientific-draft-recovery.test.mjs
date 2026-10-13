import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const panel = await readFile(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8');
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const all = (node, predicate, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((item) => all(item, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  return all(node.props?.children, predicate, found);
};
const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
const button = (tree, label) => all(tree, (node) => node.type === 'button' && text(node) === label)[0];
const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const operation of ['draft', 'submit']) {
  for (const failure of ['network', 'http', 'malformed', 'stale-target']) {
    test(`${operation}: gravação confirmada e consulta ${failure} permitem recuperar sem repetir POST`, async () => {
      const draft = { id: 'cdraft0000001', title: 'Pesquisa preservada', abstractText: 'Resumo', keywords: ['alfa'], status: 'DRAFT',
        submittedAt: null, modality: 'Oral', modalityId: 'cmodality0001', currentVersion: 0, hasEposter: false,
        authors: [{ name: 'Ana', email: 'ana@example.test', institution: 'Instituto', sortOrder: 1, presenter: true, isSubmitter: true }] };
      const area = { available: true, reason: null, taxonomy: [], modalities: [{ id: 'cmodality0001', name: 'Oral' }],
        config: { collectTypedAbstract: true, abstractCounterUnit: 'CHARACTERS', abstractMin: 1, abstractMax: 2000, titleMaxLength: 180,
          minKeywords: 1, maxKeywords: 5, maxSubmissionsPerAuthor: 2, minAuthors: 1, maxAuthors: 3, maxPresenters: 1,
          requirePresenter: true, presentationFormats: [], acceptedWorkUploadEnabled: false }, submissions: [draft] };
      const slots = []; let cursor = 0;
      const state = (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = index === 0 ? area : initial;
        return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; };
      const key = `recovery${Math.random().toString(36).slice(2)}`;
      globalThis[key] = { useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => { cursor++; } };
      const modules = { react: url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`),
        'react/jsx-runtime': url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
        './participant-area.module.css': url('export default new Proxy({}, {get:(_,name)=>name});'),
        './public-rich-text': url('export default function PublicRichText(){return null;}') };
      const calls = []; const originalFetch = globalThis.fetch; let reads = 0; let finishRetry;
      globalThis.fetch = async (path, options = {}) => {
        calls.push({ path, method: options.method ?? 'GET' });
        if (options.method === 'POST') return Response.json({ id: draft.id, status: operation === 'draft' ? 'DRAFT' : 'SUBMITTED', currentVersion: 1 });
        reads++;
        if (reads === 1) {
          if (failure === 'network') throw new Error('offline');
          return Response.json(failure === 'malformed' ? {} : { message: 'unavailable' }, { status: failure === 'http' ? 503 : 200 });
        }
        return new Promise((resolve) => { finishRetry = () => resolve(Response.json({ ...area, submissions: [{ ...draft, status: operation === 'draft' ? 'DRAFT' : 'SUBMITTED' }] })); });
      };
      try {
        const source = ts.transpileModule(panel, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
        const { default: Panel } = await import(url(source.replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`)));
        const render = () => { cursor = 0; return Panel({ slug: 'congresso', token: 'opaque-test-token' }); };
        button(render(), 'Continuar rascunho').props.onClick();
        let tree = render();
        const staleClear = button(tree, 'Limpar formulário').props.onClick;
        if (operation === 'draft') button(tree, 'Salvar rascunho').props.onClick();
        else all(tree, (node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {}, currentTarget: {} });
        await flush(); await flush();
        tree = render();
        assert.match(text(tree), /gravação foi confirmada/u);
        assert.equal(button(tree, 'Submeter trabalho')?.props.disabled, true);
        assert.equal(button(tree, 'Salvar rascunho')?.props.disabled, true);
        const retry = button(tree, 'Atualizar meus trabalhos');
        assert.ok(retry);
        retry.props.onClick(); retry.props.onClick();
        assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
        assert.equal(calls.filter((call) => call.method === 'GET').length, 2, 'clique duplo não duplica a consulta');
        if (failure === 'stale-target') {
          // A handler captured before busy changed can invalidate the form during the GET.
          staleClear();
          finishRetry(); await flush(); await flush();
          tree = render();
          const nextRetry = button(tree, 'Atualizar meus trabalhos');
          assert.ok(nextRetry, 'resposta obsoleta não altera a lista');
          assert.equal(nextRetry.props.disabled, false, 'busy e lock liberados no mesmo contexto');
          nextRetry.props.onClick();
          assert.equal(calls.filter((call) => call.method === 'GET').length, 3, 'nova recuperação continua possível');
        }
        finishRetry(); await flush(); await flush();
        tree = render();
        assert.equal(button(tree, 'Atualizar meus trabalhos'), undefined);
        assert.equal(all(tree, (node) => node.props?.role === 'alert').length, 0);
        assert.equal(button(tree, 'Submeter trabalho')?.props.disabled, false);
        assert.match(text(tree), /Pesquisa preservada/u);
        assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
      } finally { globalThis.fetch = originalFetch; delete globalThis[key]; }
    });
  }
}
