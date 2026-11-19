import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const bridge = dataUrl('export const api = (...args) => globalThis.__kitReportApi(...args); export const getToken = () => null; export class ApiError extends Error {}');
const styles = dataUrl('export default new Proxy({}, {get: (_, key) => key});');
const stock = dataUrl('export const StockTable = () => null;');
const compiled = ts.transpileModule(readFileSync(new URL('../components/kit-report.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(
  name === '../lib/api' ? bridge : name === './kit-stock-panel' ? stock : name.endsWith('.css') ? styles : pathToFileURL(require.resolve(name)).href,
));
const { default: Report } = await import(dataUrl(compiled));
const report = name => ({ kit: { sizes: [] }, sizes: [], page: 1, pageSize: 25, total: 1, items: [{ protocol: name, name, requestedSizeLabel: 'M', deliveredSizeLabel: 'M', situation: 'ENTREGUE', at: null }] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const exportButton = renderer => renderer.root.findAllByType('button').find(n => n.children.join('').includes('Export'));
async function mount(api) {
  globalThis.__kitReportApi = api;
  const props = { eventId: 'A', organizer: true };
  let renderer;
  await act(async () => { renderer = create(React.createElement(Report, props)); });
  return { renderer, props };
}
async function close(renderer) { await act(async () => renderer.unmount()); delete globalThis.__kitReportApi; }

test('consulta de outro evento falha sem conservar nomes antigos ou permitir exportação', async () => {
  const { renderer, props } = await mount(async url => {
    if (url.includes('/A/')) return report('Nome exclusivo A');
    throw new Error('internal-secret');
  });
  try {
    await act(async () => renderer.update(React.createElement(Report, { ...props, eventId: 'B' })));
    assert.equal(renderer.root.findAllByType('table').length, 0);
    assert.equal(JSON.stringify(renderer.toJSON()).includes('Nome exclusivo A'), false);
    assert.equal(JSON.stringify(renderer.toJSON()).includes('internal-secret'), false);
    assert.equal(exportButton(renderer).props.disabled, true);
  } finally { await close(renderer); }
});

test('CSV tardio é descartado após troca de evento ou perda do papel organizador', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  try {
    for (const nextProps of [{ eventId: 'B', organizer: true }, { eventId: 'A', organizer: false }]) {
      const pending = deferred();
      let documents = 0;
      globalThis.fetch = () => pending.promise;
      globalThis.document = { createElement() { documents++; throw new Error('CSV indevido'); } };
      const { renderer, props } = await mount(async url => report(url.includes('/A/') ? 'A' : 'B'));
      try {
        await act(async () => exportButton(renderer).props.onClick());
        await act(async () => renderer.update(React.createElement(Report, { ...props, ...nextProps })));
        await act(async () => pending.resolve({ ok: true, blob: async () => new Blob(['csv']) }));
        assert.equal(documents, 0);
      } finally { await close(renderer); }
    }
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument; }
});

test('CSV atual anexa âncora antes do clique e libera âncora e URL', async () => {
  const originals = { fetch: globalThis.fetch, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const steps = [];
  const anchor = { click() { steps.push('click'); }, remove() { steps.push('remove'); } };
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['csv']) });
  globalThis.document = { createElement: () => anchor, body: { appendChild(value) { assert.equal(value, anchor); steps.push('append'); } } };
  URL.createObjectURL = () => 'blob:kit';
  URL.revokeObjectURL = value => { assert.equal(value, 'blob:kit'); steps.push('revoke'); };
  const { renderer } = await mount(async () => report('A'));
  try {
    await act(async () => exportButton(renderer).props.onClick());
    assert.deepEqual(steps, ['append', 'click', 'remove', 'revoke']);
  } finally {
    await close(renderer);
    globalThis.fetch = originals.fetch; globalThis.document = originals.document;
    URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke;
  }
});
