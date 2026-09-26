import assert from 'node:assert/strict';
import test from 'node:test';
import { EventsService } from '../dist/events.service.js';

function fixture(role, capabilities, permissions = [], personal = false) {
  const prisma = {
    event: { findUnique: async () => ({
      id: 'event_a', name: 'Evento', organizationId: personal ? null : 'org_a', ownerId: 'owner',
      organization: { name: 'Organização' },
      capabilities: capabilities.map((code) => ({ code })),
      operatorAssignments: permissions.length ? [{ permissions }] : [],
    }) },
  };
  const authorization = { requireMembership: async () => ({ role }) };
  return new EventsService(prisma, authorization);
}

test('editor recebe ações operacionais apenas para capabilities ativas', async () => {
  const service = fixture('OWNER', ['credential']);
  const event = await service.get('owner', 'event_a');
  assert.deepEqual(event.operatorPermissions, ['ACCREDITATION']);
});

test('operador mantém somente a própria atribuição no evento', async () => {
  const service = fixture('OPERATOR', ['credential', 'access_control'], ['CHECK_IN']);
  const event = await service.get('operator', 'event_a');
  assert.deepEqual(event.operatorPermissions, ['CHECK_IN']);
});

test('operador sem atribuição não consulta detalhes do evento', async () => {
  const service = fixture('OPERATOR', ['credential', 'access_control']);
  await assert.rejects(() => service.get('operator', 'event_a'), (error) => error?.status === 404);
});

test('evento pessoal legado não anuncia operações indisponíveis e recusa outra conta', async () => {
  const service = fixture('OWNER', ['credential', 'access_control'], [], true);
  const event = await service.get('owner', 'event_a');
  assert.deepEqual(event.operatorPermissions, []);
  await assert.rejects(() => service.get('other', 'event_a'), (error) => error?.status === 404);
});
