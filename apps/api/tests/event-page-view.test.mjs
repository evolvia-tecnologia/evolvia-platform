import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { recordPublicPageView } from '../dist/event-page-view.js';

function prismaFor(event, writes = []) {
  return {
    event: { findUnique: async ({ where }) => where.slug === event?.slug ? event : null },
    $executeRaw: async (statement) => { writes.push(statement); return 1; },
  };
}

test('página publicada soma o dia no fuso do evento e não grava visitante', async () => {
  const writes = [];
  const prisma = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'PUBLISHED', timeZone: 'America/Sao_Paulo' }, writes);
  const result = await recordPublicPageView(prisma, ' Cardiologia ', new Date('2026-10-10T02:30:00.000Z'));
  assert.deepEqual(result, { counted: true });
  const statement = writes[0];
  assert.match(statement.text, /ON CONFLICT \("eventId", "day"\) DO UPDATE/u);
  assert.match(statement.text, /"count" = "EventPublicPageView"\."count" \+ 1/u);
  assert.deepEqual(statement.values.slice(1), ['org-1', 'event-1', '2026-10-09']);
  assert.equal(JSON.stringify(statement.values).includes('ip'), false);
  assert.equal(statement.values.includes('userAgent'), false);
});

test('fuso inválido conta o dia em UTC', async () => {
  const writes = [];
  const prisma = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'PUBLISHED', timeZone: 'not/a-zone' }, writes);
  await recordPublicPageView(prisma, 'cardiologia', new Date('2026-10-10T02:30:00.000Z'));
  assert.equal(writes[0].values[3], '2026-10-10');
});

test('evento em rascunho ou slug inválido não cria visita', async () => {
  const writes = [];
  const draft = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'DRAFT', timeZone: 'UTC' }, writes);
  await assert.rejects(() => recordPublicPageView(draft, 'cardiologia'), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(draft, 'a'), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(draft, 'a'.repeat(81)), (error) => error instanceof NotFoundException);
  assert.equal(writes.length, 0);
});
