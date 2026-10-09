import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = ts.transpileModule(readFileSync(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const authorConfig = {
  requireFile: true,
  requirePresenter: true,
  requireArea: false,
  requireSubarea: false,
  requireAuthorInstitution: false,
  collectAdditionalAuthors: false,
  collectAuthorOrder: false,
  collectAuthorInstitution: false,
  requireSubmitterAsFirstAuthor: false,
  minAuthors: 1,
  maxAuthors: 1,
  maxPresenters: 1,
  titleMaxLength: 180,
  minKeywords: 1,
  maxKeywords: 5,
  maxSubmissionsPerAuthor: 3,
  collectScientificName: false,
  collectInstitutionAddress: false,
  collectFundingAgency: false,
  collectConflictOfInterest: false,
  requirePresentationSuggestion: false,
  collectTypedAbstract: true,
  collectReferences: false,
  abstractCounterUnit: 'CHARACTERS',
  abstractMin: 10,
  abstractMax: 2800,
  showProceedingsAuthorization: false,
  proceedingsAuthorizationPt: null,
  proceedingsAuthorizationEs: null,
  proceedingsAuthorizationEn: null,
  acceptedWorkUploadEnabled: false,
  acceptedWorkUploadDeadline: null,
  allowCorrections: false,
  presentationFormats: [],
};

const correctable = [
  { id: 'csubmissionaaa', title: 'Trabalho A', status: 'SUBMITTED', modality: 'Oral', modalityId: 'cmodality0001', currentVersion: 2,
    presentationFormatCode: null, hasSubmissionFile: true, submissionFileVersions: [2, 1], hasEposter: false,
    authors: [{ name: 'Ana', email: 'ana@example.test', sortOrder: 1, presenter: true, isSubmitter: true }] },
  { id: 'csubmissionbbb', title: 'Trabalho B', status: 'SUBMITTED', modality: 'Oral', modalityId: 'cmodality0001', currentVersion: 1,
    presentationFormatCode: null, hasSubmissionFile: true, submissionFileVersions: [1], hasEposter: false,
    authors: [{ name: 'Ana', email: 'ana@example.test', sortOrder: 1, presenter: true, isSubmitter: true }] },
];

function areaPayload(requireFile = true, submissions = [], allowCorrections = false) {
  return {
    available: true,
    reason: null,
    taxonomy: [],
    modalities: [{ id: 'cmodality0001', name: 'Oral', description: null }, { id: 'cmodality0002', name: 'Pôster', description: null }],
    config: { ...authorConfig, requireFile, allowCorrections },
    submissions,
  };
}

async function harness({ requireFile = true, file = { size: 12, name: 'trabalho.pdf' }, readFailure = false, submissions = [], allowCorrections = false, deferFetch = false } = {}) {
  const slots = []; const calls = []; const readers = []; const pending = []; const clicks = []; let cursor = 0;
  const payload = areaPayload(requireFile, submissions, allowCorrections);
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0 ? payload : initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  class File { size = file?.size ?? 0; name = file?.name ?? ''; }
  class FormData { get(name) { return name === 'submissionFile' && file ? new File() : null; } }
  class FileReader {
    result = 'data:application/pdf;base64,JVBERi0xLjQ=';
    readAsDataURL() { readers.push(this); }
  }
  const window = {
    setTimeout: () => 0,
    document: {
      body: { appendChild: () => {} },
      createElement: () => { const link = { click: () => clicks.push({ href: link.href, download: link.download }), remove: () => {} }; return link; },
    },
  };
  const respond = (response) => {
    if (!deferFetch) return Promise.resolve(response);
    return new Promise((resolve) => { pending.push(() => resolve(response)); });
  };
  const h = {
    useState: state, useRef: (initial) => state({ current: initial })[0], useEffect: () => { cursor++; },
    File, FormData, FileReader, window,
    fetch: (path, options = {}) => {
      calls.push({ path, method: options.method ?? 'GET', body: options.body, headers: options.headers });
      if (options.method === 'POST') {
        return respond({
          ok: true,
          json: async () => ({ id: 'csubmission001', status: 'SUBMITTED', submittedAt: '2026-10-08T12:00:00.000Z' }),
        });
      }
      if (/\/versions\/\d+\/file$/u.test(path)) {
        return respond({ ok: true, blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...payload,
          submissions: [{
            id: 'csubmission001', title: 'Pesquisa de campo', status: 'SUBMITTED', modality: 'Oral',
            currentVersion: 1, presentationFormatCode: null, hasSubmissionFile: requireFile, hasEposter: false, authors: [],
          }],
        }),
      });
    },
  };
  const key = `submissionPdfHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = h;
  const react = url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,name)=>name});');
  const richText = url('export default function PublicRichText(){return null;}');
  const modules = { react, 'react/jsx-runtime': jsx, './participant-area.module.css': css, './public-rich-text': richText };
  const transformed = `const {fetch,File,FormData,FileReader,window}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Component } = await import(url(transformed));
  const render = (props = {}) => { cursor = 0; return Component({ slug: 'congresso', token: 'opaque-test-token', ...props }); };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const item of node) { const found = find(item, predicate); if (found) return found; } return null; }
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
  const form = (tree) => find(tree, (node) => node.type === 'form' && /Enviar um trabalho|Corrigir este trabalho/u.test(text(node)));
  const submit = (node) => node.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  const fileInput = (tree) => find(tree, (node) => node.type === 'input' && node.props.name === 'submissionFile');
  const choose = (tree = render()) => { fileInput(tree).props.onChange({ target: {} }); };
  const button = (tree, label) => find(tree, (node) => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label));
  const finishRead = () => { if (readFailure) readers.at(-1).onerror(); else readers.at(-1).onload(); };
  const settle = () => new Promise(setImmediate);
  return { render, find, text, form, submit, fileInput, choose, button, calls, readers, pending, clicks, finishRead, settle, cleanup: () => { delete globalThis[key]; } };
}

