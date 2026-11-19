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
  INTEGRATION_OBJECTIVES,
  INTEGRATION_RECIPE_DIRECTIONS,
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
  return new EventIntegrationsService(prisma, new AuthorizationService(prisma), {
    configurationStatus: () => ({ state: 'NOT_CONFIGURED', environment: 'sandbox', message: 'Configuração incompleta.' }),
  });
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
  assert.deepEqual([...INTEGRATION_AVAILABILITIES], ['PLANNED', 'PREPARING', 'READY']);
  assert.deepEqual([...INTEGRATION_OBJECTIVES], [
    'ISSUE_INVOICES_AND_FINANCE',
    'SEND_LEADS_TO_CRM',
    'AUTOMATE_COMMUNICATION',
    'MEASURE_CAMPAIGNS',
    'ORGANIZE_WORK_AND_DATA',
    'PUBLISH_OR_INTEGRATE_OWN_SYSTEMS',
    'CREATE_COMMUNITY',
  ]);
  assert.deepEqual([...INTEGRATION_RECIPE_DIRECTIONS], [
    'PLATFORM_TO_PROVIDER', 'PROVIDER_TO_PLATFORM', 'PLATFORM_TO_OWN_SYSTEM',
  ]);

  for (const item of INTEGRATION_CATALOG) {
    assert.ok(INTEGRATION_CATEGORIES.includes(item.category), item.code);
    assert.ok(INTEGRATION_AUTH_TYPES.includes(item.authType), item.code);
    assert.ok(INTEGRATION_AVAILABILITIES.includes(item.availability), item.code);
    assert.equal(typeof item.summary, 'string');
    assert.ok(item.summary.trim().length >= 20, item.code);
    assert.ok(item.useCases.length >= 1, item.code);
    assert.ok(item.requirements.length >= 1, item.code);
    assert.ok(item.dataShared.length >= 1, item.code);
    assert.ok(item.objectives.length >= 1, item.code);
    assert.ok(item.recipes.length >= 1, item.code);
    assert.ok(item.objectives.every((code) => INTEGRATION_OBJECTIVES.includes(code)), item.code);
    for (const entry of item.recipes) {
      assert.ok(entry.trigger.trim().length >= 8, item.code);
      assert.ok(entry.action.trim().length >= 8, item.code);
      assert.ok(INTEGRATION_RECIPE_DIRECTIONS.includes(entry.direction), item.code);
    }
    assert.equal(item.documentationUrl, undefined);
  }
});

test('itens de plataforma estão disponíveis e fornecedores externos permanecem planejados', () => {
  const byCode = Object.fromEntries(INTEGRATION_CATALOG.map((item) => [item.code, item]));
  assert.equal(byCode.evolvia_public_api.availability, 'READY');
  assert.equal(byCode.evolvia_webhooks.availability, 'READY');
  assert.equal(byCode.website_presence.availability, 'READY');
  assert.equal(byCode.evolvia_public_api.foundation, 'api');
  assert.equal(byCode.evolvia_webhooks.foundation, 'webhook');
  assert.equal(byCode.website_presence.foundation, 'presence');
  assert.ok(INTEGRATION_CATALOG.filter((item) => item.category !== 'PLATFORM').every((item) => item.availability === 'PLANNED' && item.foundation === null));
  for (const code of ['evolvia_public_api', 'evolvia_webhooks', 'website_presence']) {
    assert.ok(byCode[code].requirements.every((entry) => !/ainda não disponível/u.test(entry)), code);
  }
  assert.ok(INTEGRATION_CATALOG.filter((item) => item.foundation === null).every((item) => item.requirements.some((entry) => /ainda não disponível/u.test(entry))));
});

test('catálogo não carrega HTML, script, segredo ou URL de fornecedor', () => {
  const serialized = JSON.stringify(INTEGRATION_CATALOG);
  assert.doesNotMatch(serialized, /<script|<iframe|javascript:/iu);
  assert.doesNotMatch(catalogSource, /clientSecret|apiKey|accessToken|password/u);
  assert.doesNotMatch(controllerSource, /fetch\(|axios|https\.request|http\.get/u);
  assert.doesNotMatch(controllerSource, /@(Post|Put|Patch|Delete)\(/u);
});

test('taxonomia não classifica produtividade ou comunidade como CRM', () => {
  const byCode = Object.fromEntries(INTEGRATION_CATALOG.map((item) => [item.code, item]));
  for (const code of ['airtable', 'jira', 'notion', 'monday', 'todoist', 'google_workspace']) {
    assert.equal(byCode[code].category, 'PRODUCTIVITY', code);
    assert.ok(!byCode[code].objectives.includes('SEND_LEADS_TO_CRM'), code);
    assert.ok(byCode[code].objectives.includes('ORGANIZE_WORK_AND_DATA'), code);
  }
  assert.equal(byCode.memberkit.category, 'COMMUNITY');
  assert.ok(!byCode.memberkit.objectives.includes('SEND_LEADS_TO_CRM'));
  assert.ok(byCode.memberkit.objectives.includes('CREATE_COMMUNITY'));
  assert.deepEqual(
    INTEGRATION_CATALOG.filter((item) => item.category === 'CRM').map((item) => item.code).sort(),
    ['agendor', 'hubspot', 'ploomes', 'ramper_pipeline', 'rd_station_crm'],
  );
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
  assert.ok(payload.items.every((item) => item.availabilityLabel === 'Planejada' || item.availabilityLabel === 'Em preparação' || item.availabilityLabel === 'Disponível'));
  assert.equal(payload.items.filter((item) => item.foundation).length, 3);
  assert.equal(payload.items.find((item) => item.code === 'evolvia_webhooks').foundation, 'webhook');
  assert.equal(payload.categories.length, INTEGRATION_CATEGORIES.length);
  assert.equal(payload.objectives.length, INTEGRATION_OBJECTIVES.length);
  assert.deepEqual(payload.objectives.map((entry) => entry.label), [
    'Emitir notas e organizar finanças',
    'Enviar leads ao CRM',
    'Automatizar comunicação',
    'Medir campanhas e conversões',
    'Organizar trabalho e dados',
    'Publicar ou integrar sistemas próprios',
    'Criar comunidade/área de membros',
  ]);
  assert.ok(payload.items.every((item) => item.objectives.length >= 1 && item.recipes.length >= 1));
  assert.ok(payload.items.every((item) => item.recipes.every((entry) => (
    entry.statusLabel === item.availabilityLabel
    && typeof entry.trigger === 'string'
    && typeof entry.action === 'string'
    && typeof entry.directionLabel === 'string'
    && INTEGRATION_RECIPE_DIRECTIONS.includes(entry.direction)
  ))));
  assert.match(payload.guidance.summary, /somente leitura/u);
  assert.equal(payload.items.reduce((total, item) => total + item.recipes.length, 0), 38);
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

