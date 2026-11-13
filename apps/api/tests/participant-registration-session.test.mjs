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