test('o formulário do autor pede o PDF inicial e explica que ele fica parado na Evolvia', async () => {
  const h = await harness();
  try {
    const tree = h.render();
    const input = h.find(tree, (node) => node.type === 'input' && node.props.name === 'submissionFile');
    assert.equal(input.props.type, 'file');
    assert.equal(input.props.accept, 'application/pdf,.pdf');
    assert.equal(input.props.required, true);
    assert.match(h.text(tree), /PDF simples de até 5 MB/u);
    assert.match(h.text(tree), /não é executado/u);
    assert.match(h.text(tree), /depois do aceite/u);
  } finally { h.cleanup(); }
});

test('o envio inicial manda o PDF no corpo e a lista marca o anexo sem a chave de armazenamento', async () => {
  const h = await harness();
  try {
    h.choose();
    const pending = h.submit(h.form(h.render()));
    h.submit(h.form(h.render()));
    assert.equal(h.readers.length, 1);
    h.finishRead();
    await pending;
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
    const post = h.calls.find((call) => call.method === 'POST');
    assert.equal(post.path, '/api/public/events/congresso/participant/submissions');
    assert.equal(typeof post.headers['idempotency-key'], 'string');
    const body = JSON.parse(post.body);
    assert.equal(body.file.fileName, 'trabalho.pdf');
    assert.equal(body.file.contentBase64, 'JVBERi0xLjQ=');
    assert.equal(Object.hasOwn(body, 'contentBase64'), false);
    const tree = h.render();
    assert.match(h.text(tree), /PDF da submissão anexado/u);
    assert.doesNotMatch(h.text(tree), /fileKey|segredo/u);
  } finally { h.cleanup(); }
});

test('sem arquivo, acima de 5 MB ou com outro tipo, o envio não sai do navegador', async () => {
  const missing = await harness({ file: null });
  try {
    await missing.submit(missing.form(missing.render()));
    assert.equal(missing.calls.length, 0);
    assert.match(missing.text(missing.render()), /Anexe o PDF exigido na submissão/u);
  } finally { missing.cleanup(); }

  const large = await harness({ file: { size: 5 * 1024 * 1024 + 1, name: 'trabalho.pdf' } });
  try {
    await large.submit(large.form(large.render()));
    assert.equal(large.calls.length, 0);
    assert.match(large.text(large.render()), /no máximo 5 MB/u);
  } finally { large.cleanup(); }

  const other = await harness({ file: { size: 12, name: 'trabalho.docx' } });
  try {
    await other.submit(other.form(other.render()));
    assert.equal(other.calls.length, 0);
    assert.match(other.text(other.render()), /terminado em \.pdf/u);
  } finally { other.cleanup(); }
});

test('evento que não pede arquivo não mostra o campo nem envia file', async () => {
  const h = await harness({ requireFile: false, file: null });
  try {
    const tree = h.render();
    assert.equal(h.find(tree, (node) => node.type === 'input' && node.props.name === 'submissionFile'), null);
    assert.doesNotMatch(h.text(tree), /PDF simples de até 5 MB/u);
    const pending = h.submit(h.form(tree));
    await pending;
    const post = h.calls.find((call) => call.method === 'POST');
    const body = JSON.parse(post.body);
    assert.equal(Object.hasOwn(body, 'file'), false);
    assert.equal(h.readers.length, 0);
  } finally { h.cleanup(); }
});

