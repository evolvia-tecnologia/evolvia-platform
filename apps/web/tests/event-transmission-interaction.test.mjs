import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import { transmissionFieldFromApiMessage, transmissionUnavailable } from '../lib/transmission-availability.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const link = { kind: 'LIVE', title: 'Sala principal', url: 'https://video.example.com/sala' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function load(api) {
  const source = readFileSync(new URL('../components/event-transmission.tsx', import.meta.url), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)((name) => {
    if (name === '../lib/api') return { api, ApiError };
    if (name === '../lib/transmission-availability') return { transmissionFieldFromApiMessage, transmissionUnavailable };
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    return require(name);
  }, module, module.exports);
  return module.exports.default;
}
const submit = (tree) => tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
const button = (tree, label) => tree.root.findAllByType('button').find((item) => item.children.join('') === label);
const title = (tree) => tree.root.findAllByType('input').find((item) => item.props.minLength === 2);
async function mount(api, run) {
  const Component = load(api);
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(Component, { eventId: 'evt-qa' })); });
    await run(tree, Component);
  } finally { if (tree) await act(async () => tree.unmount()); }
}

test('leitura pendente bloqueia edição e PUT; link existente é carregado antes de habilitar', async () => {
  const read = deferred(); const writes = [];
  await mount((_path, options) => { if (options?.method) writes.push(options); return read.promise; }, async (tree) => {
    assert.equal(title(tree).props.disabled, true);
    await act(async () => { submit(tree); });
    assert.equal(writes.length, 0);
    await act(async () => { read.resolve({ transmission: link }); });
    assert.equal(title(tree).props.value, link.title);
    assert.equal(title(tree).props.disabled, false);
    const urlInput = tree.root.findByProps({ type: 'url' });
    const pattern = new RegExp(`^(?:${urlInput.props.pattern})$`, 'u');
    assert.equal(pattern.test('https://video.example.com/sala'), true);
    assert.equal(pattern.test('HTTPS://video.example.com/sala'), true);
    assert.equal(pattern.test('http://video.example.com/sala'), false);
    assert.equal(pattern.test('ftp://video.example.com/sala'), false);
  });
});

test('GET falha sem habilitar escrita e recuperação vazia libera configuração', async () => {
  let reads = 0; let writes = 0;
  await mount(async (_path, options) => {
    if (options?.method) { writes++; return {}; }
    if (++reads === 1) throw new Error('Falha de carga');
    return { transmission: null };
  }, async (tree) => {
    assert.match(JSON.stringify(tree.toJSON()), /Falha de carga/);
    await act(async () => { submit(tree); });
    assert.equal(writes, 0);
    await act(async () => { button(tree, 'Recarregar transmissão').props.onClick(); });
    assert.equal(reads, 2);
    assert.equal(title(tree).props.disabled, false);
    assert.equal(title(tree).props.value, '');
  });
});

test('dois submits no mesmo tick e remoção concorrente geram somente um PUT', async () => {
  const write = deferred(); const writes = [];
  await mount(async (_path, options) => {
    if (!options?.method) return { transmission: link };
    writes.push(JSON.parse(options.body)); return write.promise;
  }, async (tree) => {
    const remove = button(tree, 'Remover link').props.onClick;
    await act(async () => { submit(tree); submit(tree); remove(); });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], link);
    assert.equal(title(tree).props.disabled, true);
    await act(async () => { write.resolve({ transmission: link }); });
    assert.match(JSON.stringify(tree.toJSON()), /Link salvo/);
    assert.equal(title(tree).props.disabled, false);
  });
});

test('resposta perdida no PUT exige GET, recupera valor persistido sem repetir escrita', async () => {
  let reads = 0; let writes = 0;
  const updated = { ...link, title: 'Sala atualizada' };
  await mount(async (_path, options) => {
    if (!options?.method) return { transmission: ++reads === 1 ? link : updated };
    writes++; throw new Error('Resposta perdida após commit');
  }, async (tree) => {
    await act(async () => { submit(tree); });
    assert.match(JSON.stringify(tree.toJSON()), /Não foi possível confirmar se o link foi salvo/);
    assert.equal(title(tree).props.disabled, true);
    await act(async () => { submit(tree); });
    assert.equal(writes, 1);
    await act(async () => { button(tree, 'Recarregar transmissão').props.onClick(); });
    assert.equal(reads, 2);
    assert.equal(title(tree).props.value, updated.title);
    assert.equal(title(tree).props.disabled, false);
    assert.equal(writes, 1);
  });
});

test('remoção duplicada e resposta perdida recuperam ausência sem outro PUT', async () => {
  const write = deferred(); let writes = 0; let reads = 0;
  await mount(async (_path, options) => {
    if (!options?.method) return { transmission: ++reads === 1 ? link : null };
    assert.deepEqual(JSON.parse(options.body), { enabled: false });
    writes++; return write.promise;
  }, async (tree) => {
    const remove = button(tree, 'Remover link').props.onClick;
    await act(async () => { remove(); remove(); submit(tree); });
    assert.equal(writes, 1);
    await act(async () => { write.reject(new Error('Resposta perdida')); });
    assert.match(JSON.stringify(tree.toJSON()), /Não foi possível confirmar se o link foi removido/);
    assert.equal(title(tree).props.disabled, true);
    await act(async () => { button(tree, 'Recarregar transmissão').props.onClick(); });
    assert.equal(title(tree).props.value, '');
    assert.equal(button(tree, 'Remover link'), undefined);
    assert.equal(writes, 1);
  });
});

test('evento presencial explica a indisponibilidade e não oferece salvar', async () => {
  await mount(async () => {
    throw new Error('Transmissão disponível somente para eventos online ou híbridos. Altere o formato na Fundação do evento.');
  }, async (tree) => {
    const view = JSON.stringify(tree.toJSON());
    assert.match(view, /somente para eventos online ou híbridos/u);
    assert.match(view, /\/eventos\/evt-qa\/configuracao/u);
    assert.equal(tree.root.findAllByType('form').length, 0);
    assert.equal(button(tree, 'Salvar transmissão'), undefined);
    assert.equal(button(tree, 'Remover link'), undefined);
  });
});

test('validação recusada mantém mensagem útil e permite corrigir sem recarregar', async () => {
  await mount(async (_path, options) => {
    if (!options?.method) return { transmission: null };
    throw new ApiError('Informe um link https.', 400);
  }, async (tree) => {
    await act(async () => { submit(tree); });
    assert.match(JSON.stringify(tree.toJSON()), /Informe um link https/);
    assert.equal(title(tree).props.disabled, false);
    assert.equal(title(tree).props.value, '');
    assert.equal(tree.root.findByProps({ type: 'url' }).props['aria-invalid'], true);
  });
});

test('trocar evento descarta GET tardio do anterior e não transporta o link', async () => {
  const oldRead = deferred(); const paths = [];
  await mount(async (path) => {
    paths.push(path);
    return path.includes('outro-evento') ? { transmission: null } : oldRead.promise;
  }, async (tree, Component) => {
    await act(async () => { tree.update(React.createElement(Component, { eventId: 'outro-evento' })); });
    await act(async () => { oldRead.resolve({ transmission: link }); });
    assert.equal(title(tree).props.value, '');
    assert.equal(title(tree).props.disabled, false);
    assert.deepEqual(paths, ['/events/evt-qa/transmission', '/events/outro-evento/transmission']);
  });
});
