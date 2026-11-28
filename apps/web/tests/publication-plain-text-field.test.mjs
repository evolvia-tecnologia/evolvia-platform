import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import ts from 'typescript';

const filename = fileURLToPath(new URL('../components/publication-plain-text-field.tsx', import.meta.url));
const compiled = new Module(filename);
const require = createRequire(import.meta.url);
compiled.require = name => name.endsWith('.css') ? { default: {} } : require(name);
compiled._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText, filename);
const Field = compiled.exports.default;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const [id, maxLength, rows] of [
  ['shortDescription', 280, 3], ['accessibilitySummary', 4000, 5],
  ['seoTitle', 120, undefined], ['seoDescription', 320, 3],
  ['guest-invitation-subject', undefined, undefined], ['guest-invitation-body', undefined, 7],
  ['guest-mini-bio', undefined, 3], ['guest-accessibility-notes', undefined, 3],
  ['guest-technical-notes', undefined, 3], ['media-alt', 300, undefined],
]) {
  test('texto simples mantém o valor e as referências acessíveis de ' + id, async t => {
    const props = { id, label: 'Descrição', value: 'A & B', maxLength, rows,
      disabled: false, required: true, help: 'Ajuda', error: 'Revisar' };
    let tree;
    let saved;
    const render = value => React.createElement(Field, { ...props, value, onChange: next => { saved = next; } });
    await act(async () => { tree = create(render(props.value)); });
    t.after(() => act(async () => tree.unmount()));
    const tag = rows ? 'textarea' : 'input';
    const control = tree.root.findByType(tag);
    assert.equal(control.props.rows, rows);
    assert.equal(control.props.maxLength, maxLength);
    assert.equal(control.props.required, true);
    assert.equal(tree.root.findByType('label').props.htmlFor, id);
    for (const ref of control.props['aria-describedby'].split(' ')) {
      assert.equal(tree.root.findAllByProps({ id: ref }).length, 1);
    }
    assert.equal(control.props['aria-invalid'], true);
    const literal = 'Olá {NOME}, participe de {EVENTO} como {FUNCAO}. A & B **texto** <b>literal</b>';
    control.props.onChange({ target: { value: literal } });
    assert.equal(saved, literal);
    props.disabled = true;
    props.error = undefined;
    await act(async () => tree.update(render(saved)));
    assert.equal(control.props.disabled, true);
    assert.equal(control.props.value, literal);
    assert.equal(control.props['aria-invalid'], false);
    assert.equal(tree.root.findAllByType('b').length, 0);
    assert.equal(tree.root.findByProps({ id: id + '-count' }).children.join(''), maxLength === undefined ? literal.length + ' caracteres' : literal.length + ' de ' + maxLength + ' caracteres');
  });
}
