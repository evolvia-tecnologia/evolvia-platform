import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8');

test('o autor guarda rascunho, continua o mesmo trabalho e vê as versões enviadas', () => {
  assert.match(panel, /DRAFT: 'Rascunho'/u);
  assert.match(panel, /Salvar rascunho/u);
  assert.match(panel, /Continuar rascunho/u);
  assert.match(panel, /Rascunho ainda sem versão enviada/u);
  assert.match(panel, /Rascunho guardado nesta inscrição/u);
  assert.match(panel, /Informe um título para guardar o rascunho/u);
  assert.match(panel, /Versões enviadas/u);
  assert.match(panel, /<ol reversed>/u);
  assert.match(panel, /\/drafts/u);
  assert.match(panel, /draftId: draftId \?\? undefined/u);
  assert.match(panel, /revisionId \|\| draftId \|\| area\.submissions\.length < area\.config\.maxSubmissionsPerAuthor/u);
  assert.match(panel, /type="button" disabled=\{busy\} onClick=\{\(\) => void saveDraft\(\)\}/u);
  assert.doesNotMatch(panel, /collectAuthorOrder \? Number\(author\.sortOrder\)/u);
  assert.match(panel, /collectAuthorOrder && author\.sortOrder \? Number\(author\.sortOrder\) : undefined/u);
  assert.match(panel, /conflictDeclared \? conflictDeclared === 'yes' : null/u);
});

test('limpar o formulário do rascunho zera todos os campos e volta para um envio novo', async () => {
  const { default: ts } = await import('typescript');
  const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const source = ts.transpileModule(panel, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const payload = {
    available: true, reason: null, taxonomy: [], modalities: [{ id: 'cmodality0001', name: 'Oral', description: null }],
    config: { collectTypedAbstract: true, abstractCounterUnit: 'CHARACTERS', abstractMin: 1, abstractMax: 2000, titleMaxLength: 180,
      minKeywords: 1, maxKeywords: 5, maxSubmissionsPerAuthor: 2, minAuthors: 1, maxAuthors: 3, maxPresenters: 1, requirePresenter: true,
      presentationFormats: [], acceptedWorkUploadEnabled: false },
    submissions: [{ id: 'cdraft0000001', title: 'Rascunho fictício', abstractText: 'Resumo fictício', keywords: ['alfa'], status: 'DRAFT',
      submittedAt: null, modality: 'Oral', modalityId: 'cmodality0001', currentVersion: 0, presentationFormatCode: null, hasEposter: false,
      fundingAgency: 'FAP fictícia', conflictDeclared: true, conflictDetail: 'Conflito fictício', referencesText: 'Referência fictícia', proceedingsAuthorizationAccepted: true,
      authors: [{ name: 'Ana', email: 'ana@example.test', institution: 'USP', scientificName: 'Ana scientifica', institutionAddress: 'Rua de teste, 1', sortOrder: 1, presenter: true, isSubmitter: true },
        { name: 'Bia', email: 'bia@example.test', institution: 'USP', sortOrder: 2, presenter: false }] }],
  };
  const slots = []; let cursor = 0;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0 ? payload : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const key = `draftClear${Math.random().toString(36).slice(2)}`;
  globalThis[key] = { useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => { cursor++; } };
  const modules = {
    react: url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`),
    'react/jsx-runtime': url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
    './participant-area.module.css': url('export default new Proxy({}, {get:(_,name)=>name});'),
    './public-rich-text': url('export default function PublicRichText(){return null;}'),
  };
  try {
    const { default: Panel } = await import(url(source.replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`)));
    const render = () => { cursor = 0; return Panel({ slug: 'congresso', token: 'opaque-test-token' }); };
    const all = (node, predicate, found = []) => {
      if (!node || typeof node !== 'object') return found;
      if (Array.isArray(node)) { node.forEach((item) => all(item, predicate, found)); return found; }
      if (predicate(node)) found.push(node);
      return all(node.props?.children, predicate, found);
    };
    const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
    const button = (tree, label) => all(tree, (node) => node.type === 'button' && text(node) === label)[0];
    const values = (tree) => all(tree, (node) => (node.type === 'input' || node.type === 'textarea') && typeof node.props.value === 'string').map((node) => node.props.value).filter(Boolean);

    button(render(), 'Continuar rascunho').props.onClick();
    let tree = render();
    assert.ok(values(tree).includes('Rascunho fictício'));
    assert.ok(values(tree).includes('bia@example.test'));
    for (const restored of ['Ana scientifica', 'Rua de teste, 1', 'FAP fictícia', 'Conflito fictício', 'Referência fictícia']) assert.ok(values(tree).includes(restored));
    const accepted = all(tree, (node) => node.type === 'input' && node.props.type === 'checkbox' && node.props.checked === true);
    assert.ok(accepted.length > 0, 'autorização dos anais restaurada');
    button(tree, 'Limpar formulário').props.onClick();
    tree = render();
    assert.deepEqual(values(tree).filter((value) => !/^\d+$/u.test(value)), []);
    assert.match(text(tree), /Enviar um trabalho/u);
    assert.ok(all(tree, (node) => node.type === 'input' && node.props.type === 'email').length === 0, 'coautores removidos');
    assert.equal(button(tree, 'Limpar formulário'), undefined);
  } finally { delete globalThis[key]; }
});