test('PDF escolhido para um trabalho não segue para a correção de outro', async () => {
  const h = await harness({ submissions: correctable, allowCorrections: true });
  try {
    let tree = h.render();
    const initialKey = h.fileInput(tree).key;
    h.choose(tree);
    const corrections = [];
    h.find(tree, (node) => { if (node.type === 'button' && h.text(node) === 'Corrigir este trabalho') corrections.push(node); return false; });
    corrections[0].props.onClick();
    tree = h.render();
    assert.notEqual(h.fileInput(tree).key, initialKey, 'o campo de arquivo é recriado vazio');
    await h.submit(h.form(tree));
    assert.equal(h.calls.length, 0);
    assert.match(h.text(h.render()), /Selecione de novo o PDF deste trabalho/u);

    h.choose();
    corrections[1].props.onClick();
    await h.submit(h.form(h.render()));
    assert.equal(h.calls.length, 0, 'o arquivo do trabalho A não vai para B');

    h.choose();
    const pending = h.submit(h.form(h.render()));
    h.finishRead();
    await pending;
    const post = h.calls.find((call) => call.method === 'POST');
    assert.equal(post.path, '/api/public/events/congresso/participant/submissions/csubmissionbbb/versions');
    assert.equal(JSON.parse(post.body).file.fileName, 'trabalho.pdf');
  } finally { h.cleanup(); }
});

test('trocar modalidade ou cancelar a correção descarta o PDF e a chave de envio', async () => {
  const h = await harness({ submissions: correctable, allowCorrections: true });
  try {
    let tree = h.render();
    h.choose(tree);
    h.find(tree, (node) => node.type === 'select' && node.props.required && h.text(node).includes('Pôster')).props.onChange({ target: { value: 'cmodality0002' } });
    await h.submit(h.form(h.render()));
    assert.equal(h.calls.length, 0);
    assert.match(h.text(h.render()), /Selecione de novo o PDF/u);

    tree = h.render();
    h.button(tree, 'Corrigir este trabalho').props.onClick();
    h.choose();
    h.button(h.render(), 'Cancelar correção').props.onClick();
    tree = h.render();
    assert.match(h.text(h.form(tree)), /Enviar um trabalho/u);
    await h.submit(h.form(tree));
    assert.equal(h.calls.length, 0);
  } finally { h.cleanup(); }
});

test('troca de evento ou de sessão durante a leitura não envia o PDF', async () => {
  const h = await harness();
  try {
    h.choose();
    const pending = h.submit(h.form(h.render()));
    h.render({ token: 'outra-sessao' });
    h.finishRead();
    await pending;
    assert.equal(h.calls.length, 0);
  } finally { h.cleanup(); }

  const other = await harness();
  try {
    other.choose();
    const pending = other.submit(other.form(other.render()));
    other.render({ slug: 'outro-evento' });
    other.finishRead();
    await pending;
    assert.equal(other.calls.length, 0);
  } finally { other.cleanup(); }
});

test('resposta do envio que chega depois da troca de sessão não altera a nova tela', async () => {
  const h = await harness({ deferFetch: true });
  try {
    h.choose();
    const pending = h.submit(h.form(h.render()));
    h.finishRead();
    await h.settle();
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
    h.render({ token: 'outra-sessao' });
    h.pending.shift()();
    await pending;
    const tree = h.render({ token: 'outra-sessao' });
    assert.doesNotMatch(h.text(tree), /PDF da submissão anexado/u);
    assert.equal(h.calls.filter((call) => call.method === 'GET').length, 0, 'não recarrega a lista com a sessão antiga');
  } finally { h.cleanup(); }
});

test('download do PDF de cada versão usa a sessão do autor e descarta resposta de outra sessão', async () => {
  const h = await harness({ submissions: correctable, allowCorrections: true });
  try {
    const tree = h.render();
    assert.ok(h.button(tree, 'Baixar PDF da versão 1 de Trabalho A'));
    assert.ok(h.button(tree, 'Baixar PDF da versão 1 de Trabalho B'));
    await h.button(tree, 'Baixar PDF da versão 2 de Trabalho A').props.onClick();
    await h.settle();
    const get = h.calls.at(-1);
    assert.equal(get.path, '/api/public/events/congresso/participant/submissions/csubmissionaaa/versions/2/file');
    assert.equal(get.headers.authorization, 'Bearer opaque-test-token');
    assert.equal(h.clicks.length, 1);
    assert.equal(h.clicks[0].download, 'trabalho-versao-2.pdf');
    assert.match(h.clicks[0].href, /^blob:/u);
    assert.doesNotMatch(h.text(h.render()), /fileKey/u);
  } finally { h.cleanup(); }

  const late = await harness({ submissions: correctable, allowCorrections: true, deferFetch: true });
  try {
    const pending = late.button(late.render(), 'Baixar PDF da versão 1 de Trabalho B').props.onClick();
    late.render({ token: 'outra-sessao' });
    late.pending.shift()();
    await pending;
    assert.equal(late.clicks.length, 0);
  } finally { late.cleanup(); }
});
