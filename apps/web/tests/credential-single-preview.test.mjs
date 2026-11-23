import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const asModule = (value) => 'data:text/javascript;base64,' + Buffer.from(value).toString('base64');
const react = asModule(`
  let slots = [], index = 0;
  export const reset = () => { slots = []; index = 0; };
  export const render = () => { index = 0; };
  export const useState = initial => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
    return [slots[slot], next => {
      slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
    }];
  };
  export const useRef = initial => ({ current: initial });
  export const useEffect = () => {};
`);
const dependencies = {
  react,
  'react/jsx-runtime': asModule('export const Fragment=Symbol.for("react.fragment");export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),
  './credential-label': asModule('export default "credential-label";'),
  '../lib/api': asModule('export const api=()=>{throw new Error("Não chamar API ao renderizar prévia");};'),
};
const componentCode = ts.transpileModule(source('../components/credential-category-templates.tsx'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, dependency) =>
  'from ' + JSON.stringify(dependency === './credential-category-templates.module.css'
    ? asModule('export default new Proxy({},{get:(_,key)=>key});')
    : dependencies[dependency] ?? dependency));
const { default: Editor } = await import(asModule(componentCode));
const state = await import(react);
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const stringify = (node) => Array.isArray(node) ? node.map(stringify).join('')
  : node && typeof node === 'object' ? stringify(node.props?.children)
    : String(node ?? '');
const legacy = {
  preset: '10x5', widthMm: 100, heightMm: 50, showName: true,
  nameField: 'preferred_name', showCompany: true, companyField: 'institution',
  extraFields: ['city_state'], showCategory: true, codeMode: 'BOTH',
};
const data = {
  eventId: 'evento-12345',
  categories: [{ id: 'categoria123', name: 'Participante' }],
  fields: [],
  templates: [],
  widthMm: 100, heightMm: 50, labelConfig: legacy,
  organizer: true, onSaved: () => {}, onError: () => {},
};
function draw(props) {
  state.render();
  const tree = Editor(props);
  const previews = nodes(tree).filter((node) => node.type === 'credential-label');
  assert.equal(previews.length, 1, 'a categoria deve oferecer uma única prévia renderizada');
  return { tree, label: previews[0].props.label };
}

test('o configurador oferece uma única prévia para todo o evento, sem duplicação na seção de papel', () => {
  const paper = source('../components/credential-label-settings.tsx');
  const category = source('../components/credential-category-templates.tsx');
  const desk = source('../components/event-desk.tsx');
  assert.doesNotMatch(paper, /<CredentialLabel\b/u, 'a prévia antiga não pode reaparecer no papel');
  assert.equal((category.match(/<CredentialLabel\b/gu) ?? []).length, 1);
  assert.match(desk, /labelConfig=\{context\.label\}/u);
  assert.match(paper, /Configuração histórica: campos e códigos de categorias sem modelo salvo/u);
});

test('sem modelo salvo, a única prévia corresponde ao fallback histórico impresso', () => {
  state.reset();
  const { tree, label } = draw(data);
  assert.equal(label.orderedContent, undefined);
  assert.equal(label.name, 'Ana Pesquisadora');
  assert.equal(label.company, 'Empresa Exemplo');
  assert.deepEqual(label.lines, ['Osasco / SP']);
  assert.equal(label.category, 'Participante');
  assert.equal(label.codeMode, 'BOTH');
  assert.ok(label.qr && label.barcode);
  assert.match(stringify(tree), /Etiqueta histórica em uso/u);
  assert.equal(label.widthMm, 100);
  assert.equal(label.heightMm, 50);
});

test('com modelo da categoria salvo, a prévia usa apenas campos/QR e estilos que a impressão aplica', () => {
  state.reset();
  const styles = { preferred_name: { align: 'center', bold: true, color: '#111827' } };
  const { tree, label } = draw({ ...data, templates: [{
    categoryId: 'categoria123', fields: ['preferred_name', 'qr'], styles,
  }] });
  assert.deepEqual(label.orderedContent.map(({ code }) => code), ['preferred_name', 'qr']);
  assert.deepEqual(label.orderedContent[0].style, styles.preferred_name);
  assert.equal(label.barcode, null, 'modelo de categoria não herda código de barras legado');
  assert.equal(label.name, null, 'modelo por categoria não duplica nome histórico');
  assert.ok(label.qr);
  assert.match(stringify(tree), /Modelo salvo e utilizado na impressão/u);
});

test('edição não salva usa a MESMA prévia, com alerta antes de afetar a impressão', () => {
  state.reset();
  const first = draw(data);
  const restore = nodes(first.tree).find((node) => node.type === 'button' &&
    stringify(node) === 'Restaurar padrão');
  assert.ok(restore);
  restore.props.onClick();
  const edited = draw(data);
  assert.deepEqual(edited.label.orderedContent.map(({ code }) => code),
    ['preferred_name', 'institution', 'city_state', 'qr']);
  assert.match(stringify(edited.tree), /Rascunho não salvo/u);
  assert.equal(nodes(edited.tree).filter((node) => node.type === 'credential-label').length, 1);
});

test('uma categoria histórica não ativa modelo novo sem prévia explícita e confirmação de salvamento', () => {
  state.reset();
  const original = draw(data);
  const buttons = nodes(original.tree).filter((node) => node.type === 'button');
  const save = buttons.find((node) => stringify(node) === 'Salvar modelo da categoria');
  assert.ok(save);
  assert.equal(save.props.disabled, true, 'não ativar um layout que não foi visto no editor');
  const prepare = buttons.find((node) => stringify(node) === 'Preparar modelo padrão desta categoria');
  assert.ok(prepare);
  prepare.props.onClick();
  const draft = draw(data);
  assert.ok(draft.label.orderedContent, 'o rascunho deve aparecer na mesma prévia');
  assert.match(stringify(draft.tree), /Rascunho não salvo/u);
  const enabled = nodes(draft.tree).find((node) => node.type === 'button'
    && stringify(node) === 'Salvar modelo da categoria');
  assert.equal(enabled.props.disabled, false, 'salvamento só habilita após o modelo estar visível');
});

test('configuração histórica incompleta não quebra a única prévia', () => {
  state.reset();
  const { label } = draw({ ...data, labelConfig: null });
  assert.equal(label.codeMode, 'QR');
  assert.deepEqual(label.lines, []);
  assert.equal(label.name, 'Ana Pesquisadora');
  assert.equal(label.barcode, null);
  assert.ok(label.qr);
});

test('reset do editor depende do template selecionado, não de nova referência do array', () => {
  const editor = source('../components/credential-category-templates.tsx');
  assert.match(editor, /\}, \[eventId, categoryId, savedTemplate\]\);/u);
  assert.doesNotMatch(editor, /\}, \[eventId, categoryId, templates\]\);/u);
});
