import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the rendered JSX props, rather than only matching source strings.
// No browser login, participant data, printer, or physical print is simulated.
const asModule = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const dependencies = {
  react: asModule('export const useEffect=()=>{}; export const useRef=v=>({current:v}); export const useState=v=>[v,()=>{}];'),
  'react/jsx-runtime': asModule('export const Fragment=Symbol.for("react.fragment");export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),
  './print-surface': asModule('export default "print-surface";'),
  './credential-barcode': asModule('export default "barcode";'),
  './credential-qr': asModule('export default "qr";'),
};
const source = readFileSync(new URL('../components/credential-label.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) =>
  'from ' + JSON.stringify(name === './credential-label.module.css'
    ? asModule('export default new Proxy({},{get:(_,key)=>key});')
    : dependencies[name] ?? name));
const { default: CredentialLabel } = await import(asModule(js));
const nodes = (node) => Array.isArray(node)
  ? node.flatMap(nodes)
  : node && typeof node === 'object'
    ? [node, ...nodes(node.props?.children)]
    : [];

const base = {
  eventName: 'Evento fictício', name: null, company: null, lines: [],
  category: null, protocol: 'DEMO-001', qr: 'EVQ1.preview',
  barcode: null, widthMm: 90, heightMm: 40,
  orderedContent: [
    { code: 'preferred_name', kind: 'text', value: 'Ana Exemplo',
      style: { align: 'right', bold: true, color: '#1d4ed8', fontFamily: 'serif', fontSizeMm: 3.5 } },
    { code: 'institution', kind: 'text', value: 'Empresa Fictícia',
      style: { align: 'center', bold: false, color: '#065f46', fontFamily: 'mono', fontSizeMm: 2.5 } },
    { code: 'qr', kind: 'qr', value: '',
      style: { align: 'left', bold: false, color: '#111827' } },
  ],
};

function inspect(preview) {
  const tree = CredentialLabel({ label: base, preview });
  const sheet = nodes(tree).find((node) => node.type === 'section');
  assert.ok(sheet, 'a etiqueta precisa renderizar em ambos os modos');
  const rows = nodes(sheet).filter((node) => node.type === 'p');
  const qr = nodes(sheet).find((node) => node.props?.className === 'orderedQr');
  return { tree, sheet, rows, qr };
}

test('alinhamento, negrito, cor, família e tamanho sobrevivem da prévia à impressão virtual', () => {
  const preview = inspect(true);
  const print = inspect(false);
  assert.equal(preview.sheet.props['data-fit-warning'], false);
  assert.equal(print.sheet.props['data-fit-warning'], false);
  assert.deepEqual(preview.sheet.props.style, print.sheet.props.style);
  assert.deepEqual(preview.rows.map((row) => row.props.style), print.rows.map((row) => row.props.style));
  assert.equal(preview.rows[0].props.style.textAlign, 'right');
  assert.equal(preview.rows[0].props.style.fontWeight, 700);
  assert.equal(preview.rows[0].props.style.color, '#1d4ed8');
  assert.equal(preview.rows[0].props.style.fontFamily, 'Georgia, Times New Roman, serif');
  assert.equal(preview.rows[0].props.style.fontSize, '3.50mm');
  assert.equal(preview.rows[1].props.style.textAlign, 'center');
  assert.equal(preview.rows[1].props.style.fontWeight, 400);
  assert.equal(preview.rows[1].props.style.color, '#065f46');
  assert.equal(preview.rows[1].props.style.fontFamily, 'Courier New, monospace');
  assert.equal(preview.rows[1].props.style.fontSize, '2.50mm');
  assert.equal(preview.qr.props.style.justifySelf, 'start');
  assert.deepEqual(preview.qr.props.style, print.qr.props.style);
  assert.equal(print.tree.type, 'print-surface');
  assert.equal(print.tree.props.widthMm, 90);
  assert.equal(print.tree.props.heightMm, 40);
});

test('QR sem estilo salvo mantém alinhamento padrão, sem inventar um estilo de outro campo', () => {
  const label = { ...base, orderedContent: [
    { code: 'preferred_name', kind: 'text', value: 'Ana Exemplo' },
    { code: 'qr', kind: 'qr', value: '' },
  ] };
  const tree = CredentialLabel({ label, preview: true });
  const qr = nodes(tree).find((node) => node.props?.className === 'orderedQr');
  assert.ok(qr);
  assert.equal(qr.props.style, undefined);
  assert.equal(nodes(tree).find((node) => node.type === 'section').props['data-fit-warning'], false);
});

test('modelo congestionado mantém alerta na prévia e na superfície de impressão virtual', () => {
  const label = { ...base, widthMm: 40, heightMm: 20,
    orderedContent: [
      { code: 'preferred_name', kind: 'text', value: 'Participante '.repeat(40),
        style: { align: 'center', bold: true, color: '#111827', fontSizeMm: 6 } },
      { code: 'qr', kind: 'qr', value: '' },
    ] };
  for (const preview of [true, false]) {
    const tree = CredentialLabel({ label, preview });
    const sheet = nodes(tree).find((node) => node.type === 'section');
    assert.equal(sheet.props['data-fit-warning'], true);
    assert.ok(Number.isFinite(sheet.props.style['--label-scale']));
  }
});
