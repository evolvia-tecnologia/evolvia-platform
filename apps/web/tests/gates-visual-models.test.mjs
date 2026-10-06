import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaDay, agendaHour, agendaGroups, agendaRole, agendaTimeZone } from '../lib/scientific-program-agenda.ts';
import { reportBarPercent, postEventInsights } from '../lib/post-event-insights.ts';

const activity = (id, startAt, extra = {}) => ({ id, title: 'Imunologia', activityType: 'Mesa', startAt, endAt: '2026-10-06T14:00:00Z', status: 'DRAFT', spaceId: 's1', space: { name: 'Auditório' }, participants: [{ id: 'p1', participationType: 'SPEAKER', customRoleLabel: null, person: { name: 'Marina Coelho', institution: 'Instituição Alfa' } }], ...extra });
const filters = { day: 'all', space: 'all', query: '' };
test('agenda agrupa o dia no fuso do evento, independentemente do navegador', () => {
  assert.equal(agendaDay('2026-10-06T01:00:00Z', 'America/Sao_Paulo'), '2026-10-05');
  assert.equal(agendaHour('2026-10-06T01:00:00Z', 'America/Sao_Paulo'), '22:00');
  assert.equal(agendaDay('2026-10-06T01:00:00Z', 'Asia/Tokyo'), '2026-10-06');
});
test('agenda usa fallback determinístico para fuso ausente ou inválido', () => {
  assert.equal(agendaTimeZone(null), 'UTC'); assert.equal(agendaTimeZone('Invalid/Zone'), 'UTC');
  assert.equal(agendaDay('inválido', 'UTC'), 'undated'); assert.equal(agendaHour('inválido', 'UTC'), '—');
});
test('filtros de dia, sala e busca por instituição são combinados sem mutar a fonte', () => {
  const input = [activity('a2', '2026-10-06T13:00:00Z'), activity('a1', '2026-10-05T13:00:00Z')];
  const groups = agendaGroups(input, 'UTC', { day: '2026-10-06', space: 's1', query: 'instituicao alfa' });
  assert.equal(groups.length, 1); assert.equal(groups[0].activities[0].id, 'a2'); assert.equal(input[0].id, 'a2');
  assert.equal(agendaGroups(input, 'UTC', { ...filters, query: 'inexistente' }).length, 0);
});
test('agenda busca título, tipo e pessoa sem exigir acentos', () => {
  const input = [activity('a1', '2026-10-05T13:00:00Z')];
  for (const query of ['Imunologia', 'mesa', ' MARINA ', 'auditorio']) assert.equal(agendaGroups(input, 'UTC', { ...filters, query }).length, 1);
});
test('agenda ordena por horário e título e permite filtrar atividades sem espaço', () => {
  const input = [activity('b', '2026-10-05T14:00:00Z'), activity('c', '2026-10-05T13:00:00Z', { title: 'Zeta', spaceId: null, space: null }), activity('a', '2026-10-05T13:00:00Z', { title: 'Alfa' })];
  assert.deepEqual(agendaGroups(input, 'UTC', filters)[0].activities.map((a) => a.id), ['a', 'c', 'b']);
  assert.deepEqual(agendaGroups(input, 'UTC', { ...filters, space: 'unassigned' })[0].activities.map((a) => a.id), ['c']);
});
test('papel científico apresenta função configurada sem inventar convite confirmado', () => {
  assert.equal(agendaRole('OTHER', 'Facilitadora'), 'Facilitadora'); assert.equal(agendaRole('SPEAKER', null), 'Palestrante');
});
const report = (extra = {}) => ({ event: { timeZone: 'America/Sao_Paulo' }, attendanceEnabled: true, registration: { confirmed: 10 }, categories: [{ label: 'Profissionais', registered: 7, present: 3 }, { label: 'Estudantes', registered: 3, present: 1 }], firstCheckInByHour: [{ label: '2026-10-05 09:00', count: 4 }, { label: '2026-10-05 10:00', count: 2 }], scientific: { submissions: [{ status: 'ACCEPTED', count: 2 }, { status: 'ACCEPTED_WITH_CHANGES', count: 1 }, { status: 'UNDER_REVIEW', count: 4 }] }, ...extra });
test('síntese usa somente populações reais e separa aceite de apresentação', () => {
  const insights = postEventInsights(report()); assert.equal(insights[0].value, 'Profissionais'); assert.equal(insights[1].value, '2026-10-05 09:00');
  assert.equal(insights[2].value, '3 de 7'); assert.match(insights[2].detail, /não comprova apresentação/);
});
test('síntese preserva empates em categorias e horários', () => {
  const insights = postEventInsights(report({ categories: [{ label: 'B', registered: 5 }, { label: 'A', registered: 5 }], firstCheckInByHour: [{ label: '09h', count: 4 }, { label: '10h', count: 4 }] }));
  assert.equal(insights[0].value, 'A · B'); assert.equal(insights[1].value, '2 horários empatados');
});
test('módulos ausentes não geram indicadores de presença ou produção científica', () => {
  const insights = postEventInsights(report({ attendanceEnabled: false, scientific: null })); assert.equal(insights.length, 1);
});
test('sem população não inventa categoria líder ou horário de pico', () => {
  assert.deepEqual(postEventInsights(report({ registration: { confirmed: 0 }, categories: [], firstCheckInByHour: [], scientific: null })), []);
});
test('largura dos gráficos contém zero, valores inválidos e excesso sem fabricar taxa', () => {
  assert.equal(reportBarPercent(2, 8), 25); assert.equal(reportBarPercent(0, 0), 0); assert.equal(reportBarPercent(-1, 8), 0);
  assert.equal(reportBarPercent(12, 8), 100); assert.equal(reportBarPercent(NaN, 8), 0);
});
