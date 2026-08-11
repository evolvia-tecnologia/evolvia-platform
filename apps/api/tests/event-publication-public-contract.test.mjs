import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicEventDto } from '../dist/event-publication/event-publication.public-contract.js';

const canonicalEvent = {
  id: 'evt_public_1',
  name: 'Congresso Evolvia',
  slug: 'congresso-evolvia',
  status: 'PUBLISHED',
  format: 'HYBRID',
  startDate: new Date('2026-10-10T12:00:00.000Z'),
  endDate: new Date('2026-10-12T21:00:00.000Z'),
  venue: 'Centro de Convenções',
};

const publication = {
  shortDescription: 'Descrição curta',
  fullDescription: 'Descrição completa',
  publicContactEmail: 'contato@evento.test',
  publicContactPhone: '+55 11 99999-9999',
  seoTitle: 'Congresso Evolvia',
  seoDescription: 'Evento técnico-científico',
  accessibilitySummary: 'O local possui rota acessível.',
  themeConfig: { accentToken: 'brand' },
};

const sections = [
  {
    id: 'internal_section_disabled',
    organizationId: 'internal_org',
    eventId: canonicalEvent.id,
    publicationId: 'internal_publication',
    kind: 'FAQ',
    title: 'Perguntas frequentes',
    enabled: false,
    sortOrder: 0,
    content: { items: [{ question: 'Oculta?', answer: 'Sim.' }] },
    canonicalSourceType: null,
    canonicalSourceId: null,
    revision: 4,
  },
  {
    id: 'internal_section_about',
    organizationId: 'internal_org',
    eventId: canonicalEvent.id,
    publicationId: 'internal_publication',
    kind: 'ABOUT',
    title: 'Sobre o evento',
    enabled: true,
    sortOrder: 2,
    content: { text: 'Conteúdo público.' },
    canonicalSourceType: null,
    canonicalSourceId: null,
    revision: 3,
  },
  {
    id: 'internal_section_location',
    organizationId: 'internal_org',
    eventId: canonicalEvent.id,
    publicationId: 'internal_publication',
    kind: 'LOCATION',
    title: 'Local',
    enabled: true,
    sortOrder: 1,
    content: { text: 'Centro de Convenções' },
    canonicalSourceType: 'EVENT',
    canonicalSourceId: canonicalEvent.id,
    revision: 2,
  },
];

test('não produz DTO público para evento que ainda não está PUBLISHED', () => {
  for (const status of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'SUSPENDED', 'FINISHED', 'CANCELLED']) {
    const dto = buildPublicEventDto({ ...canonicalEvent, status }, publication, sections);
    assert.equal(dto, null, `status ${status} não pode gerar DTO público final`);
  }
});

test('DTO público não contém tenant, revisão, auditoria nem dados internos do Wizard', () => {
  const dto = buildPublicEventDto(canonicalEvent, publication, sections);
  assert.ok(dto);

  assert.deepEqual(Object.keys(dto.event).sort(), [
    'endDate',
    'format',
    'id',
    'name',
    'slug',
    'startDate',
    'venue',
  ]);

  assert.deepEqual(Object.keys(dto.publication).sort(), [
    'accessibilitySummary',
    'fullDescription',
    'publicContactEmail',
    'publicContactPhone',
    'seoDescription',
    'seoTitle',
    'shortDescription',
    'themeConfig',
  ]);

  const serialized = JSON.stringify(dto);
  for (const forbidden of [
    'organizationId',
    'publicationId',
    'canonicalSourceId',
    'revision',
    'audit',
    'wizard',
    'updatedAt',
    'createdAt',
    'internal_section_',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não deve aparecer no DTO público`);
  }
});

test('contrato público filtra seções desabilitadas e preserva ordem editorial', () => {
  const dto = buildPublicEventDto(canonicalEvent, publication, sections);
  assert.ok(dto);
  assert.equal(dto.sections.length, 2);
  assert.deepEqual(dto.sections.map((section) => section.kind), ['LOCATION', 'ABOUT']);
  assert.deepEqual(Object.keys(dto.sections[0]).sort(), ['content', 'kind', 'sortOrder', 'title']);
});

test('evento publicado sem agregado editorial continua retornando somente a base canônica pública', () => {
  const dto = buildPublicEventDto(canonicalEvent, null);
  assert.ok(dto);
  assert.equal(dto.event.slug, canonicalEvent.slug);
  assert.equal(dto.publication.shortDescription, null);
  assert.equal(dto.publication.accessibilitySummary, null);
  assert.deepEqual(dto.sections, []);
});
