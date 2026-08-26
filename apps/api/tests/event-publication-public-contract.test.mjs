import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPreviewEventDto, buildPublicEventDto } from '../dist/event-publication/event-publication.public-contract.js';

const canonicalEvent = {
  id: 'evt_public_1',
  name: 'Congresso Evolvia',
  slug: 'congresso-evolvia',
  status: 'PUBLISHED',
  format: 'HYBRID',
  startDate: new Date('2026-10-10T12:00:00.000Z'),
  endDate: new Date('2026-10-12T21:00:00.000Z'),
  timeZone: 'America/Sao_Paulo',
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
  themeConfig: {
    preset: 'DEFAULT',
    fontScale: 'DEFAULT',
    contentWidth: 'STANDARD',
    primaryColor: '#FDE047',
    accentColor: '#111827',
  },
};

const sections = [
  {
    id: 'internal_section_disabled',
    organizationId: 'internal_org',
    eventId: canonicalEvent.id,
    publicationId: 'internal_publication',
    kind: 'HIGHLIGHT',
    title: 'Destaque oculto',
    enabled: false,
    sortOrder: 0,
    content: { text: 'Conteúdo oculto.' },
    canonicalSourceType: null,
    canonicalSourceId: null,
    revision: 4,
  },
  {
    id: 'internal_section_about',
    organizationId: 'internal_org',
    eventId: canonicalEvent.id,
    publicationId: 'internal_publication',
    kind: 'TEXT',
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
    kind: 'CANONICAL_REFERENCE',
    title: 'Atividade em destaque',
    enabled: true,
    sortOrder: 1,
    content: { label: 'Atividade científica' },
    canonicalSourceType: 'SCIENTIFIC_ACTIVITY',
    canonicalSourceId: 'activity_public_1',
    revision: 2,
  },
];

const media = [{
  usage: 'SOCIAL_SHARE',
  mimeType: 'image/webp',
  byteSize: 42000,
  width: 1200,
  height: 630,
  altText: 'Pessoas participando do congresso',
  decorative: false,
  updatedAt: new Date('2026-08-25T18:00:00.000Z'),
  storageKey: 'internal_org/internal_event/internal_asset.webp',
  checksumSha256: 'hash-interno',
  organizationId: 'internal_org',
  url: '/api/public/events/congresso-evolvia/media/SOCIAL_SHARE',
}];

test('não produz DTO público para evento que ainda não está PUBLISHED', () => {
  for (const status of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'SUSPENDED', 'FINISHED', 'CANCELLED']) {
    const dto = buildPublicEventDto({ ...canonicalEvent, status }, publication, sections);
    assert.equal(dto, null, `status ${status} não pode gerar DTO público final`);
  }
});

test('preview pode representar rascunho autorizado sem relaxar a trava do contrato público', () => {
  const draft = { ...canonicalEvent, status: 'SETUP' };
  const preview = buildPreviewEventDto(draft, publication, sections);
  const publicDto = buildPublicEventDto(draft, publication, sections);

  assert.equal(publicDto, null);
  assert.equal(preview.event.slug, canonicalEvent.slug);
  assert.equal(preview.sections.length, 2);
  assert.deepEqual(Object.keys(preview.event).sort(), [
    'endDate',
    'format',
    'name',
    'slug',
    'startDate',
    'timeZone',
    'venue',
  ]);

  const serialized = JSON.stringify(preview);
  for (const forbidden of [canonicalEvent.id, 'organizationId', 'publicationId', 'canonicalSourceId', 'revision']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não deve aparecer no preview`);
  }
});

test('DTO público não contém tenant, IDs internos, revisão, auditoria nem dados do Wizard', () => {
  const dto = buildPublicEventDto(canonicalEvent, publication, sections, media);
  assert.ok(dto);

  assert.deepEqual(Object.keys(dto.event).sort(), [
    'endDate',
    'format',
    'name',
    'slug',
    'startDate',
    'timeZone',
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
  assert.deepEqual(dto.publication.themeConfig, {
    preset: 'DEFAULT',
    fontScale: 'DEFAULT',
    contentWidth: 'STANDARD',
    primaryColor: '#FDE047',
    accentColor: '#111827',
    onPrimaryColor: '#000000',
    onAccentColor: '#FFFFFF',
  });
  assert.equal(dto.media.socialShare?.url, media[0].url);
  assert.equal(dto.media.logo, null);
  assert.deepEqual(Object.keys(dto.media.socialShare).sort(), [
    'altText', 'decorative', 'height', 'mimeType', 'url', 'usage', 'width',
  ]);

  const serialized = JSON.stringify(dto);
  for (const forbidden of [
    canonicalEvent.id,
    'organizationId',
    'publicationId',
    'canonicalSourceId',
    'revision',
    'audit',
    'wizard',
    'byteSize',
    'storageKey',
    'checksumSha256',
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
  assert.deepEqual(dto.sections.map((section) => section.kind), ['CANONICAL_REFERENCE', 'TEXT']);
  assert.deepEqual(Object.keys(dto.sections[0]).sort(), ['content', 'kind', 'sortOrder', 'title']);
});

test('evento publicado sem agregado editorial continua retornando somente a base canônica pública', () => {
  const dto = buildPublicEventDto(canonicalEvent, null);
  assert.ok(dto);
  assert.equal(dto.event.slug, canonicalEvent.slug);
  assert.equal(dto.publication.shortDescription, null);
  assert.equal(dto.publication.accessibilitySummary, null);
  assert.deepEqual(dto.sections, []);
  assert.deepEqual(dto.media, { logo: null, cover: null, socialShare: null });
});


test('preview e público preservam o mesmo timezone canônico sem alterar os instantes UTC', () => {
  const preview = buildPreviewEventDto(canonicalEvent, publication, sections);
  const published = buildPublicEventDto(canonicalEvent, publication, sections);
  assert.ok(published);
  assert.equal(preview.event.timeZone, 'America/Sao_Paulo');
  assert.equal(published.event.timeZone, preview.event.timeZone);
  assert.equal(published.event.startDate.toISOString(), '2026-10-10T12:00:00.000Z');
});
