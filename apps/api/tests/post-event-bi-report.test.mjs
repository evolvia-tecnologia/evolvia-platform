import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationFormsService } from '../dist/registration-forms.service.js';
import { RegistrationFormsController } from '../dist/registration-forms.controller.js';
import { AuthGuard } from '../dist/auth.guard.js';
import { postEventBiReport } from '../dist/post-event-bi-report.js';

function fixture(capabilities = ['credential', 'payment', 'scientific_submission']) {
  const reads = [];
  const read = (name, result) => async query => { reads.push({ name, query }); return result; };
  const tx = {
    eventRegistrationForm: { findUnique: read('form', { fields: [], revision: 1, publishedVersion: 1 }) },
    eventRegistrationFormVersion: { findMany: read('versions', []) },
    eventCapability: { findMany: read('capabilities', capabilities.map(code => ({ code }))) },
    eventPublicPageView: { findMany: read('visits', [{ day: '2026-10-10', count: 4 }]) },
    scientificSubmission: { groupBy: read('scientific', [{ status: 'ACCEPTED', _count: { _all: 2 } }]) },
    scientificProgramActivity: { count: read('activities', 3) },
    eventRegistrationReservation: { findMany: read('reservations', [{ id: 'private-reservation', status: 'CONFIRMED', expiresAt: null, categoryId: 'private-category', category: { name: 'Pessoa privada' }, finalPriceCents: 1200, registrationData: { email: 'private@example.test', full_name: 'Pessoa privada' }, registrationFormVersion: 1, checkIn: null, checkout: { status: 'PAID', amountCents: 1200, paidAt: new Date('2026-10-10T12:00:00Z') } }]) },
  };
  const prisma = {
    event: { findUnique: async ({ where }) => ({ id: where.id, organizationId: where.id === 'event-a' ? 'org-a' : 'org-b', name: 'Nome privado', profileCode: 'SCIENTIFIC_EVENT', status: 'FINISHED', startDate: null, endDate: null, timeZone: 'America/Sao_Paulo', registrationMode: 'FREE' }) },
    $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(tx); },
  };
  const authorization = { requireRole: async (actor, org, roles) => {
    assert.deepEqual(roles, ['OWNER', 'ADMIN', 'MANAGER']);
    if (actor !== 'actor-test' || org !== 'org-a') throw Error('forbidden');
  } };
  return { reads, service: new RegistrationFormsService(prisma, authorization, {}, {}) };
}

test('API BI lê snapshot autorizado do evento e projeta apenas agregados estáveis', async () => {
  const f = fixture();
  const result = await f.service.postEventBiReport('actor-test', 'event-a');
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'eventId', 'generatedAt', 'timeZone', 'rows']);
  assert.equal(result.schemaVersion, 1); assert.equal(result.eventId, 'event-a');
  assert.equal(result.rows.find(r => r.metric === 'payment.received').value, 1200);
  assert.equal(result.rows.find(r => r.metric === 'payment.received').unit, 'BRL_cents');
  assert.equal(result.rows.find(r => r.metric === 'scientific.submissions').dimension, 'ACCEPTED');
  assert.doesNotMatch(JSON.stringify(result), /private|Pessoa|Nome privado|@|registrationData|categoryId|personId|organizationId/);
  for (const { name, query } of f.reads) {
    if (name === 'form') assert.deepEqual(query.where.eventId_organizationId, { eventId: 'event-a', organizationId: 'org-a' });
    else if (name === 'capabilities') assert.equal(query.where.event.organizationId, 'org-a');
    else assert.deepEqual(query.where, { eventId: 'event-a', organizationId: 'org-a' });
  }
});

test('operador e outra organização são recusados antes de ler relatórios', async () => {
  for (const [actor, eventId] of [['operator', 'event-a'], ['actor-test', 'event-b']]) {
    const f = fixture(); await assert.rejects(f.service.postEventBiReport(actor, eventId), /forbidden/);
    assert.equal(f.reads.length, 0);
  }
});

test('módulos ausentes não viram zero e campos arbitrários não entram no BI', async () => {
  const f = fixture([]); const result = await f.service.postEventBiReport('actor-test', 'event-a');
  assert.ok(!result.rows.some(r => /^(payment|attendance|scientific)\./.test(r.metric)));
  const projection = postEventBiReport({ event: { id: 'e', timeZone: 'UTC' }, generatedAt: 'now', registration: { confirmed: 1, pending: 0, expired: 0, cancelled: 0 }, attendanceEnabled: false, payment: null, scientific: { submissions: [{ status: 'private@example.test', count: 3 }], plannedActivities: null }, visits: { total: 1, byDay: [{ label: 'private@example.test', count: 1 }] }, fields: [{ label: 'Pessoa privada' }] });
  assert.doesNotMatch(JSON.stringify(projection), /private|Pessoa/);
});

test('somente GET autenticado, sem cache compartilhado nem autenticação em URL', async () => {
  const handler = RegistrationFormsController.prototype.postEventBiReport;
  assert.equal(Reflect.getMetadata('path', handler), 'post-event-report/bi');
  assert.equal(Reflect.getMetadata('method', handler), 0);
  assert.ok(Reflect.getMetadata('__headers__', handler).some(h => h.name === 'Cache-Control' && h.value === 'private, no-store'));
  let verified = 0;
  const guard = new AuthGuard({ verifyAsync: async () => { verified++; return { sub: 'actor-test', email: 'actor@evento.test' }; } });
  const request = { headers: {}, query: { token: 'fake-token' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  await assert.rejects(guard.canActivate(context), e => e.getStatus() === 401); assert.equal(verified, 0);
  request.headers.authorization = 'Bearer fake'; assert.equal(await guard.canActivate(context), true);
  assert.equal(request.user.id, 'actor-test');
  const expired = new AuthGuard({ verifyAsync: async () => { throw Error('expired'); } });
  await assert.rejects(expired.canActivate(context), e => e.getStatus() === 401);
});
