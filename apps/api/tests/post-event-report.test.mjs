import assert from 'node:assert/strict';
import test from 'node:test';
import { PostEventReportAccumulator, ageBandAtEvent, reportingTimeZone, reportFields } from '../dist/post-event-report-policy.js';
import { RegistrationFormsService } from '../dist/registration-forms.service.js';

const sex = { id: 'sex-field', code: 'sex', label: 'Sexo', type: 'SELECT', enabled: true, options: [{ id: 'female', label: 'Feminino' }, { id: 'male', label: 'Masculino' }] };
const birth = { id: 'birth-field', code: 'birth_date', label: 'Nascimento', type: 'DATE', enabled: true, sensitive: true };
const education = { id: 'edu-field', code: 'education_level', label: 'Escolaridade', type: 'TEXT', enabled: true };
const record = (data = {}) => ({ status: 'CONFIRMED', expiresAt: null, categoryId: 'cat-a', category: { name: 'Categoria A' }, finalPriceCents: 1000, registrationData: { sex: 'female', birth_date: '2000-10-10', education_level: 'Superior' }, registrationFormVersion: 1, checkIn: { checkedInAt: new Date('2026-10-10T01:30:00Z') }, checkout: { status: 'PAID', amountCents: 1000 }, ...data });
function accumulator(fields = [sex, birth, education], versions = new Map([[1, fields]])) { return new PostEventReportAccumulator(fields, versions, '2026-10-10', 'America/Sao_Paulo', new Date('2026-10-11T12:00:00Z')); }

test('relatórios seguem campos habilitados e não exportam identificação, contatos ou texto sensível', () => {
  const a = accumulator([sex, { ...birth, enabled: false }, education, { code: 'email', label: 'Email', type: 'EMAIL', enabled: true }, { code: 'accessibility', label: 'Acessibilidade', type: 'TEXTAREA', sensitive: true, enabled: true }]);
  a.add(record({ registrationData: { sex: 'female', email: 'private@example.com', accessibility: 'diagnóstico privado', full_name: 'Pessoa privada' } }));
  const report = a.finish();
  assert.deepEqual(report.fields.map((f) => f.code), ['sex', 'education_level']);
  assert.doesNotMatch(JSON.stringify(report), /private@example|diagnóstico|Pessoa privada/);
  assert.equal(report.fields[1].buckets[0].label, 'Não informado');
});

test('calcula a idade no dia do evento e valida aniversários e datas civis', () => {
  assert.equal(ageBandAtEvent('2000-10-10', '2025-10-09'), '18 a 24 anos');
  assert.equal(ageBandAtEvent('2000-10-10', '2025-10-10'), '25 a 34 anos');
  assert.equal(ageBandAtEvent('2026-02-31', '2026-10-10'), 'Data inválida');
  assert.equal(ageBandAtEvent('2027-01-01', '2026-10-10'), 'Data inválida');
  assert.equal(ageBandAtEvent('', '2026-10-10'), 'Não informado');
  assert.equal(ageBandAtEvent('2000-10-10', null), 'Data do evento não definida');
  assert.equal(reportingTimeZone('not/a-zone'), 'UTC');
});

test('versões, condições e categorias distinguem ausente, não coletado e não aplicável', () => {
  const conditional = { ...education, appliesToCategoryIds: ['cat-a'], condition: { fieldId: 'sex-field', operator: 'EQUALS', value: 'female' } };
  const a = accumulator([sex, conditional], new Map([[1, [sex, conditional]], [2, [sex]]]));
  a.add(record({ registrationData: { sex: 'female' } }));
  a.add(record({ registrationFormVersion: 2 }));
  a.add(record({ categoryId: 'cat-b' }));
  const field = a.finish().fields[1];
  assert.equal(field.eligible, 1); assert.equal(field.notCollected, 1); assert.equal(field.notApplicable, 1);
  assert.equal(field.buckets[0].label, 'Não informado');
});

test('totais confirmados, status efetivo, pagamento e primeiro credenciamento preservam denominadores', () => {
  const a = accumulator();
  a.add(record()); a.add(record({ finalPriceCents: 0, checkout: null, checkIn: null }));
  a.add(record({ status: 'PENDING_PAYMENT', expiresAt: new Date('2026-10-01T12:00:00Z') }));
  a.add(record({ status: 'PENDING_PAYMENT', expiresAt: new Date('2026-10-20T12:00:00Z') }));
  a.add(record({ status: 'CANCELLED' }));
  const report = a.finish();
  assert.deepEqual(report.registration, { confirmed: 2, present: 1, absent: 1, pending: 1, expired: 1, cancelled: 1, attendancePercent: 50 });
  assert.equal(report.payment.receivedCents, 1000); assert.equal(report.payment.exempt, 1);
  assert.deepEqual(report.firstCheckInByDay, [{ label: '2026-10-09', count: 1 }]);
  assert.deepEqual(report.firstCheckInByHour, [{ label: '2026-10-09 22:00', count: 1 }]);
  assert.equal(report.categories.reduce((n, b) => n + b.registered, 0), 2);
});

