import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const agenda = url(compile('../lib/scientific-program-agenda.ts'));
const model = url(compile('../lib/public-event-program.ts').replace(/['"]\.\/scientific-program-agenda['"]/, JSON.stringify(agenda)));
const { parsePublicProgram, publicProgramDays, publicProgramTimeZone, publicProgramWideLayout } = await import(model);

const modules = {
  'react/jsx-runtime': url('export const Fragment="fragment"; export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'),
  '../lib/public-event-program': model,
  './public-event-program.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
};
const componentSource = compile('../components/public-event-program.tsx')
  .replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
const { default: PublicEventProgram } = await import(url(componentSource));

const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node === false || node == null ? '' : String(node);
function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((child) => findAll(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  findAll(node.props?.children, predicate, found);
  return found;
}

const payload = {
  event: { slug: 'congresso', timeZone: 'America/Sao_Paulo', format: 'HYBRID' },
  activities: [
    { id: 'a2', title: 'Mesa de encerramento', activityType: 'Mesa-redonda', description: null,
      startAt: '2026-10-16T21:00:00.000Z', endAt: '2026-10-17T03:30:00.000Z',
      space: { name: 'Auditório Principal', location: 'Térreo' }, online: false, area: null,
      participants: [{ name: 'Dr. Paulo Reis', professionalTitle: null, participationType: 'MODERATOR', customRoleLabel: null }] },
    { id: 'a1', title: 'Conferência de abertura', activityType: 'Conferência', description: 'Boas-vindas',
      startAt: '2026-10-16T01:30:00.000Z', endAt: '2026-10-16T02:30:00.000Z',
      space: { name: 'Sala virtual', location: null }, online: true, area: 'Cardiologia',
      streamUrl: 'https://privado.example/sala', operationalNotes: 'microfone',
      work: {
        title: 'Diretrizes de insuficiência cardíaca', code: 12,
        authors: ['Dra. Ana Souza', { name: 'Segredo', email: 'autor@privado.example' }],
        email: 'trabalho@privado.example', fileKey: 's3://segredo',
      },
      participants: [{ name: 'Dra. Ana Souza', professionalTitle: 'Cardiologista', participationType: 'SPEAKER', customRoleLabel: null, email: 'ana@privado.example' }] },
    { id: '', title: 'Sem identificador', startAt: '2026-10-16T12:00:00Z', endAt: '2026-10-16T13:00:00Z' },
    { id: 'x', title: 'Data inválida', startAt: 'amanhã', endAt: '2026-10-16T13:00:00Z' },
  ],
};

test('agrupa por dia no fuso do evento, inclusive perto da meia-noite', () => {
  const program = parsePublicProgram(payload);
  assert.equal(program.activities.length, 2);
  const days = publicProgramDays(program);
  assert.deepEqual(days.map((day) => day.key), ['2026-10-15', '2026-10-16']);
  assert.equal(days[0].activities[0].title, 'Conferência de abertura');
  assert.equal(days[0].activities[0].startLabel, '22:30');
  assert.equal(days[0].activities[0].endLabel, '23:30');
  assert.equal(days[1].activities[0].startLabel, '18:00');
  assert.equal(days[1].activities[0].endLabel, '00:30');
  assert.match(days[1].activities[0].endsOnAnotherDay, /17/u);
  assert.equal(days[0].activities[0].people[0].detail, 'Palestrante · Cardiologista');
});

test('parser descarta campos privados que não fazem parte do contrato público', () => {
  const program = parsePublicProgram(payload);
  const serialized = JSON.stringify(program);
  for (const secret of ['privado.example', 'microfone', 'streamUrl', 'email', 's3://', 'Segredo']) assert.doesNotMatch(serialized, new RegExp(secret, 'u'));
  assert.equal(program.activities.find((item) => item.id === 'a1').work.code, 12);
  assert.deepEqual(program.activities.find((item) => item.id === 'a1').work.authors, ['Dra. Ana Souza']);
  assert.equal(parsePublicProgram(null), null);
  assert.equal(parsePublicProgram({ event: {}, activities: 'x' }), null);
});

test('fuso confirmado mostra nome amigável; ausente ou inválido é sinalizado', () => {
  const confirmed = publicProgramTimeZone('America/Sao_Paulo');
  assert.equal(confirmed.confirmed, true);
  assert.match(confirmed.label, /America\/Sao_Paulo/u);
  for (const zone of [null, 'Fuso/Inexistente']) {
    const fallback = publicProgramTimeZone(zone);
    assert.equal(fallback.zone, 'UTC');
    assert.equal(fallback.confirmed, false);
  }
});

test('largura ampla segue o tema publicado', () => {
  assert.equal(publicProgramWideLayout({ contentWidth: 'WIDE' }), true);
  assert.equal(publicProgramWideLayout({ contentWidth: 'STANDARD' }), false);
  assert.equal(publicProgramWideLayout(null), false);
});

test('seção pública mostra dias, horários, salas e pessoas sem links de transmissão', () => {
  const tree = PublicEventProgram({ program: parsePublicProgram(payload) });
  const content = text(tree);
  assert.equal(tree.props.id, 'programacao');
  assert.match(content, /Programação/u);
  assert.match(content, /Horários em .*America\/Sao_Paulo/u);
  assert.match(content, /área do participante para inscrições confirmadas/u);
  assert.match(content, /Auditório Principal · Térreo/u);
  assert.match(content, /Online/u);
  assert.match(content, /Dra\. Ana Souza/u);
  assert.match(content, /Trabalho confirmado: Diretrizes de insuficiência cardíaca · código 12 · Dra\. Ana Souza/u);
  assert.match(content, /Moderação/u);
  const links = findAll(tree, (node) => node.type === 'a');
  assert.deepEqual(links.map((link) => link.props.href), ['#programacao-2026-10-15', '#programacao-2026-10-16']);
  assert.equal(findAll(tree, (node) => node.type === 'iframe' || node.type === 'video').length, 0);
  const times = findAll(tree, (node) => node.type === 'time').map((node) => node.props.dateTime);
  assert.ok(times.includes('2026-10-16T01:30:00.000Z'));
});

test('sem atividades publicadas a seção não é renderizada', () => {
  assert.equal(PublicEventProgram({ program: { event: payload.event, activities: [] } }), null);
});

test('um único dia dispensa a navegação por dias e sem online não promete acesso', () => {
  const program = parsePublicProgram({ ...payload, activities: [payload.activities[0]] });
  const tree = PublicEventProgram({ program });
  assert.equal(findAll(tree, (node) => node.type === 'nav').length, 0);
  assert.doesNotMatch(text(tree), /área do participante/u);
});
