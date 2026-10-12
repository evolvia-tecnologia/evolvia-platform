import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificGuestsService } from '../dist/scientific-guests.service.js';

function fixture() {
  const event = {
    id: 'event-1', organizationId: 'org-1', profileCode: 'SCIENTIFIC_EVENT', status: 'PUBLISHED',
    ownerId: 'editor-1', name: 'Congresso', organization: { id: 'org-1', name: 'Org', slug: 'org', status: 'ACTIVE' },
  };
  const guest = {
    id: 'guest-1', eventId: event.id, organizationId: event.organizationId, personId: 'person-1',
    participationType: 'SPEAKER', customRoleLabel: null,
  };
  const updates = [];
  const audits = [];
  const prisma = {
    event: { findUnique: async () => event },
    scientificGuestProfile: { findFirst: async () => guest },
    $transaction: async (callback) => callback({
      scientificGuestProfile: { update: async (input) => { updates.push(input); return { ...guest, ...input.data }; } },
      auditLog: { create: async (input) => { audits.push(input.data); } },
    }),
  };
  const service = new ScientificGuestsService(
    prisma,
    { requireRole: async () => {} },
    { assertFoundationMutable: () => {} },
  );
  service.get = async () => ({ reloaded: true });
  return { service, updates, audits };
}

test('foto https é gravada e a auditoria não leva o endereço', async () => {
  const { service, updates, audits } = fixture();
  assert.deepEqual(await service.update('editor-1', 'event-1', 'guest-1', {
    portraitUrl: ' https://cdn.example/ana.jpg ',
  }), { reloaded: true });
  assert.equal(updates[0].data.portraitUrl, 'https://cdn.example/ana.jpg');
  assert.equal(updates[0].where.id, 'guest-1');
  assert.deepEqual(audits[0].metadata, { changedFields: [], portraitUpdated: true });
  assert.equal(JSON.stringify(audits).includes('cdn.example'), false);
  assert.equal(audits[0].organizationId, 'org-1');
  assert.equal(audits[0].eventId, 'event-1');
});

test('campo vazio remove a foto pública', async () => {
  const { service, updates, audits } = fixture();
  await service.update('editor-1', 'event-1', 'guest-1', { portraitUrl: '   ' });
  assert.equal(updates[0].data.portraitUrl, null);
  assert.equal(JSON.stringify(audits).includes('http'), false);
});

test('endereço inseguro não grava foto nem auditoria', async () => {
  for (const portraitUrl of ['http://cdn.example/ana.jpg', 'https://user:senha@cdn.example/ana.jpg', 'javascript:alert(1)']) {
    const { service, updates, audits } = fixture();
    await assert.rejects(
      service.update('editor-1', 'event-1', 'guest-1', { portraitUrl }),
      (error) => error.status === 400 && /https/u.test(error.message),
    );
    assert.equal(updates.length, 0);
    assert.equal(audits.length, 0);
  }
});