test('opções múltiplas não duplicam a pessoa na mesma opção e usam rótulo da versão coletada', () => {
  const field = { code: 'workshops', id: 'workshops', label: 'Oficinas', type: 'CHECKBOX', options: [{ id: 'a', label: 'Oficina A' }, { id: 'b', label: 'Oficina B' }] };
  const a = accumulator([field]); a.add(record({ registrationData: { workshops: ['a', 'a', 'b'] } }));
  const result = a.finish().fields[0]; assert.equal(result.eligible, 1); assert.equal(result.multiple, true);
  assert.deepEqual(result.buckets.map((b) => b.registered), [1, 1]);
});

function fixture(denied = false, capabilities = [], profile = 'SCIENTIFIC_EVENT') {
  const calls = []; const queries = [];
  const scoped = (name, result) => async (query) => { queries.push({ name, query }); return result; };
  const tx = {
    eventRegistrationForm: { findUnique: scoped('form', { fields: [sex, birth], revision: 2, publishedVersion: 1 }) },
    eventRegistrationFormVersion: { findMany: scoped('versions', [{ version: 1, schema: [sex, birth] }]) },
    eventCapability: { findMany: scoped('capabilities', capabilities.map((code) => ({ code }))) },
    eventRegistrationReservation: { findMany: scoped('reservations', [record({ id: 'r-a' })]) },
    scientificSubmission: { groupBy: scoped('scientific', [{ status: 'ACCEPTED', _count: { _all: 1 } }]) },
    scientificProgramActivity: { count: scoped('activities', 1) },
  };
  const event = { id: 'event-a', organizationId: 'org-a', name: 'Congresso A', profileCode: profile, status: 'FINISHED', startDate: new Date('2026-10-10T12:00:00Z'), endDate: null, timeZone: 'America/Sao_Paulo', registrationMode: 'FREE' };
  const prisma = { event: { findUnique: async () => event }, $transaction: async (fn, options) => { calls.push(options); return fn(tx); } };
  const authorization = { requireRole: async (actor, org, roles) => { assert.equal(org, 'org-a'); assert.deepEqual(roles, ['OWNER', 'ADMIN', 'MANAGER']); if (denied) throw new Error('forbidden'); } };
  return { service: new RegistrationFormsService(prisma, authorization, {}, {}), calls, queries };
}

test('serviço real autoriza antes das consultas e exige o escopo completo em todas as leituras', async () => {
  const f = fixture(false, ['scientific_submission']); const report = await f.service.postEventReport('actor', 'event-a');
  assert.equal(f.calls[0].isolationLevel, 'RepeatableRead');
  for (const { name, query } of f.queries) {
    if (name === 'form') assert.deepEqual(query.where.eventId_organizationId, { eventId: 'event-a', organizationId: 'org-a' });
    else if (name === 'capabilities') { assert.equal(query.where.eventId, 'event-a'); assert.equal(query.where.event.organizationId, 'org-a'); assert.equal(query.where.status, 'ACTIVE'); }
    else assert.deepEqual(query.where, { eventId: 'event-a', organizationId: 'org-a' });
  }
  assert.equal(report.scientific.submissions[0].count, 1); assert.equal(report.payment, null);
  assert.doesNotMatch(JSON.stringify(report), /registrationData|reservationId|identityHash|protocol/);
});

test('acesso negado não consulta ficha ou inscrições; módulo desabilitado não gera relatório científico', async () => {
  const denied = fixture(true); await assert.rejects(() => denied.service.postEventReport('other', 'event-a'), /forbidden/); assert.equal(denied.queries.length, 0); assert.equal(denied.calls.length, 0);
  const f = fixture(); const report = await f.service.postEventReport('actor', 'event-a'); assert.equal(report.scientific, null); assert.equal(f.queries.some((q) => q.name === 'scientific'), false);
});

test('as seis famílias compartilham a ficha, e grupos adicionais dependem dos módulos ativos', async () => {
  for (const profile of ['SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION', 'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER']) {
    const f = fixture(false, ['credential', 'payment'], profile);
    const report = await f.service.postEventReport('actor', 'event-a');
    assert.equal(report.event.profileCode, profile); assert.equal(report.attendanceEnabled, true);
    assert.equal(report.payment.paid, 1); assert.equal(report.scientific, null);
    assert.deepEqual(report.fields.map((field) => field.code), ['sex', 'birth_date']);
  }
});

test('ficha inválida sem ID não participa dos relatórios nem encadeia condições', () => {
  assert.deepEqual(reportFields([sex, null, { ...education, id: undefined }, { ...education, id: '' }, { ...education, id: ' ' }, { ...education, id: 12 }]), [sex]);
  const fields = reportFields([sex, { ...education, id: undefined }]);
  const a = accumulator(fields);
  a.add(record());
  assert.deepEqual(a.finish().fields.map((field) => field.code), ['sex']);
});
test('hora de primeiro credenciamento mantém meia-noite no fuso configurado', () => {
  const a = accumulator();
  a.add(record({ checkIn: { checkedInAt: new Date('2026-10-10T03:30:00Z') } }));
  assert.deepEqual(a.finish().firstCheckInByHour, [{ label: '2026-10-10 00:00', count: 1 }]);
});
