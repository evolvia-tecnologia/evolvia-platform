import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = ts.transpileModule(readFileSync(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function harness({ readFailure = false, rejectUpload = false } = {}) {
  const slots = []; const calls = []; const readers = []; let cursor = 0;
  const payload = {
    available: false, reason: 'Submissões encerradas', taxonomy: [], modalities: [],
    config: { acceptedWorkUploadEnabled: true, presentationFormats: [] },
    submissions: [{ id: 'csubmission001', title: 'Pesquisa', status: 'ACCEPTED', modality: 'Pôster', currentVersion: 1, presentationFormatCode: 'EPOSTER', hasEposter: false, authors: [] }],
  };
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0 ? payload : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  class File { size = 12; name = 'poster.pdf'; }
  class FormData { get() { return new File(); } }
  class FileReader {
    result = 'data:application/pdf;base64,JVBERi0xLjQ=';
    readAsDataURL() { readers.push(this); }
  }
  let completeUpload;
  const h = {
    useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => { cursor++; },
    File, FormData, FileReader,
    fetch: (path, options) => {
      calls.push({ path, ...options });
      return new Promise((resolve) => { completeUpload = () => resolve({ ok: !rejectUpload, json: async () => rejectUpload ? { message: 'Envio recusado' } : { hasEposter: true } }); });
    },
  };
  const key = `eposterHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = h;
  const react = url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,key)=>key});');
  const modules = { react, 'react/jsx-runtime': jsx, './participant-area.module.css': css };
  const transformed = `const {fetch,File,FormData,FileReader}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/from ['"]([^'"]+)['"]/g, (match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = () => { cursor = 0; return Component({ slug: 'congresso', token: 'opaque-test-token' }); };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
  const form = (tree) => find(tree, (node) => node.type === 'form');
  const submit = (node) => node.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  const finishRead = () => { if (readFailure) readers[0].onerror(); else readers[0].onload(); };
  return { render, find, text, form, submit, calls, readers, finishRead, finishUpload: () => completeUpload(), cleanup: () => { delete globalThis[key]; } };
}

test('duplo envio é bloqueado imediatamente e controles ficam indisponíveis até concluir', async () => {
  const h = await harness();
  try {
    const form = h.form(h.render());
    h.submit(form); h.submit(form);
    assert.equal(h.readers.length, 1);
    let tree = h.render();
    assert.equal(h.find(tree, (node) => node.type === 'input' && node.props.name === 'eposter').props.disabled, true);
    assert.equal(h.find(h.form(tree), (node) => node.type === 'button').props.disabled, true);
    h.finishRead(); await new Promise(setImmediate);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].path, '/api/public/events/congresso/participant/submissions/csubmission001/eposter');
    h.finishUpload(); await new Promise(setImmediate);
    tree = h.render();
    assert.equal(h.find(h.form(tree), (node) => node.type === 'button').props.disabled, false);
    assert.match(h.text(tree), /Substituir ePoster/);
  } finally { h.cleanup(); }
});

for (const options of [{ readFailure: true }, { rejectUpload: true }]) {
  test(options.readFailure ? 'erro de leitura libera nova tentativa sem POST' : 'recusa da API libera nova tentativa e mostra erro', async () => {
    const h = await harness(options);
    try {
      h.submit(h.form(h.render())); h.finishRead(); await new Promise(setImmediate);
      if (!options.readFailure) { h.finishUpload(); await new Promise(setImmediate); }
      const tree = h.render();
      assert.equal(h.calls.length, options.readFailure ? 0 : 1);
      assert.match(h.text(h.find(tree, (node) => node.props?.role === 'alert')), options.readFailure ? /ler o PDF/ : /Envio recusado/);
      assert.equal(h.find(h.form(tree), (node) => node.type === 'button').props.disabled, false);
      h.submit(h.form(tree));
      assert.equal(h.readers.length, 2);
    } finally { h.cleanup(); }
  });
}
