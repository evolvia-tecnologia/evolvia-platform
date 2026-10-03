import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IntegrationFoundationService } from '../dist/integration-foundation.service.js';
import {
  hashEventApiKey,
  issueEventApiKey,
  normalizeApiKeyLabel,
  normalizeWebhookUrl,
  publicEventUrl,
  registrationConfirmedPayload,
  verifyWebhookSignature,
  websitePresenceSnippet,
  webhookSignatureHeader,
} from '../src/integration-foundation.policy.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('webhook só aceita HTTPS público na porta 443', () => {
  assert.equal(normalizeWebhookUrl('https://hooks.example.com/evolvia'), 'https://hooks.example.com/evolvia');
  assert.equal(normalizeWebhookUrl('https://hooks.example.com:443/evolvia#segredo'), 'https://hooks.example.com/evolvia');
  for (const value of [
    'http://hooks.example.com/evolvia',
    'https://user:secret@hooks.example.com/evolvia',
    'https://hooks.example.com:8443/evolvia',
    'https://localhost/evolvia',
    'https://127.0.0.1/evolvia',
    'https://[::1]/evolvia',
    'https://10.1.1.1/evolvia',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://printer.local/hook',
    'https://vault.internal/hook',
    'not a url',
  ]) {
    assert.throws(() => normalizeWebhookUrl(value), /webhook|HTTPS|endereço|URL|domínio|porta/u, value);
  }
});

test('payload confirmado leva só protocolo e a assinatura confere', () => {
  const payload = registrationConfirmedPayload('del_1', {
    organizationId: 'org_1',
    eventId: 'evt_1',
    reservationId: 'res_1',
    protocol: 'EVO-ABCDEF',
    slug: 'congresso',
  }, '2026-10-03T00:00:00.000Z');
  const serialized = JSON.stringify(payload);
  assert.equal(payload.type, 'registration.confirmed');
  assert.deepEqual(payload.registration, { protocol: 'EVO-ABCDEF' });
  assert.doesNotMatch(serialized, /email|nome|document|organizationId|reservationId/iu);
  const body = serialized;
  const header = webhookSignatureHeader('whsec_test', 1_700_000_000, body);
  assert.match(header, /^v1=[0-9a-f]{64}$/u);
  assert.equal(verifyWebhookSignature('whsec_test', 1_700_000_000, body, header), true);
  assert.equal(verifyWebhookSignature('whsec_test', 1_700_000_000, body, 'v1=00'), false);
  assert.equal(verifyWebhookSignature('whsec_other', 1_700_000_000, body, header), false);
});

test('chave de leitura é mostrável uma vez e o trecho de site não executa HTML', () => {
  const issued = issueEventApiKey();
  assert.match(issued.token, /^evo_[A-Za-z0-9_-]{20,}$/u);
  assert.equal(issued.prefix, issued.token.slice(0, 12));
  assert.equal(issued.keyHash, hashEventApiKey(issued.token));
  assert.equal(issued.keyHash.length, 64);
  assert.equal(normalizeApiKeyLabel('  Painel  interno '), 'Painel interno');
  assert.equal(normalizeApiKeyLabel(''), 'Chave de leitura');
  assert.throws(() => normalizeApiKeyLabel('<script>'), /inválido/u);

  const previous = process.env.EVOLVIA_PUBLIC_BASE_URL;
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example.com/base';
  try {
    assert.equal(publicEventUrl('meu evento'), 'https://eventos.example.com/meu%20evento');
  } finally {
    if (previous === undefined) delete process.env.EVOLVIA_PUBLIC_BASE_URL;
    else process.env.EVOLVIA_PUBLIC_BASE_URL = previous;
  }
  const snippet = websitePresenceSnippet('A & B <script>', 'https://eventos.example.com/a');
  assert.match(snippet, /^<p><a href="https:\/\/eventos\.example\.com\/a">A &amp; B &lt;script&gt;<\/a><\/p>$/u);
  assert.doesNotMatch(snippet, /<script>/u);
});

