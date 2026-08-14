import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicEventPublicationService } from '../dist/event-publication/public-event-publication.service.js';

function publishedEvent() {
  return {
    id: 'evt_public_1',
    name: 'Congresso Evolvia',
    slug: 'congresso-evolvia',
    status: 'PUBLISHED',
    format: 'HYBRID',
    startDate: new Date('2026-10-10T12:00:00.000Z'),
    endDate: new Date('2026-10-12T21:00:00.000Z'),
    venue: 'Centro de Convenções',
    eventPublication: {
      shortDescription: 'Descrição curta',
      fullDescription: 'Descrição completa',
      publicContactEmail: 'contato@evento.test',
      publicContactPhone: null,
      seoTitle: 'Congresso Evolvia',
      seoDescription: 'Evento técnico-científico',
      accessibilitySummary: 'Rota acessível disponível.',
      themeConfig: { preset: 'DEFAULT' },
    },
    eventPublicationSections: [
      {
        kind: 'TEXT',
        title: 'Sobre',
        enabled: true,
        sortOrder: 0,
        content: { text: 'Conteúdo público.' },
      },
    ],
  };
}

test('consulta pública filtra PUBLISHED no banco e seleciona somente campos permitidos', async () => {
  let receivedQuery;
  const prisma = {
    event: {
      findFirst: async (query) => {
        receivedQuery = query;
        return publishedEvent();
      },
    },
  };

  const service = new PublicEventPublicationService(prisma);
  const result = await service.getBySlug('congresso-evolvia');

  assert.ok(result);
  assert.deepEqual(receivedQuery.where, { slug: 'congresso-evolvia', status: 'PUBLISHED' });
  assert.equal(receivedQuery.select.organizationId, undefined);
  assert.equal(receivedQuery.select.ownerId, undefined);
  assert.equal(receivedQuery.select.createdById, undefined);
  assert.equal(receivedQuery.select.eventPublication.select.revision, undefined);
  assert.equal(receivedQuery.select.eventPublicationSections.select.id, undefined);

  const serialized = JSON.stringify(result);
  for (const forbidden of ['organizationId', 'ownerId', 'createdById', 'revision', 'publicationId', 'canonicalSourceId']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não deve aparecer na resposta pública`);
  }
});

test('evento ausente ou não elegível retorna null sem fabricar resposta', async () => {
  const prisma = { event: { findFirst: async () => null } };
  const service = new PublicEventPublicationService(prisma);
  assert.equal(await service.getBySlug('evento-inexistente'), null);
});
