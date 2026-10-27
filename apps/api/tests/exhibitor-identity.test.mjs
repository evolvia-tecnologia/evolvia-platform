import assert from 'node:assert/strict';
import test from 'node:test';
import { organizerSupportEmail, organizerSupportWhatsapp } from '../dist/exhibitor-identity.policy.js';
import { ExhibitorIdentityService } from '../dist/exhibitor-identity.service.js';

const events = {
  'feira-a': { id: 'event-a', organizationId: 'org-a', name: 'Feira A', slug: 'feira-a', status: 'PUBLISHED', capabilities: [{ id: 'cap' }] },
  'feira-b': { id: 'event-b', organizationId: 'org-b', name: 'Feira B', slug: 'feira-b', status: 'SETUP', capabilities: [{ id: 'cap' }] },
};
const publications = {
  'event-a': {
    publicContactEmail: ' suporte@feira-a.com.br ', publicContactPhone: '(11) 98888-7777',
    logoAsset: { id: 'logo-a', usage: 'LOGO', state: 'ACTIVE', width: 600, height: 200, storageKey: 'org-a/event-a/aa.png', mimeType: 'image/png' },
  },
  'event-b': { publicContactEmail: null, publicContactPhone: null, logoAsset: null },
};

function fixture(overrides = {}) {
  const lookups = [];
  const prisma = {
    event: { findUnique: async ({ where, select }) => {
      assert.equal(select.capabilities.where.code, 'exhibitor');
      assert.equal(select.capabilities.where.status, 'ACTIVE');
      const event = overrides[where.slug] ?? events[where.slug];
      return event ? { ...event } : null;
    } },
    eventPublication: { findUnique: async ({ where, select }) => {
      lookups.push(where.eventId_organizationId);
      assert.equal(select.taxId, undefined);
      const event = Object.values(events).find((item) => item.id === where.eventId_organizationId.eventId);
      assert.equal(where.eventId_organizationId.organizationId, event.organizationId);
      return publications[event.id];
    } },
  };
  const reads = [];
  const storage = { read: async (key) => { reads.push(key); return Buffer.from('png'); } };
  return { service: new ExhibitorIdentityService(prisma, storage), lookups, reads };
}

test('e-mail do organizador aceita somente endereço simples, sem parâmetros extras no mailto', () => {
  assert.equal(organizerSupportEmail(' Suporte.Evento+expo@feira.com.br '), 'Suporte.Evento+expo@feira.com.br');
  for (const value of [null, '', 'sem-arroba', 'a@b', 'a?cc=x@feira.com', 'a@feira.com?subject=x', 'a@feira.com&bcc=x@y.com',
    'javascript:alert(1)@x.com', 'a b@feira.com', `${'a'.repeat(150)}@feira.com.br`, ['a@b.com']]) {
    assert.equal(organizerSupportEmail(value), null, String(value));
  }
});

test('WhatsApp do organizador vira número internacional apenas com dígitos', () => {
  assert.deepEqual(organizerSupportWhatsapp('(11) 98888-7777'), { number: '5511988887777', label: '(11) 98888-7777' });
  assert.deepEqual(organizerSupportWhatsapp('+55 21 3333-4444'), { number: '552133334444', label: '+55 21 3333-4444' });
  assert.deepEqual(organizerSupportWhatsapp('+351 912 345 678'), { number: '351912345678', label: '+351 912 345 678' });
  assert.deepEqual(organizerSupportWhatsapp('0055 11 98888 7777'), { number: '5511988887777', label: '0055 11 98888 7777' });
  for (const value of [null, '', '1234', '(011) 98888-7777', 'ligue 11 98888-7777', '11 98888-7777?text=oi',
    'https://wa.me/5511988887777', '+0 11 98888 7777', '+55 11 98888 7777 0000 1111', '12345678901234']) {
    assert.equal(organizerSupportWhatsapp(value), null, String(value));
  }
});

test('identidade pública devolve logo do próprio evento e somente canais públicos válidos', async () => {
  const { service, lookups } = fixture();
  const identity = await service.forSlug('feira-a');
  assert.deepEqual(identity, {
    event: { name: 'Feira A', slug: 'feira-a' },
    logo: { url: '/api/public/events/feira-a/exhibitor-identity/logo?v=logo-a', width: 600, height: 200 },
    support: { email: 'suporte@feira-a.com.br', whatsapp: { number: '5511988887777', label: '(11) 98888-7777' } },
  });
  assert.equal(JSON.stringify(identity).includes('storageKey'), false);
  assert.deepEqual(lookups, [{ eventId: 'event-a', organizationId: 'org-a' }]);
});

test('alternar evento não reaproveita logo nem contatos e ausência de cadastro fica vazia', async () => {
  const { service } = fixture();
  await service.forSlug('feira-a');
  const identity = await service.forSlug('feira-b');
  assert.deepEqual(identity, { event: { name: 'Feira B', slug: 'feira-b' }, logo: null, support: { email: null, whatsapp: null } });
});

test('logo substituída, removida ou de outro uso não é exposta', async () => {
  for (const asset of [{ state: 'REPLACED' }, { state: 'REMOVED' }, { usage: 'COVER' }, { width: 0 }]) {
    const original = publications['event-a'].logoAsset;
    publications['event-a'].logoAsset = { ...original, ...asset };
    try {
      const { service, reads } = fixture();
      assert.equal((await service.forSlug('feira-a')).logo, null);
      if (!('width' in asset)) await assert.rejects(service.logo('feira-a'), (error) => error.getStatus() === 404);
      assert.deepEqual(reads, []);
    } finally {
      publications['event-a'].logoAsset = original;
    }
  }
});

test('evento em rascunho, cancelado, sem área do expositor ou com slug inválido não revela identidade', async () => {
  for (const override of [{ status: 'DRAFT' }, { status: 'CANCELLED' }, { capabilities: [] }, { organizationId: null }]) {
    const { service, lookups } = fixture({ 'feira-a': { ...events['feira-a'], ...override } });
    await assert.rejects(service.forSlug('feira-a'), (error) => error.getStatus() === 404);
    await assert.rejects(service.logo('feira-a'), (error) => error.getStatus() === 404);
    assert.deepEqual(lookups, []);
  }
  const { service } = fixture();
  for (const slug of ['inexistente', 'Feira-A', '../feira-a', 'ab', ['feira-a']]) {
    await assert.rejects(service.forSlug(slug), (error) => error.getStatus() === 404);
  }
});

test('arquivo da logo é lido pela chave vinculada ao evento do slug', async () => {
  const { service, reads } = fixture();
  const result = await service.logo('feira-a');
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual(reads, ['org-a/event-a/aa.png']);
});
