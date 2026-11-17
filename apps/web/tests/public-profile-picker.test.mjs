import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const catalog = await import('../lib/event-profile-catalog.ts');

function load() {
  const source = readFileSync(new URL('../components/public-profile-picker.tsx', import.meta.url), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)((name) => {
    if (name.includes('event-profile-catalog')) return catalog;
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    return require(name);
  }, module, module.exports);
  return module.exports.default;
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node?.root && typeof node.toJSON === 'function') return text(node.toJSON());
  if (Array.isArray(node)) return node.map(text).join('');
  if (Array.isArray(node?.children)) return node.children.map(text).join('');
  if (node?.children != null) return text(node.children);
  return '';
}
const buttons = (tree) => tree.root.findAllByType('button');

test('a home mostra as famílias antes dos 20 tipos', async () => {
  const Picker = load();
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { selectedEventType: '', onChoose() {} })); });
  const rendered = text(tree);
  assert.match(rendered, /Científicos e acadêmicos/);
  assert.match(rendered, /Feiras e exposições/);
  assert.equal(buttons(tree).length, catalog.EVENT_PROFILE_GROUPS.length);
  assert.doesNotMatch(rendered, /Congresso/);
  assert.doesNotMatch(rendered, /Corrida/);
  assert.match(rendered, /Escolha a família mais próxima/);
  assert.doesNotMatch(rendered, /Wizard/);
  await act(async () => tree.unmount());
});

test('a família escolhida revela só os seus tipos e devolve a escolha', async () => {
  const Picker = load();
  const chosen = [];
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { selectedEventType: '', onChoose(value) { chosen.push(value); } })); });
  const scientific = buttons(tree).find((button) => text(button).includes('Científicos e acadêmicos'));
  await act(async () => { scientific.props.onClick(); });
  const opened = text(tree);
  assert.match(opened, /Congresso/);
  assert.match(opened, /Voltar às famílias/);
  assert.doesNotMatch(opened, /Feiras e exposições/);
  const congress = buttons(tree).find((button) => text(button).includes('Congresso'));
  assert.equal(congress.props['aria-pressed'], false);
  await act(async () => { congress.props.onClick(); });
  assert.deepEqual(chosen, ['Congresso ou evento científico']);
  await act(async () => tree.unmount());
});

test('voltar às famílias permanece até o tipo gravado mudar', async () => {
  const Picker = load();
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { selectedEventType: 'Corrida', onChoose() {} })); });
  const back = buttons(tree).find((button) => text(button).includes('Voltar às famílias'));
  await act(async () => { back.props.onClick(); });
  assert.match(text(tree), /Feiras e exposições/);
  assert.doesNotMatch(text(tree), /Congresso/);
  await act(async () => {
    tree.update(React.createElement(Picker, { selectedEventType: 'Congresso ou evento científico', onChoose() {} }));
  });
  assert.match(text(tree), /Congresso/);
  assert.doesNotMatch(text(tree), /Feiras e exposições/);
  await act(async () => tree.unmount());
});

test('um tipo já gravado abre a família certa com o botão pressionado', async () => {
  const Picker = load();
  let tree;
  await act(async () => { tree = create(React.createElement(Picker, { selectedEventType: 'Corrida', onChoose() {} })); });
  const rendered = text(tree);
  assert.match(rendered, /Comunidades, causas e esportes/);
  assert.match(rendered, /Perfil inicial escolhido: Corrida/);
  assert.match(rendered, /criação do evento/);
  assert.doesNotMatch(rendered, /Feiras e exposições/);
  const corrida = buttons(tree).find((button) => button.props['aria-pressed'] === true);
  assert.match(text(corrida), /Corrida/);
  await act(async () => tree.unmount());
});
