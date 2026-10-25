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
const bridge = dataUrl('export const api = (...args) => globalThis.__kitStateApi(...args);');
const styles = dataUrl('export default new Proxy({}, {get: (_, key) => key});');
const compiled = ts.transpileModule(readFileSync(new URL('../components/kit-stock-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(
  name === '../lib/api' ? bridge : name.endsWith('.css') ? styles : pathToFileURL(require.resolve(name)).href,
));
const { default: Panel } = await import(dataUrl(compiled));
const kit = name => ({ name, shirtsEnabled: true, sizes: [{ id: 'size-test', label: 'M', forecast: 10, delivered: 0, available: 10 }] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function mount(api) {
  const changes = [], errors = [], saved = [];
  const props = { eventId: 'A', organizer: true, onChange: k => changes.push(k.name), onError: e => errors.push(e), onSaved: e => saved.push(e) };
  globalThis.__kitStateApi = api;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Panel, props)); });
  return { renderer, props, changes, errors, saved };
}
async function close(renderer) { await act(async () => renderer.unmount()); delete globalThis.__kitStateApi; }
const submit = renderer => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
const name = renderer => renderer.root.findAllByType('input').find(n => n.props.maxLength === 80).props.value;

test('troca de evento oculta o kit anterior e impede POST antes da leitura do novo', async () => {
  const pending = deferred(), writes = [];
  const { renderer, props } = await mount(async (url, options) => {
    if (options) { writes.push(url); return kit('Gravado'); }
    return url.includes('/A/') ? kit('Kit A') : pending.promise;
  });
  try {
    await act(async () => renderer.update(React.createElement(Panel, { ...props, eventId: 'B' })));
    assert.equal(renderer.root.findByType('fieldset').props.hidden, true);
    assert.equal(renderer.root.findByType('fieldset').props.disabled, true);
    assert.equal(name(renderer), '');
    await act(async () => submit(renderer));
    assert.equal(writes.length, 0);
    await act(async () => pending.resolve(kit('Kit B')));
    assert.equal(name(renderer), 'Kit B');
    assert.equal(renderer.root.findByType('fieldset').props.disabled, false);
  } finally { await close(renderer); }
});

test('gravação tardia de A não substitui kit B nem publica callbacks de sucesso antigos', async () => {
  const pending = deferred();
  const { renderer, props, changes, saved } = await mount(async (url, options) => options
    ? pending.promise : kit(url.includes('/A/') ? 'Kit A' : 'Kit B'));
  try {
    await act(async () => submit(renderer));
    await act(async () => renderer.update(React.createElement(Panel, { ...props, eventId: 'B' })));
    await act(async () => pending.resolve(kit('Resposta antiga A')));
    assert.equal(name(renderer), 'Kit B');
    assert.deepEqual(changes, ['Kit A', 'Kit B']);
    assert.equal(saved.length, 0);
    assert.equal(renderer.root.findByType('fieldset').props.disabled, false);
  } finally { await close(renderer); }
});

test('falha na consulta mantém escrita bloqueada e não revela erro remoto', async () => {
  let writes = 0;
  const { renderer, errors } = await mount(async (_, options) => {
    if (options) writes++;
    throw new Error('internal-secret');
  });
  try {
    await act(async () => submit(renderer));
    assert.equal(writes, 0);
    assert.equal(renderer.root.findByType('fieldset').props.disabled, true);
    assert.deepEqual(errors, ['Não foi possível abrir o kit.']);
  } finally { await close(renderer); }
});