function foundationService(overrides = {}) {
  const prisma = {
    event: { findUnique: async () => ({ id: 'evt_1', organizationId: 'org_1' }), findFirst: async () => null },
    eventOutboundWebhook: { count: async () => 0, findMany: async () => [], create: async () => ({ id: 'wh_1', url: 'https://hooks.example.com/evolvia', createdAt: new Date('2026-10-03T00:00:00.000Z') }) },
    eventApiKey: { count: async () => 0, findMany: async () => [], findUnique: async () => null, create: async () => null, update: async () => null, updateMany: async () => ({ count: 0 }) },
    eventRegistrationReservation: { count: async () => 0 },
    auditLog: { create: async () => ({}) },
    ...overrides,
  };
  return new IntegrationFoundationService(prisma, { requireRole: async () => ({ role: 'OWNER' }) });
}

test('lista de webhooks não devolve o segredo e a criação mostra o segredo uma vez', async () => {
  let listed;
  const audits = [];
  const service = foundationService({
    eventOutboundWebhook: {
      count: async () => 0,
      findMany: async ({ select }) => { listed = select; return []; },
      create: async ({ data, select }) => {
        assert.equal(select.secret, undefined);
        assert.match(data.secret, /^whsec_/u);
        return { id: 'wh_1', url: data.url, createdAt: new Date('2026-10-03T00:00:00.000Z') };
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return {}; } },
  });
  await service.listWebhooks('user_1', 'evt_1');
  assert.deepEqual(listed, { id: true, url: true, enabled: true, createdAt: true, disabledAt: true });
  const created = await service.createWebhook('user_1', 'evt_1', { url: 'https://hooks.example.com/evolvia' });
  assert.match(created.secret, /^whsec_/u);
  assert.equal(created.url, 'https://hooks.example.com/evolvia');
  assert.deepEqual(audits[0].metadata, { host: 'hooks.example.com' });
  await assert.rejects(() => service.createWebhook('user_1', 'evt_1', { url: 'http://hooks.example.com/evolvia' }), /HTTPS/u);
});

test('entrega assinada acontece uma vez e falha de rede não propaga', async () => {
  const deliveries = [];
  const posts = [];
  const prisma = {
    eventOutboundWebhook: {
      findMany: async () => [{ id: 'wh_1', url: 'https://hooks.example.com/evolvia', secret: 'whsec_test' }],
    },
    eventOutboundWebhookDelivery: {
      create: async ({ data }) => {
        if (deliveries.some((row) => row.webhookId === data.webhookId && row.reservationId === data.reservationId)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'test' });
        }
        const row = { id: 'del_1', ...data };
        deliveries.push(row);
        return row;
      },
      update: async ({ data }) => { Object.assign(deliveries[0], data); return deliveries[0]; },
    },
  };
  const service = new IntegrationFoundationService(prisma, { requireRole: async () => ({}) });
  const notice = { organizationId: 'org_1', eventId: 'evt_1', reservationId: 'res_1', protocol: 'EVO-1', slug: 'congresso' };
  service.usePoster(async (url, body, headers) => {
    posts.push({ url, body, headers });
    return 204;
  });
  await service.notifyRegistrationConfirmed(notice);
  await service.notifyRegistrationConfirmed(notice);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].headers['user-agent'], 'Evolvia-Webhooks/1');
  assert.match(posts[0].headers['evolvia-signature'], /^v1=/u);
  assert.equal(JSON.parse(posts[0].body).registration.protocol, 'EVO-1');
  assert.equal(deliveries[0].status, 'DELIVERED');

  deliveries.length = 0;
  service.usePoster(async () => { throw new Error('rede'); });
  await assert.doesNotReject(() => service.notifyRegistrationConfirmed({ ...notice, reservationId: 'res_2' }));
  assert.equal(deliveries[0].status, 'FAILED');
});

