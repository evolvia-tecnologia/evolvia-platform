import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationPreviewService } from '../dist/event-publication/event-publication-preview.service.js';

const event = {
  id: 'evt_preview_1',
  organizationId: 'org_preview_1',
  name: 'Congresso em preparação',
  slug: 'congresso-em-preparacao',
  status: 'SETUP',
  format: 'HYBRID',
  startDate: new Date('2026-10-10T12:00:00.000Z'),
  endDate: new Date('2026-10-12T21:00:00.000Z'),
  venue: 'Centro de Convenções',
};

const publication = {
  id: 'pub_preview_1',
  organizationId: event.organizationId,
  eventId: event.id,
  shortDescription: 'Prévia ainda privada.',
  fullDescription: 'Apresentação completa da prévia.',
  publicContactEmail: 'contato@evento.test',
  publicContactPhone: null,
  logoAssetId: null,
  coverAssetId: null,
  seoTitle: 'Título da prévia',
  seoDescription: 'Descrição da prévia',
  socialImageAssetId: null,
  accessibilitySummary: 'Rota acessível informada.',
  themeConfig: { preset: 'DEFAULT', fontScale: 'DEFAULT', contentWidth: 'STANDARD' },
  revision: 4,
  createdAt: new Date('2026-08-15T00:00:00.000Z'),
  updatedAt: new Date('2026-08-15T00:00:00.000Z'),
};

const sections = [
  {
    id: 'section_hidden',
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: publication.id,
    kind: 'TEXT',
    title: 'Oculta',
    enabled: false,
    sortOrder: 0,
    content: { text: 'Não deve aparecer.' },
    canonicalSourceType: null,
    canonicalSourceId: null,
    revision: 2,
  },
  {
    id: 'section_visible',
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: publication.id,
    kind: 'TEXT',
    title: 'Sobre',
    enabled: true,
    sortOrder: 1,
    content: { text: 'Conteúdo visível na prévia.' },
    canonicalSourceType: null,
    canonicalSourceId: null,
    revision: 3,
  },
];

function makePrisma(eventOverride = event) {
  return {
    event: {
      findUnique: async () => eventOverride,
    },
  };
}

function makeRepository(overrides = {}) {
  return {
    findByScope: async () => publication,
    findSectionsByScope: async () => sections,
    ...overrides,
  };
}

test('OWNER em SETUP obtém preview privado com o mesmo contrato minimizado do renderer público', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  let receivedScope = null;
  const repository = makeRepository({
    findSectionsByScope: async (_client, organizationId, eventId, publicationId) => {
      receivedScope = { organizationId, eventId, publicationId };
      return sections;
    },
  });
  const service = new EventPublicationPreviewService(makePrisma(), authorization, repository);

  const preview = await service.getPreview('user_owner', event.id);

  assert.deepEqual(receivedScope, {
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: publication.id,
  });
  assert.equal(preview.event.slug, event.slug);
  assert.equal(preview.sections.length, 1);
  assert.equal(preview.sections[0].title, 'Sobre');

  const serialized = JSON.stringify(preview);
  for (const forbidden of [event.id, event.organizationId, publication.id, 'revision', 'canonicalSourceId']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não pode vazar no preview`);
  }
});

test('preview exige membership no organizationId canônico do evento', async () => {
  let checkedOrganizationId = '';
  const authorization = {
    requireMembership: async (_userId, organizationId) => {
      checkedOrganizationId = organizationId;
      throw new Error('membership negada');
    },
  };
  const service = new EventPublicationPreviewService(makePrisma(), authorization, makeRepository());

  await assert.rejects(() => service.getPreview('user_x', event.id), /membership negada/);
  assert.equal(checkedOrganizationId, event.organizationId);
});

test('VIEWER não recebe preview mesmo conhecendo o eventId', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'VIEWER' }),
  };
  const service = new EventPublicationPreviewService(makePrisma(), authorization, makeRepository());

  await assert.rejects(() => service.getPreview('user_viewer', event.id), /Evento não encontrado/);
});

test('evento CANCELLED não pode ser preparado para preview', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const service = new EventPublicationPreviewService(
    makePrisma({ ...event, status: 'CANCELLED' }),
    authorization,
    makeRepository(),
  );

  await assert.rejects(() => service.getPreview('user_owner', event.id), /Evento não encontrado/);
});
