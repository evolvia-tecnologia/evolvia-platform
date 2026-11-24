import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadPanel(api) {
  const filename = fileURLToPath(new URL('../components/event-communication-batches.tsx', import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const compiled = new Module(filename);
  compiled.require = name => {
    if (name === '../lib/api') return { api };
    if (name === '../lib/event-communication-draft') return { communicationDraftId: () => crypto.randomUUID() };
    if (name.endsWith('.css')) return { default: {} };
    return require(name);
  };
  compiled._compile(source, filename);
  return compiled.exports.default;
}

test('prepara só a versão conferida e reutiliza a chave após resposta perdida', async t => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const Component = loadPanel(async (path, options) => {
    if (!options) return { batches: [], sendingAvailable: false };
    requests.push({ path, body: JSON.parse(options.body) });
    if (requests.length === 1) throw Error('Resposta indisponível');
  });
  const props = { eventId: 'evento-A', draft: { id: 'draft', revision: 3, subject: 'Aviso' },
    filters: { categoryIds: ['b','a'], payment: 'PAID', filterMode: 'OR' } };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); });
  t.after(() => act(async () => tree.unmount()));
  const prepare = () => tree.root.findAllByType('button').find(b => b.children.includes('Preparar lote'));
  await act(async () => prepare().props.onClick());
  await act(async () => prepare().props.onClick());
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].path, '/events/evento-A/communication/batches');
  assert.deepEqual(requests[0].body.filters, { categoryIds: ['a','b'], payment: 'PAID',
    audience: 'CONFIRMED_REGISTRATIONS', filterMode: 'OR' });
  assert.equal(requests[0].body.draftRevision, 3);
  await act(async () => tree.update(React.createElement(Component, { ...props, draft: null })));
  assert.equal(prepare().props.disabled, true);
});

test('histórico só oferece autorização se o backend habilitar e o lote estiver preparado', async t => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const batch = { id: 'lote', draftId: 'd', draftRevision: 4, status: 'PREPARED', recipientCount: 2,
    receivedCount: 0, createdAt: '2026-11-24T00:00:00Z' };
  let enabled = false;
  const Component = loadPanel(async (path, options) => {
    if (!options) return { batches: [batch], sendingAvailable: enabled };
    requests.push(path);
    batch.status = 'SENDING';
  });
  const prior = globalThis.window;
  globalThis.window = { confirm: () => false };
  t.after(() => { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; });
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component, { eventId: 'evento-B', history: true })); });
  t.after(() => act(async () => tree.unmount()));
  const button = name => tree.root.findAllByType('button').find(b => b.children.includes(name));
  assert.ok(button('Cancelar lote'));
  assert.equal(button('Autorizar envio'), undefined);
  enabled = true;
  await act(async () => button('Atualizar histórico').props.onClick());
  await act(async () => button('Autorizar envio').props.onClick());
  assert.equal(requests.length, 0);
  globalThis.window.confirm = () => true;
  await act(async () => button('Autorizar envio').props.onClick());
  assert.deepEqual(requests, ['/events/evento-B/communication/batches/lote/start']);
  assert.equal(button('Autorizar envio'), undefined);
  assert.equal(button('Cancelar lote'), undefined);
});
