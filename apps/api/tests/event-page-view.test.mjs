import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { recordPublicPageView } from '../dist/event-page-view.js';

function prismaFor(event, writes = []) {
  return {
    event: { findUnique: async ({ where }) => where.slug === event?.slug ? event : null },
    eventPublicPageView: {
      upsert: async (query) => { writes.push(query); return query.create; },
    },
  };
}

test('página publicada soma o dia no fuso do evento e não grava visitante', async () => {
  const writes = [];
  const prisma = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'PUBLISHED', timeZone: 'America/Sao_Paulo' }, writes);
  const result = await recordPublicPageView(prisma, ' Cardiologia ', new Date('2026-10-10T02:30:00.000Z'));
  assert.deepEqual(result, { counted: true });
  assert.equal(writes[0].create.day, '2026-10-09');
  assert.equal(writes[0].create.count, 1);
  assert.equal(writes[0].update.count.increment, 1);
  assert.equal(JSON.stringify(writes[0]).includes('ip'), false);
  assert.equal(writes[0].create.organizationId, 'org-1');
});

test('evento em rascunho ou slug inválido não cria visita', async () => {
  const writes = [];
  const draft = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'DRAFT', timeZone: 'UTC' }, writes);
  await assert.rejects(() => recordPublicPageView(draft, 'cardiologia'), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(draft, 'a'), (error) => error instanceof NotFoundException);
  assert.equal(writes.length, 0);
});
