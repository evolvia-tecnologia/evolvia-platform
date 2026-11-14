import assert from 'node:assert/strict';
import test from 'node:test';
import { ParticipantDashboardService } from '../dist/participant-dashboard.service.js';
import { participantHash } from '../dist/participant-area-policy.js';

const protocol = 'EVO-1234567890ABCDEF';
const document = 'TEST12345';
function fixture() {
  const sessions = [];
  const prisma = { eventRegistrationReservation: { async findFirst({ where }) {
    assert.equal(where.event.status, 'PUBLISHED');
    return where.protocol === protocol && where.identityHash === participantHash(document)
      ? { event: { slug: 'evento-qa' } } : null;
  } } };
  const area = { async createSession(slug, access) {
    sessions.push({ slug, access });
    return { accessToken: 'sessao-da-inscricao' };
  } };
  return { service: new ParticipantDashboardService(prisma, area), sessions };
}
test('abre apenas a inscrição comprovada, sem depender da entrega de e-mail', async () => {
  const { service, sessions } = fixture();
  const result = await service.openRegistration({ protocol, identityDocument: 'test-12345' });
  assert.deepEqual(result, { slug: 'evento-qa', accessToken: 'sessao-da-inscricao' });
  assert.deepEqual(sessions, [{ slug: 'evento-qa', access: { protocol, identityDocument: document } }]);
});
for (const [name, input] of [
  ['documento divergente', { protocol, identityDocument: 'OTHER123' }],
  ['protocolo divergente', { protocol: 'EVO-0234567890ABCDEF', identityDocument: document }],
  ['protocolo ausente', { identityDocument: document }],
]) {
  test(name, async () => {
    const { service, sessions } = fixture();
    await assert.rejects(service.openRegistration(input), error => error.getStatus() === 401);
    assert.equal(sessions.length, 0);
  });
}

test('a conta sem e-mail confirmado entra e abre a própria inscrição na homologação', async (t) => {
  const key = 'EVOLVIA_PUBLIC_BASE_URL';
  const previous = process.env[key];
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  process.env[key] = 'https://homologacao.evolviatecnologia.com';
  const rows = [];
  const event = { name: 'Evento QA', slug: 'evento-qa', startDate: null, endDate: null, venue: null, profileCode: null };
  const reservation = { id: 'r', eventId: 'e', organizationId: 'o', event, status: 'CONFIRMED' };
  const prisma = {
    auditLog: { findMany: async () => [] },
    user: { findUnique: async () => ({ email: 'qa@example.invalid', name: 'QA', emailVerifiedAt: null }) },
    eventRegistrationReservation: { findMany: async ({ where }) => {
      rows.push(where);
      assert.equal(where.emailHash, participantHash('qa@example.invalid'));
      assert.equal(where.event.status, 'PUBLISHED');
      return where.AND[0].OR.some(rule => rule.event?.ownerId === 'owner')
        && (!where.event.slug || where.event.slug === event.slug) ? [reservation] : [];
    } },
  };
  const service = new ParticipantDashboardService(prisma, { createSessionForReservation: async (...ids) => {
    assert.deepEqual(ids, ['e', 'o', 'r']);
    return { accessToken: 'test-session' };
  } });
  assert.equal((await service.get('owner')).events[0].name, event.name);
  assert.equal((await service.enterEvent('owner', event.slug)).accessToken, 'test-session');
  await assert.rejects(service.enterEvent('other', event.slug), err => err.getStatus() === 404);
  await assert.rejects(service.enterEvent('owner', 'another'), err => err.getStatus() === 404);
  delete process.env[key];
  assert.deepEqual((await service.get('owner')).events, []);
  assert.deepEqual(rows.at(-1).AND[0].OR, [{ waitlistEntry: { userId: 'owner' } }]);
});

test('a inscrição criada pela conta em evento de terceiro reabre só para a conta que a criou', async () => {
  const event = { slug: 'evento-externo', name: 'Evento externo', startDate: null, endDate: null };
  const service = new ParticipantDashboardService({
    user: { findUnique: async () => ({ name: 'QA', email: 'qa@example.invalid', emailVerifiedAt: null }) },
    auditLog: { findMany: async ({ where }) => {
      assert.equal(where.metadata.equals, 'participant_account');
      return where.actorUserId === 'participant' ? [{ entityId: 'r-externa' }] : [];
    } },
    eventRegistrationReservation: { findMany: async ({ where }) => {
      assert.equal(where.emailHash, participantHash('qa@example.invalid'));
      if (where.event.slug && where.event.slug !== event.slug) return [];
      return where.AND[0].OR.some(scope => scope.id?.in.includes('r-externa'))
        ? [{ id: 'r-externa', organizationId: 'o', eventId: 'e', event, status: 'CONFIRMED' }] : [];
    } },
  }, { createSessionForReservation: async (...ids) => ids });
  assert.equal((await service.get('participant')).events[0].slug, event.slug);
  assert.deepEqual(await service.enterEvent('participant', event.slug), ['e', 'o', 'r-externa']);
  await assert.rejects(service.enterEvent('outra-conta', event.slug), err => err.getStatus() === 404);
});

test('confirmar e-mail preserva a inscrição e recusa outra conta no evento de terceiro', async () => {
  const event = { slug: 'evento-externo', name: 'Evento externo', startDate: null, endDate: null };
  let verified = false;
  const service = new ParticipantDashboardService({
    participantIdentityLink: { findMany: async () => [] },
    user: { findUnique: async () => ({ name: 'QA', email: 'qa@example.invalid', emailVerifiedAt: verified ? new Date() : null }) },
    auditLog: { findMany: async ({ where }) => {
      assert.equal(where.metadata.equals, 'participant_account');
      return where.actorUserId === 'participant' ? [{ entityId: 'r-externa' }] : [];
    } },
    eventRegistrationReservation: { findMany: async ({ where }) => {
      if (where.emailHash !== undefined) assert.equal(where.emailHash, participantHash('qa@example.invalid'));
      else assert.deepEqual(where.AND[0].OR, [{ id: { in: ['r-externa'] } }]);
      if (where.event.slug && where.event.slug !== event.slug) return [];
      return where.AND[0].OR.some(scope => scope.id?.in.includes('r-externa'))
        ? [{ id: 'r-externa', organizationId: 'o', eventId: 'e', event, status: 'CONFIRMED' }] : [];
    } },
  }, { createSessionForReservation: async (...ids) => ids });
  assert.equal((await service.get('participant')).events[0].slug, event.slug);
  assert.deepEqual(await service.enterEvent('participant', event.slug), ['e', 'o', 'r-externa']);
  verified = true;
  assert.equal((await service.get('participant')).events[0].slug, event.slug);
  assert.deepEqual(await service.enterEvent('participant', event.slug), ['e', 'o', 'r-externa']);
  await assert.rejects(service.enterEvent('outra-conta', event.slug), err => err.getStatus() === 404);
});
