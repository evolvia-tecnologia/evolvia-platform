import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventIntegrationsService } from '../dist/event-integrations.controller.js';
import {
  INTEGRATION_AUTH_TYPES,
  INTEGRATION_AVAILABILITIES,
  INTEGRATION_CATALOG,
  INTEGRATION_CATEGORIES,
} from '../dist/integrations-catalog.js';

const REQUIRED_CODES = [
  'evolvia_public_api',
  'evolvia_webhooks',
  'website_presence',
  'hubspot',
  'rd_station_crm',
  'ploomes',
  'agendor',
  'ramper_pipeline',
  'rd_station_marketing',
  'activecampaign',
  'mailchimp',
  'mautic',
  'ramper_marketing',
  'leadlovers',
  'twilio',
  'slack',
  'linkedin',
  'email_domain',
  'enotas',
  'notazz',
  'omie',
  'conta_azul',
  'nibo',
  'granatum',
  'asaas',
  'ga4',
  'google_ads',
  'gtm',
  'meta_pixel',
  'google_workspace',
  'airtable',
  'notion',
  'monday',
  'jira',
  'todoist',
  'memberkit',
];

const REQUIRED_NAMES = [
  'API pública da Evolvia',
  'Webhooks da Evolvia',
  'Presença em sites',
  'HubSpot',
  'RD Station CRM',
  'Ploomes',
  'Agendor',
  'Ramper Pipeline',
  'RD Station Marketing',
  'ActiveCampaign',
  'Mailchimp',
  'Mautic',
  'Ramper Marketing',
  'Leadlovers',
  'Twilio',
  'Slack',
  'LinkedIn',
  'E-mail por domínio',
  'eNotas',
  'Notazz',
  'Omie',
  'Conta Azul',
  'Nibo',
  'Granatum',
  'Asaas',
  'Google Analytics 4',
  'Google Ads',
  'Google Tag Manager',
  'Pixel da Meta',
  'Google Workspace',
  'Airtable',
  'Notion',
  'Monday.com',
  'Jira',
  'Todoist',
  'MemberKit',
];

