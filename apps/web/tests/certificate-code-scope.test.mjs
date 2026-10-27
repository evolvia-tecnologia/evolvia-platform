import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooksUrl = data(`let slots=[],cursor=0,effects=[],late=0;
export const reset=()=>{cursor=0;};
export const lateWrites=()=>late;
export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[];};
export const run=()=>{const work=effects;effects=[];work.forEach(fn=>fn());};
export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{if(target!==slots){late++;return;}target[i]=typeof v==='function'?v(target[i]):v;}];}
export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];}
export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn();});}}`);
const pdfUrl = data(`export const calls=[];export function downloadCertificatePdf(code){return new Promise((resolve,reject)=>calls.push({code,resolve,reject}));}`);
const modules = {
  react: hooksUrl,
  'react/jsx-runtime': data('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment=Symbol.for("fragment");'),
  '../lib/certificate-pdf-download': pdfUrl,
  './public-rich-text': data('export default "rich-text";'),
  './public-site-header': data('export default "site-header";'),
  './scientific-eva-help': data('export default "eva-help";'),
  './presence-certificate-view.module.css': data('export default {};'),
};
const source = readFileSync(new URL('../components/presence-certificate-view.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const { default: View } = await import(data(compiled.outputText.replace(/from ['"]([^'"]+)['"]/g, (_, key) => `from ${JSON.stringify(modules[key])}`)));
const hooks = await import(hooksUrl), pdf = await import(pdfUrl);
const originalFetch = globalThis.fetch, requests = [];
globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, signal: options.signal, resolve }));
after(() => { hooks.unmount(); globalThis.fetch = originalFetch; });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.text ?? n.props?.children) : String(n ?? '');
let lastKey;
function render(code) {
  hooks.reset();
  const root = View({ code });
  if (typeof root.type !== 'function') return root;
  if (lastKey !== undefined && lastKey !== root.key) hooks.unmount();
  lastKey = root.key; hooks.reset();
  return root.type(root.props);
}
const payload = name => ({ authentic: true, originalSnapshot: true, role: 'participation', eventName: `Evento ${name}`, displayName: name, hours: 8, issuedAt: '2026-10-26T05:00:00Z', feeCents: 0, title: 'Certificado', body: `Participação ${name}`, back: 'Verso original', artAlt: null, hasArt: true });
const respond = (request, value, ok = true) => request.resolve({ ok, json: async () => value });
const clickPdf = tree => nodes(tree).find(n => n.type === 'a' && n.props.href?.endsWith('/pdf')).props.onClick({ preventDefault() {} });

test('consulta e PDF ficam vinculados ao código; troca/erro/código inválido não conservam documento ou selo anterior', async () => {
  const a = 'a'.repeat(32), b = 'b'.repeat(32), c = 'c'.repeat(32);
  let tree = render(a); hooks.run(); respond(requests.at(-1), payload('Pessoa A')); await tick();
  tree = render(a); assert.match(text(tree), /Pessoa A/); assert.match(text(tree), /Autêntico/);
  const canonicalRequests = requests.length;
  tree = render(` ${a.toUpperCase()} `); hooks.run();
  assert.equal(requests.length, canonicalRequests); assert.match(text(tree), /Pessoa A/);
  clickPdf(tree); clickPdf(tree);
  tree = render(b);
  assert.doesNotMatch(text(tree), /Pessoa A|Autêntico|Preparando PDF/);
  assert.equal(pdf.calls.length, 1);
  assert.match(text(tree), /Conferindo autenticidade/);
  hooks.run(); pdf.calls[0].resolve('Erro tardio do PDF A'); await tick();
  tree = render(b); assert.doesNotMatch(text(tree), /Erro tardio/);
  let resolveJson;
  requests.at(-1).resolve({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve; }) }); await tick();
  tree = render(c); hooks.run(); resolveJson(payload('Pessoa B tardia')); await tick();
  assert.equal(hooks.lateWrites(), 0);
  tree = render(c); assert.doesNotMatch(text(tree), /Pessoa B|Autêntico/);
  respond(requests.at(-1), { message: 'Certificado não encontrado.' }, false); await tick();
  tree = render(c); assert.match(text(tree), /Certificado não encontrado/); assert.doesNotMatch(text(tree), /Autêntico/);
  const before = requests.length;
  tree = render('inválido'); hooks.run(); await tick();
  assert.equal(requests.length, before); assert.match(text(tree), /Código de certificado inválido/);
  assert.doesNotMatch(text(tree), /Pessoa A|Pessoa B|Autêntico|Certificado não encontrado/);
  tree = render(a); hooks.run(); respond(requests.at(-1), payload('Pessoa A')); await tick();
  tree = render(a); clickPdf(tree); assert.equal(pdf.calls.at(-1).code, a);
  pdf.calls.at(-1).reject(Error('Falha técnica')); await tick();
  tree = render(a); assert.match(text(tree), /Não foi possível preparar o PDF/); assert.doesNotMatch(text(tree), /Preparando PDF/);
  assert.equal(hooks.lateWrites(), 0);
});
