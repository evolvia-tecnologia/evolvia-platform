import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const panelSource = ts.transpileModule(readFileSync(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const configurator = readFileSync(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8');

const blocks = [
  { code: 'introducao', label: 'Introdução', min: 1, max: 400 },
  { code: 'metodo', label: 'Método', min: 1, max: 400 },
  { code: 'resultados', label: 'Resultados', min: 1, max: 400 },
];

async function load(payload) {
  const slots = []; let cursor = 0;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0 ? payload : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const key = `summaryBlocks${Math.random().toString(36).slice(2)}`;
  globalThis[key] = { useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => { cursor++; } };
  const react = url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,name)=>name});');
  const richText = url('export default function PublicRichText(){return null;}');
  const modules = { react, 'react/jsx-runtime': jsx, './participant-area.module.css': css, './public-rich-text': richText };
  const module = await import(url(panelSource.replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`)));
  const render = () => { cursor = 0; return module.default({ slug: 'congresso', token: 'opaque-test-token' }); };
  return { module, render, cleanup: () => { delete globalThis[key]; } };
}

const find = (node, predicate, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { for (const item of node) find(item, predicate, found); return found; }
  if (predicate(node)) found.push(node);
  return find(node.props?.children, predicate, found);
};
const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');

test('o resumo composto volta para os blocos na mesma ordem, inclusive com parágrafos internos', async () => {
  const { module, cleanup } = await load(null);
  try {
    const composed = 'Introdução\nContexto fictício.\n\nSegundo parágrafo.\n\nMétodo\nCoorte fictícia.\n\nResultados\nAchado fictício.';
    assert.deepEqual(module.splitComposedAbstract(composed, blocks), {
      introducao: 'Contexto fictício.\n\nSegundo parágrafo.', metodo: 'Coorte fictícia.', resultados: 'Achado fictício.',
    });
    assert.deepEqual(module.splitComposedAbstract('Resumo único antigo.', blocks), {}, 'sem rótulo, não inventa blocos');
    assert.deepEqual(module.splitComposedAbstract('Introdução\nTexto.\n\nDiscussão\nOutro.', blocks), {}, 'rótulo alterado não desloca texto');
    assert.deepEqual(module.splitComposedAbstract('', blocks), {});
  } finally { cleanup(); }
});

test('corrigir um trabalho com blocos preenche cada campo com o texto da versão anterior', async () => {
  const payload = {
    available: true, reason: null, taxonomy: [],
    modalities: [{ id: 'cmodality0001', name: 'Oral', description: null, window: { opensAt: null, closesAt: null, blocks } }],
    config: {
      collectTypedAbstract: true, abstractCounterUnit: 'CHARACTERS', abstractMin: 1, abstractMax: 2000, allowCorrections: true,
      titleMaxLength: 180, minKeywords: 1, maxKeywords: 5, maxSubmissionsPerAuthor: 3, minAuthors: 1, maxAuthors: 1, maxPresenters: 1,
      requirePresenter: true, collectAdditionalAuthors: false, presentationFormats: [], acceptedWorkUploadEnabled: false,
    },
    submissions: [{
      id: 'csubmissionaaa', title: 'Trabalho fictício', status: 'SUBMITTED', modality: 'Oral', modalityId: 'cmodality0001', currentVersion: 1,
      presentationFormatCode: null, hasEposter: false, keywords: ['alfa'],
      abstractText: 'Introdução\nContexto.\n\nMétodo\nCoorte.\n\nResultados\nAchado.',
      authors: [{ name: 'Ana', email: 'ana@example.test', sortOrder: 1, presenter: true, isSubmitter: true }],
    }],
  };
  const h = await load(payload);
  try {
    const correct = find(h.render(), (node) => node.type === 'button' && text(node) === 'Corrigir este trabalho')[0];
    correct.props.onClick();
    const values = find(h.render(), (node) => node.type === 'textarea').map((node) => node.props.value);
    assert.deepEqual(values, ['Contexto.', 'Coorte.', 'Achado.']);
  } finally { h.cleanup(); }
});

test('o editor do prazo mantém a mesma instância ao salvar e recusa data incompleta antes do PUT', () => {
  assert.match(configurator, /<FormatWindowEditor\s+key=\{modality\.id\}/u);
  assert.match(configurator, /useEffect\(\(\) => \{\s*setOpensAt/u);
  const save = configurator.slice(configurator.indexOf('async function save(event: FormEvent)'), configurator.indexOf("onSaving('window')"));
  assert.match(save, /Number\.isNaN\(Date\.parse\(opensAt\)\)/u);
  assert.match(save, /Number\.isNaN\(Date\.parse\(closesAt\)\)/u);
  assert.match(save, /return;/u);
});
