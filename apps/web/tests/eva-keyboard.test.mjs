import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const cache = new Map();

function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', output)((name) => {
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    if (name.startsWith('.')) return load(`${resolve(dirname(path), name)}.ts`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const directory = fileURLToPath(new URL('../components/', import.meta.url));
const PublicEvaSupport = load(resolve(directory, 'public-eva-support.tsx')).default;
const ScientificEvaHelp = load(resolve(directory, 'scientific-eva-help.tsx')).default;
const label = (node) => node.children.filter((child) => typeof child === 'string').join('');

function press(node, key) {
  let prevented = false;
  act(() => {
    node.props.onKeyDown({
      key,
      preventDefault() { prevented = true; },
      currentTarget: { querySelectorAll: () => [] },
    });
  });
  return prevented;
}

const publicEvent = {
  eventName: 'Congresso teste',
  eventType: 'Congresso',
  profileCode: 'SCIENTIFIC_EVENT',
  estimatedAudience: 800,
  format: 'HYBRID',
  startDate: '2026-12-12T12:00:00.000Z',
  endDate: '2026-12-14T12:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  venue: 'Centro de Convenções Rebouças',
  accessibilitySummary: null,
  publicContactEmail: 'contato@exemplo.test',
  publicContactPhone: null,
};

test('a EVA pública percorre as dúvidas do evento com setas, Home e End', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(PublicEvaSupport, publicEvent)); });
  const group = () => tree.root.findByProps({ 'aria-label': 'Dúvidas que a EVA pode orientar' });
  const pressed = () => group().findAllByType('button').filter((button) => button.props['aria-pressed']);
  assert.equal(group().findAllByType('button').length, 6);
  assert.equal(pressed().length, 0);
  assert.equal(press(group(), 'ArrowDown'), true);
  assert.equal(label(pressed()[0]), 'Que tipo de evento é?');
  assert.match(JSON.stringify(tree.toJSON()), /Tipo e público estimado/);
  assert.equal(press(group(), 'ArrowRight'), true);
  assert.equal(label(pressed()[0]), 'Quando acontece?');
  assert.equal(press(group(), 'End'), true);
  assert.equal(label(pressed()[0]), 'Como falar com a organização?');
  assert.match(JSON.stringify(tree.toJSON()), /Contato oficial do evento/);
  assert.equal(press(group(), 'ArrowUp'), true);
  assert.equal(label(pressed()[0]), 'Há informações de acessibilidade?');
  assert.equal(press(group(), 'Home'), true);
  assert.equal(label(pressed()[0]), 'Que tipo de evento é?');
  assert.equal(press(group(), 'Tab'), false);
  await act(async () => tree.unmount());
});

test('a ajuda do painel abre, responde e fecha pelo teclado', async () => {
  const listeners = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  let tree;
  try {
    await act(async () => {
      tree = create(React.createElement(ScientificEvaHelp, {
        context: 'Visão geral do evento',
        intro: 'Posso indicar o que esta visão geral organiza.',
        questions: [
          { question: 'Por onde eu começo?', answer: 'Use os cartões desta tela.' },
          { question: 'Esta tela publica o evento?', answer: 'Não. A visão geral só orienta.' },
        ],
      }));
    });
    const trigger = () => tree.root.findByProps({ 'aria-label': 'Precisa de ajuda? Pergunte sobre esta etapa' });
    assert.equal(trigger().props['aria-expanded'], false);
    await act(async () => { trigger().props.onClick(); });
    assert.equal(trigger().props['aria-expanded'], true);
    const dialog = tree.root.findByProps({ role: 'dialog' });
    assert.equal(dialog.props['aria-label'], 'Ajuda da EVA — Visão geral do evento');
    const group = tree.root.findByProps({ 'aria-label': 'Dúvidas comuns nesta etapa' });
    assert.equal(press(group, 'ArrowDown'), true);
    const pressed = () => group.findAllByType('button').filter((button) => button.props['aria-pressed']);
    assert.equal(label(pressed()[0]), 'Por onde eu começo?');
    assert.match(JSON.stringify(tree.toJSON()), /Use os cartões desta tela/);
    assert.equal(press(group, 'End'), true);
    assert.equal(label(pressed()[0]), 'Esta tela publica o evento?');
    let prevented = false;
    await act(async () => { listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } }); });
    assert.equal(prevented, true);
    assert.equal(trigger().props['aria-expanded'], false);
    assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