test('leitura pública exige a chave do próprio evento e não devolve cadastro', async () => {
  const issued = issueEventApiKey();
  const updates = [];
  const key = { id: 'key_1', eventId: 'evt_1', organizationId: 'org_1', expiresAt: new Date(Date.now() + 60_000), revokedAt: null };
  const service = foundationService({
    eventApiKey: {
      findUnique: async ({ where }) => (where.keyHash === issued.keyHash ? key : null),
      update: async ({ data }) => { updates.push(data); return {}; },
    },
    event: {
      findUnique: async () => ({ id: 'evt_1', organizationId: 'org_1' }),
      findFirst: async ({ where }) => (where.slug === 'congresso' ? {
        id: 'evt_1', name: 'Congresso', slug: 'congresso', status: 'PUBLISHED', startDate: null, endDate: null, format: 'IN_PERSON', venue: 'Centro',
      } : null),
    },
    eventRegistrationReservation: { count: async () => 4 },
  });
  await assert.rejects(() => service.readPublicEvent('congresso', 'evo_invalida'), (error) => error instanceof UnauthorizedException && error.message === 'Credencial inválida.');
  const revoked = foundationService({
    eventApiKey: { findUnique: async () => ({ ...key, revokedAt: new Date() }) },
  });
  await assert.rejects(
    () => revoked.readPublicEvent('congresso', `Bearer ${issued.token}`),
    (error) => error instanceof UnauthorizedException,
  );
  await assert.rejects(
    () => service.readPublicEvent('outro', `Bearer ${issued.token}`),
    (error) => error instanceof UnauthorizedException && error.message === 'Credencial inválida.',
  );
  const payload = await service.readPublicEvent('congresso', `Bearer ${issued.token}`);
  assert.equal(payload.confirmedRegistrations, 4);
  assert.equal(payload.event.slug, 'congresso');
  assert.equal(JSON.stringify(payload).includes('org_1'), false);
  assert.equal(updates.length, 1);
});

test('operador não configura a fundação', async () => {
  const service = new IntegrationFoundationService(
    { event: { findUnique: async () => ({ id: 'evt_1', organizationId: 'org_1' }) } },
    { requireRole: async () => { throw new NotFoundException('Organização não encontrada.'); } },
  );
  await assert.rejects(
    () => service.listWebhooks('user_op', 'evt_1'),
    (error) => error instanceof NotFoundException && error.message === 'Organização não encontrada.',
  );
});

test('confirmação notifica só depois do commit e o catálogo continua sem mutação', async () => {
  const [reservations, asaas, catalogController, migration, foundation] = await Promise.all([
    read('../src/registration-reservations.service.ts'),
    read('../src/asaas-checkout.service.ts'),
    read('../src/event-integrations.controller.ts'),
    read('../prisma/migrations/20261003231500_integration_foundation/migration.sql'),
    read('../src/integration-foundation.service.ts'),
  ]);
  const reservationNotify = reservations.indexOf('if (notice) await this.webhooks.notifyRegistrationConfirmed(notice);');
  const reservationCommit = reservations.indexOf('TransactionIsolationLevel.Serializable');
  assert.ok(reservationNotify > reservationCommit);
  assert.match(reservations, /notice = null/u);
  const asaasNotify = asaas.indexOf('if (outcome.confirmed) await this.foundation.notifyRegistrationConfirmed');
  const asaasCommit = asaas.lastIndexOf('TransactionIsolationLevel.Serializable', asaasNotify);
  assert.ok(asaasNotify > asaasCommit);
  assert.match(asaas, /if \(confirmed\) await this\.foundation\.notifyRegistrationConfirmed/u);
  assert.doesNotMatch(catalogController, /@(Post|Put|Patch|Delete)\(|fetch\(/u);
  assert.match(catalogController, /connectable: false/u);
  assert.match(catalogController, /somente leitura/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/iu);
  assert.match(foundation, /redirect: 'error'/u);
  assert.match(foundation, /AbortSignal\.timeout\(4_000\)/u);
  assert.doesNotMatch(foundation, /registrationData|billingSnapshot|emailHash/u);
});
