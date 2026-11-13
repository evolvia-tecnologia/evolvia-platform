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
