import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const model = url(compile(readFileSync(new URL('../lib/scientific-program-agenda.ts', import.meta.url), 'utf8')));
const source = compile(readFileSync(new URL('../components/scientific-program-agenda.tsx', import.meta.url), 'utf8'));
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const match = find(child, predicate); if (match) return match; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
async function harness(activities) {
  const states = []; let cursor = 0; const edits = [];
  const key = `agendaHarness${Math.random().toString(36).slice(2)}`;
  globalThis[key] = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; } };
  const modules = {
    react: url(`export const useState=globalThis[${JSON.stringify(key)}].useState;`),
    'react/jsx-runtime': url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
    '../lib/scientific-program-agenda': model,
    './scientific-program-agenda.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
  };
  const { default: Component } = await import(url(source.replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(modules[name] ?? name)}`)));
  const render = () => { cursor = 0; return Component({ activities, timeZone: 'America/Sao_Paulo', conflicts: [], disabled: false, onEdit(...args) { edits.push(args); } }); };
  const field = (tree, name) => find(find(tree, (node) => node.type === 'label' && text(node).startsWith(name)), (node) => ['input', 'select'].includes(node.type));
  return { render, field, edits };
}
const activities = [
  { id: 'a1', title: 'Inteligência artificial', activityType: 'Palestra', startAt: '2026-10-06T12:00:00Z', endAt: '2026-10-06T13:00:00Z', status: 'READY_FOR_REVIEW', spaceId: 's1', space: { name: 'Sala Alfa' }, participants: [{ id: 'p1', participationType: 'SPEAKER', customRoleLabel: null, person: { name: 'Marina Coelho', institution: 'Instituição A' } }] },
  { id: 'a2', title: 'Pesquisa aplicada', activityType: 'Mesa', startAt: '2026-10-07T12:00:00Z', endAt: '2026-10-07T13:00:00Z', status: 'DRAFT', spaceId: 's2', space: { name: 'Sala Beta' }, participants: [] },
];
test('controles reais filtram busca, sala e dia e limpeza restaura agenda', async () => {
  const h = await harness(activities); let tree = h.render();
  h.field(tree, 'Buscar atividade').props.onChange({ target: { value: 'marina' } }); tree = h.render();
  assert.match(text(tree), /1 de 2 atividades/); assert.doesNotMatch(text(find(tree, (node) => node.props?.className === 'timeline')), /Pesquisa aplicada/);
  h.field(tree, 'Sala ou espaço').props.onChange({ target: { value: 's2' } }); tree = h.render(); assert.match(text(tree), /Nenhuma atividade para estes filtros/);
  find(tree, (node) => node.type === 'button' && text(node) === 'Limpar filtros').props.onClick(); tree = h.render(); assert.match(text(tree), /2 de 2 atividades/);
  h.field(tree, 'Dia').props.onChange({ target: { value: '2026-10-07' } }); tree = h.render(); assert.match(text(tree), /1 de 2 atividades/);
});
test('editar agenda fornece identificador e elemento de retorno de foco ao editor', async () => {
  const h = await harness(activities); const tree = h.render(); const opener = { focus() {} };
  find(tree, (node) => node.type === 'button' && text(node).startsWith('Editar atividade')).props.onClick({ currentTarget: opener });
  assert.deepEqual(h.edits, [['a1', opener]]);
});
test('agenda vazia oferece orientação sem criar atividades fictícias', async () => {
  const h = await harness([]); const tree = h.render(); assert.match(text(tree), /Sua agenda começa pela primeira atividade/);
  assert.equal(find(tree, (node) => node.type === 'button' && text(node).startsWith('Editar atividade')), null);
});
