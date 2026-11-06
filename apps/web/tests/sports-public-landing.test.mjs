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
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const bundled = ['sports-public-profile', 'sports-athlete-and-kits', 'sports-public-catalog']
  .map((name) => readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8').replace(/^import .*$/gmu, ''))
  .join('\n');
const libs = dataUrl(ts.transpileModule(bundled, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const styles = dataUrl('export default new Proxy({}, {get: (_, key) => key});');
globalThis.React = React;
const link = dataUrl('export default function Link(props) { return globalThis.React.createElement("a", props); }');
const landingSource = ts.transpileModule(readFileSync(new URL('../components/public-sports-landing.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(
  name === 'next/link' ? link
    : name.endsWith('.css') ? styles
      : name.includes('sports-') ? libs
        : pathToFileURL(require.resolve(name)).href,
));
const { default: Landing } = await import(dataUrl(landingSource));

const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join('') : node ? text(node.children) : '';
const view = (renderer) => text(renderer.toJSON());
const event = (slug, sections) => ({
  event: {
    name: 'Corrida', slug, eventType: 'Corrida', profileCode: null, estimatedAudience: null,
    format: 'IN_PERSON', startDate: null, endDate: null, timeZone: 'America/Sao_Paulo', venue: null,
  },
  publication: {},
  media: { logo: null, cover: null, socialShare: null },
  sections,
});
const modality = { id: 'run-8k', name: 'Corrida 8 km', distanceKm: 8, kind: 'RUN', capacity: 200 };
const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 12, reserved: 3, delivered: 5 };

test('a página da corrida mostra o publicado e troca de evento sem reservar vaga', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Landing, {
      event: event('volta-a', [{ content: { modalities: [modality], kits: [kit] } }]),
      registrationOpen: true,
      shirtSizes: [{ id: 'size-m', label: 'M' }],
      athletePrompts: [{ code: 'shirt_size', label: 'Tamanho da camiseta', required: false }],
    }));
  });
  try {
    const first = view(renderer);
    assert.match(first, /Corrida 8 km/u);
    assert.match(first, /até 200 pessoas/u);
    assert.match(first, /não reserva inscrição/u);
    assert.match(first, /O organizador informou 4 unidades nesta lista/u);
    assert.match(first, /não reserva estoque/u);
    assert.doesNotMatch(first, /vaga|atletas|reservado|entregue/iu);
    assert.doesNotMatch(first, /Escolher minha inscrição/u);
    assert.equal(renderer.root.findAllByType('a').length, 0);
    await act(async () => renderer.update(React.createElement(Landing, {
      event: event('volta-b', [{ enabled: false, content: { modalities: [modality], kits: [kit] } }]),
      registrationOpen: false,
      shirtSizes: [],
      athletePrompts: [],
    })));
    const second = view(renderer);
    assert.doesNotMatch(second, /Corrida 8 km|Camiseta M|volta-a/u);
    assert.match(second, /Inscrições indisponíveis/u);
  } finally {
    await act(async () => renderer.unmount());
  }
});
