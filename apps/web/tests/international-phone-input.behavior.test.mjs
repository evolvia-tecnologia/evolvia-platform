import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

// Compile the actual component and helper; only the presentation-only CSS loader
// is replaced. React state/effects and the controlled parent run normally.
const require = createRequire(import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), 'evolvia-phone-behavior-'));
mkdirSync(join(temporary, 'components'));
mkdirSync(join(temporary, 'lib'));
symlinkSync(dirname(dirname(require.resolve('react/package.json'))), join(temporary, 'node_modules'), 'dir');
const componentSource = readFileSync(new URL('../components/international-phone-input.tsx', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../lib/registration-input.ts', import.meta.url), 'utf8');
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
for (const [path, source] of [['components/international-phone-input.js', componentSource], ['lib/registration-input.js', helperSource]]) {
  writeFileSync(join(temporary, path), ts.transpileModule(source, { compilerOptions }).outputText);
}
writeFileSync(join(temporary, 'components/international-phone-input.module.css'), '');
const previousCssLoader = require.extensions['.css'];
require.extensions['.css'] = (module) => { module.exports = {}; };
const PhoneInput = require(join(temporary, 'components/international-phone-input.js')).default;
if (previousCssLoader) require.extensions['.css'] = previousCssLoader;
else delete require.extensions['.css'];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => rmSync(temporary, { recursive: true, force: true }));

async function mount(value, extra = {}) {
  let renderer;
  let current = value;
  function Parent() {
    const [phone, setPhone] = useState(value);
    return React.createElement(PhoneInput, { label: 'Celular / WhatsApp', value: phone, onChange(next) { current = next; setPhone(next); }, ...extra });
  }
  await act(async () => { renderer = create(React.createElement(Parent)); });
  return {
    input: (autoComplete) => renderer.root.findByProps({ autoComplete }),
    root: () => renderer.root,
    value: () => current,
    change: async (autoComplete, next) => { await act(async () => { renderer.root.findByProps({ autoComplete }).props.onChange({ target: { value: next } }); }); },
    blur: async (autoComplete) => { await act(async () => { renderer.root.findByProps({ autoComplete }).props.onBlur(); }); },
    close: async () => { await act(async () => renderer.unmount()); },
  };
}

test('prefilled +1 exposes an editable area code and subscriber number', async () => {
  const phone = await mount('+14155552671');
  try {
    assert.equal(phone.input('tel-area-code').props.value, '415');
    assert.equal(phone.input('tel-national').props.value, '5552671');
    await phone.change('tel-area-code', '202');
    assert.equal(phone.value(), '+12025552671');
    await phone.change('tel-national', '5550123');
    assert.equal(phone.value(), '+12025550123');
  } finally { await phone.close(); }
});

test('changing DDI resegments every national digit without hidden area data', async () => {
  const phone = await mount('+5511999999999');
  try {
    await phone.change('tel-country-code', '+1');
    assert.equal(phone.input('tel-area-code').props.value, '119');
    assert.equal(phone.input('tel-national').props.value, '99999999');
    assert.equal(phone.value(), '+111999999999');
    await phone.change('tel-country-code', '+44');
    assert.equal(phone.root().findAllByProps({ autoComplete: 'tel-area-code' }).length, 0);
    assert.equal(phone.input('tel-national').props.value, '11999999999');
    assert.equal(phone.value(), '+4411999999999');
    await phone.change('tel-country-code', '+55');
    assert.equal(phone.input('tel-area-code').props.value, '11');
    assert.equal(phone.input('tel-national').props.value, '999999999');
    assert.equal(phone.value(), '+5511999999999');
  } finally { await phone.close(); }
});

test('pasting a complete +1 national number replaces area instead of duplicating it', async () => {
  const phone = await mount('+12025550123');
  try {
    await phone.change('tel-national', '(415) 555-2671');
    assert.equal(phone.input('tel-area-code').props.value, '415');
    assert.equal(phone.input('tel-national').props.value, '5552671');
    assert.equal(phone.value(), '+14155552671');
  } finally { await phone.close(); }
});

test('pasting complete international numbers updates all visible fields', async () => {
  const phone = await mount('');
  try {
    await phone.change('tel-national', '+1 (415) 555-2671');
    assert.equal(phone.input('tel-country-code').props.value, '+1');
    assert.equal(phone.input('tel-area-code').props.value, '415');
    assert.equal(phone.input('tel-national').props.value, '5552671');
    await phone.change('tel-national', '+351 912345678');
    assert.equal(phone.input('tel-country-code').props.value, '+351');
    assert.equal(phone.input('tel-national').props.value, '912345678');
    assert.equal(phone.value(), '+351912345678');
  } finally { await phone.close(); }
});

test('Brazil keeps DDD and national paste behavior', async () => {
  const phone = await mount('+5511999999999');
  try {
    await phone.change('tel-national', '(21) 98888-7777');
    assert.equal(phone.input('tel-area-code').props.value, '21');
    assert.equal(phone.input('tel-national').props.value, '988887777');
    assert.equal(phone.value(), '+5521988887777');
  } finally { await phone.close(); }
});

test('required/disabled attributes and validation feedback remain connected', async () => {
  const phone = await mount('+1415555', { required: true, disabled: true });
  try {
    assert.equal(phone.root().findByType('fieldset').props.disabled, true);
    for (const field of ['tel-country-code', 'tel-area-code', 'tel-national']) assert.equal(phone.input(field).props.required, true);
    assert.equal(phone.input('tel-area-code').props.pattern, '[2-9][0-9]{2}');
    assert.equal(phone.input('tel-national').props.pattern, '[2-9][0-9]{6}');
    await phone.blur('tel-national');
    assert.equal(phone.input('tel-national').props['aria-invalid'], true);
    const alert = phone.root().findByProps({ role: 'alert' });
    assert.match(alert.children.join(''), /código de área/u);
    assert.ok(phone.root().findByType('fieldset').props['aria-describedby'].includes(alert.props.id));
  } finally { await phone.close(); }
});
