import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationMediaService } from '../dist/event-publication/event-publication-media.service.js';

function png(width = 320, height = 180) {
  const bytes = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

function publication(overrides = {}) {
  return {
    id: 'pub_1',
    organizationId: 'org_a',
    eventId: 'evt_a',
    shortDescription: 'Evento público',
    fullDescription: null,
    publicContactEmail: null,
    publicContactPhone: null,
    logoAssetId: null,
    coverAssetId: null,
    seoTitle: null,
    seoDescription: null,
    socialImageAssetId: null,
    accessibilitySummary: null,
    themeConfig: null,
    revision: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fixture({ current = publication(), membershipError } = {}) {
  const calls = { writes: [], rollbacks: [], assets: [], updates: [], audits: [], membershipScopes: [] };
  const updated = publication({ ...current, revision: current.revision + 1 });
  const tx = {
    $queryRaw: async () => [updated],
    eventMediaAsset: {
      create: async (input) => calls.assets.push(input),
      updateMany: async (input) => calls.updates.push(input),
    },
    auditLog: { create: async (input) => calls.audits.push(input) },
  };
  const prisma = {
    event: { findUnique: async () => ({ id: 'evt_a', organizationId: 'org_a', status: 'SETUP' }) },
    $transaction: async (callback) => callback(tx),
  };
  const authorization = {
    requireMembership: async (_userId, organizationId) => {
      calls.membershipScopes.push(organizationId);
      if (membershipError) throw membershipError;
      return { role: 'OWNER' };
    },
  };
  const repository = {
    lockEventScope: async (_tx, organizationId, eventId) => {
      assert.equal(organizationId, 'org_a');
      assert.equal(eventId, 'evt_a');
      return { id: eventId, organizationId, status: 'SETUP' };
    },
    findByScope: async () => current,
  };
  const storage = {
    write: async (key, bytes) => calls.writes.push({ key, bytes }),
    read: async () => Buffer.from('image'),
    rollbackNewWrite: async (key) => calls.rollbacks.push(key),
  };
  return { service: new EventPublicationMediaService(prisma, authorization, repository, storage), calls };
}

test('upload usa escopo canônico, revisão otimista e auditoria sanitizada', async () => {
  const { service, calls } = fixture();
  const result = await service.upload('user_a', 'evt_a', {
    usage: 'LOGO',
    contentBase64: png(),
    altText: 'Marca do evento',
    decorative: false,
    publicationRevision: 4,
  });

  assert.equal(result.publicationRevision, 5);
  assert.deepEqual(calls.membershipScopes, ['org_a']);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0].key, /^org_a\/evt_a\/[a-f0-9-]+\.png$/);
  assert.equal(calls.assets[0].data.organizationId, 'org_a');
  assert.equal(calls.assets[0].data.eventId, 'evt_a');
  assert.equal(calls.audits.length, 1);
  const serializedAudit = JSON.stringify(calls.audits[0]);
  for (const forbidden of ['checksumSha256', 'storageKey', 'altText', 'contentBase64']) {
    assert.equal(serializedAudit.includes(forbidden), false, `${forbidden} não deve ir para auditoria`);
  }
});

test('substituição é lógica e preserva o arquivo anterior', async () => {
  const { service, calls } = fixture({ current: publication({ coverAssetId: 'asset_old' }) });
  await service.upload('user_a', 'evt_a', {
    usage: 'COVER',
    contentBase64: png(1200, 630),
    altText: null,
    decorative: true,
    publicationRevision: 4,
  });

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].where.id, 'asset_old');
  assert.equal(calls.updates[0].data.state, 'REPLACED');
  assert.equal(calls.rollbacks.length, 0);
  assert.equal(calls.audits[0].data.action, 'event.publication.media_replaced');
});

test('nega IDOR pela organização canônica antes de gravar bytes', async () => {
  const denial = new Error('membership denied');
  const { service, calls } = fixture({ membershipError: denial });
  await assert.rejects(() => service.upload('outsider', 'evt_a', {
    usage: 'LOGO',
    contentBase64: png(),
    altText: 'Marca',
    decorative: false,
    publicationRevision: 4,
  }), denial);
  assert.deepEqual(calls.membershipScopes, ['org_a']);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.audits.length, 0);
});