const catalogSource = readFileSync(new URL('../src/integrations-catalog.ts', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../src/event-integrations.controller.ts', import.meta.url), 'utf8');

function makeService({ event = null, membership = null } = {}) {
  const prisma = {
    event: {
      findUnique: async ({ where }) => (event && where.id === event.id ? event : null),
    },
    organizationMembership: {
      findUnique: async ({ where }) => {
        const requested = where.organizationId_userId;
        if (
          membership
          && requested.organizationId === membership.organizationId
          && requested.userId === membership.userId
        ) {
          return membership;
        }
        return null;
      },
    },
  };
  return new EventIntegrationsService(prisma, new AuthorizationService(prisma));
}

test('catálogo contém todos os fornecedores obrigatórios uma única vez', () => {
  const codes = INTEGRATION_CATALOG.map((item) => item.code);
  const names = INTEGRATION_CATALOG.map((item) => item.name);

  assert.equal(codes.length, REQUIRED_CODES.length);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual([...codes].sort(), [...REQUIRED_CODES].sort());
  assert.deepEqual([...names].sort(), [...REQUIRED_NAMES].sort());
});

test('categorias, autenticação prevista e disponibilidade são enumerações fechadas', () => {
  assert.deepEqual([...INTEGRATION_CATEGORIES], [
    'PLATFORM', 'CRM', 'MARKETING', 'FINANCE', 'ANALYTICS', 'PRODUCTIVITY', 'COMMUNITY',
  ]);
  assert.deepEqual([...INTEGRATION_AUTH_TYPES], ['OAUTH', 'API_KEY', 'WEBHOOK', 'MANUAL']);
  assert.deepEqual([...INTEGRATION_AVAILABILITIES], ['PLANNED', 'PREPARING']);

  for (const item of INTEGRATION_CATALOG) {
    assert.ok(INTEGRATION_CATEGORIES.includes(item.category), item.code);
    assert.ok(INTEGRATION_AUTH_TYPES.includes(item.authType), item.code);
    assert.ok(INTEGRATION_AVAILABILITIES.includes(item.availability), item.code);
    assert.equal(typeof item.summary, 'string');
    assert.ok(item.summary.trim().length >= 20, item.code);
    assert.ok(item.useCases.length >= 1, item.code);
    assert.ok(item.requirements.length >= 1, item.code);
    assert.ok(item.dataShared.length >= 1, item.code);
    assert.equal(item.documentationUrl, undefined);
  }
});

test('itens de plataforma em preparação e fornecedores externos permanecem planejados', () => {
  const byCode = Object.fromEntries(INTEGRATION_CATALOG.map((item) => [item.code, item]));
  assert.equal(byCode.evolvia_public_api.availability, 'PREPARING');
  assert.equal(byCode.evolvia_webhooks.availability, 'PREPARING');
  assert.equal(byCode.website_presence.availability, 'PREPARING');
  assert.ok(INTEGRATION_CATALOG.filter((item) => item.category !== 'PLATFORM').every((item) => item.availability === 'PLANNED'));
});

test('catálogo não carrega HTML, script, segredo ou URL de fornecedor', () => {
  const serialized = JSON.stringify(INTEGRATION_CATALOG);
  assert.doesNotMatch(serialized, /<script|<iframe|javascript:/iu);
  assert.doesNotMatch(catalogSource, /clientSecret|apiKey|accessToken|password/u);
  assert.doesNotMatch(controllerSource, /fetch\(|axios|https\.request|http\.get/u);
  assert.doesNotMatch(controllerSource, /@(Post|Put|Patch|Delete)\(/u);
});

test('organizador autorizado recebe o catálogo escopado ao evento', async () => {
  const service = makeService({
    event: { id: 'evt_1', name: 'Congresso', organizationId: 'org_1' },
    membership: {
      userId: 'user_1',
      organizationId: 'org_1',
      role: 'OWNER',
      status: 'ACTIVE',
      organization: { id: 'org_1' },
    },
  });

  const payload = await service.list('user_1', 'evt_1');
  assert.deepEqual(payload.event, { id: 'evt_1', name: 'Congresso', organizationId: 'org_1' });
  assert.equal(payload.items.length, REQUIRED_CODES.length);
  assert.ok(payload.items.every((item) => item.connectable === false));
  assert.ok(payload.items.every((item) => item.availabilityLabel === 'Planejada' || item.availabilityLabel === 'Em preparação'));
  assert.equal(payload.categories.length, INTEGRATION_CATEGORIES.length);
  assert.match(payload.guidance.summary, /somente leitura/u);
});

test('evento inexistente, evento sem organização e IDOR devolvem 404 indistinguível', async () => {
  const missingEvent = makeService();
  await assert.rejects(
    () => missingEvent.list('user_1', 'evt_unknown'),
    (error) => error?.status === 404 && error?.message === 'Evento não encontrado.',
  );

  const orphan = makeService({
    event: { id: 'evt_orphan', name: 'Rascunho', organizationId: null },
    membership: { userId: 'user_1', organizationId: 'org_1', role: 'OWNER', status: 'ACTIVE' },
  });
  await assert.rejects(
    () => orphan.list('user_1', 'evt_orphan'),
    (error) => error?.status === 404 && error?.message === 'Evento não encontrado.',
  );

  const foreign = makeService({
    event: { id: 'evt_a', name: 'Evento A', organizationId: 'org_a' },
    membership: {
      userId: 'user_b',
      organizationId: 'org_b',
      role: 'OWNER',
      status: 'ACTIVE',
      organization: { id: 'org_b' },
    },
  });
  await assert.rejects(
    () => foreign.list('user_b', 'evt_a'),
    (error) => error?.status === 404 && error?.message === 'Organização não encontrada.',
  );
});

test('usuário sem papel editor é negado com a mesma resposta minimizada', async () => {
  for (const role of ['OPERATOR', 'VIEWER']) {
    const service = makeService({
      event: { id: 'evt_1', name: 'Congresso', organizationId: 'org_1' },
      membership: {
        userId: 'user_limited',
        organizationId: 'org_1',
        role,
        status: 'ACTIVE',
        organization: { id: 'org_1' },
      },
    });
    await assert.rejects(
      () => service.list('user_limited', 'evt_1'),
      (error) => error?.status === 404 && error?.message === 'Organização não encontrada.',
    );
  }
});

test('membership ausente ou inativa não distingue o motivo do acesso indevido', async () => {
  for (const membership of [
    null,
    {
      userId: 'user_1',
      organizationId: 'org_1',
      role: 'OWNER',
      status: 'SUSPENDED',
      organization: { id: 'org_1' },
    },
    {
      userId: 'user_1',
      organizationId: 'org_1',
      role: 'ADMIN',
      status: 'REMOVED',
      organization: { id: 'org_1' },
    },
  ]) {
    const service = makeService({
      event: { id: 'evt_1', name: 'Congresso', organizationId: 'org_1' },
      membership,
    });
    await assert.rejects(
      () => service.list('user_1', 'evt_1'),
      (error) => error?.status === 404 && error?.message === 'Organização não encontrada.',
    );
  }
});
