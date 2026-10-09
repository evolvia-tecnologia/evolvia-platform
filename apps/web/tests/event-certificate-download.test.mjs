import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');

const setting = {
  enabled: true,
  hours: 8,
  title: 'Certificado de participação',
  body: 'Certificamos que **{NOME}** participou de **{EVENTO}**.',
  art: null,
  revision: 3,
  feeCents: 0,
  role: 'participation',
  issuedCount: 2,
};

async function harness() {
  const key = `certificate_${Math.random().toString(36).slice(2)}`;
  const slots = [];
  const effects = [];
  let cursor = 0;
  const state = {
    useState(initial) {
      const index = cursor;
      cursor += 1;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  globalThis[key] = state;
  const modules = {
    react: url(`const s=globalThis[${JSON.stringify(key)}];export const useState=s.useState.bind(s);export const useEffect=s.useEffect.bind(s);`),
    'react/jsx-runtime': url('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment="fragment";'),
    '../lib/api': url('export const getToken=()=>"token";export const api=()=>Promise.resolve(' + JSON.stringify(setting) + ');export const apiBlob=()=>Promise.resolve(new Blob());'),
    './publication-rich-text-field': url('export default function Field(){return null;}'),
    './scientific-eva-help': url('export default function Help(){return null;}'),
    './event-certificate.module.css': url('export default new Proxy({},{get:(_,name)=>name});'),
  };
  const source = compile('../components/event-certificate.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const { default: Certificate } = await import(url(source));
  const render = () => {
    cursor = 0;
    const outer = Certificate({ eventId: 'evt-1' });
    return outer.type(outer.props);
  };
  return {
    render,
    flush() { return effects.splice(0).map((effect) => effect()); },
    dispose() { delete globalThis[key]; },
  };
}

test('o lote revoga o arquivo só depois do clique consumir o endereço', async () => {
  const h = await harness();
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let revoked = false;
  let clickedWhileLive = false;
  const link = {
    href: '',
    download: '',
    click() { clickedWhileLive = !revoked && this.href === 'blob:lote' && this.download === 'certificados.pdf'; },
  };
  globalThis.document = { createElement: () => link, body: { appendChild() {}, removeChild() {} } };
  globalThis.window = globalThis;
  URL.createObjectURL = () => 'blob:lote';
  URL.revokeObjectURL = (value) => { revoked = value === 'blob:lote'; };
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['%PDF-1.4']), json: async () => ({}) });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    h.render();
    h.flush();
    await new Promise((resolve) => setImmediate(resolve));
    const tree = h.render();
    const button = nodes(tree).find((node) => node.type === 'button' && text(node) === 'Baixar lote em PDF');
    assert.equal(button.props.disabled, false);
    await button.props.onClick();
    assert.equal(clickedWhileLive, true);
    assert.equal(revoked, false);
    mock.timers.tick(999);
    assert.equal(revoked, false);
    mock.timers.tick(1);
    assert.equal(revoked, true);
    assert.match(text(h.render()), /Lote baixado/u);
  } finally {
    mock.timers.reset();
    h.dispose();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
