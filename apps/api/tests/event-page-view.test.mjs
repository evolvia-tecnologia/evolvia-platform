import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, NotFoundException } from '@nestjs/common';
import {
  PUBLIC_PAGE_VIEW_LIMIT,
  PUBLIC_PAGE_VIEW_MAX_SLUGS,
  PUBLIC_PAGE_VIEW_WINDOW_MS,
  recordPublicPageView,
  resetPublicPageViewBudgetForTests,
} from '../dist/event-page-view.js';

function prismaFor(event, writes = []) {
  return {
    event: { findUnique: async ({ where }) => where.slug === event?.slug ? event : null },
    $executeRaw: async (statement) => { writes.push(statement); return 1; },
  };
}

const published = { id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'PUBLISHED', timeZone: 'America/Sao_Paulo' };

test('página publicada soma o dia no fuso do evento e não grava visitante', async () => {
  resetPublicPageViewBudgetForTests();
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
  resetPublicPageViewBudgetForTests();
  const writes = [];
  const prisma = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'PUBLISHED', timeZone: 'not/a-zone' }, writes);
  await recordPublicPageView(prisma, 'cardiologia', new Date('2026-10-10T02:30:00.000Z'));
  assert.equal(writes[0].values[3], '2026-10-10');
});

test('evento em rascunho ou slug inválido não cria visita', async () => {
  resetPublicPageViewBudgetForTests();
  const writes = [];
  const draft = prismaFor({ id: 'event-1', organizationId: 'org-1', slug: 'cardiologia', status: 'DRAFT', timeZone: 'UTC' }, writes);
  await assert.rejects(() => recordPublicPageView(draft, 'cardiologia'), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(draft, 'a'), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(draft, 'a'.repeat(81)), (error) => error instanceof NotFoundException);
  assert.equal(writes.length, 0);
});

test('o teto da janela recusa a escrita e a janela seguinte volta a contar', async () => {
  resetPublicPageViewBudgetForTests();
  const writes = [];
  let lookups = 0;
  const prisma = {
    event: {
      findUnique: async () => {
        lookups += 1;
        return published;
      },
    },
    $executeRaw: async (statement) => {
      writes.push(statement);
      return 1;
    },
  };
  const start = new Date('2026-10-10T03:00:00.000Z');
  for (let index = 0; index < PUBLIC_PAGE_VIEW_LIMIT; index += 1) {
    assert.deepEqual(await recordPublicPageView(prisma, 'cardiologia', start), { counted: true });
  }
  await assert.rejects(() => recordPublicPageView(prisma, 'cardiologia', start), (error) => error instanceof HttpException && error.getStatus() === 429);
  assert.equal(writes.length, PUBLIC_PAGE_VIEW_LIMIT);
  assert.equal(lookups, PUBLIC_PAGE_VIEW_LIMIT);

  const otherWrites = [];
  const other = prismaFor({ ...published, id: 'event-2', slug: 'ortopedia' }, otherWrites);
  await recordPublicPageView(other, 'ortopedia', start);
  assert.equal(otherWrites.length, 1);

  const later = new Date(start.getTime() + PUBLIC_PAGE_VIEW_WINDOW_MS);
  await recordPublicPageView(prisma, 'cardiologia', later);
  assert.equal(writes.length, PUBLIC_PAGE_VIEW_LIMIT + 1);
  assert.equal(lookups, PUBLIC_PAGE_VIEW_LIMIT + 1);
});

test('pedidos concorrentes no limite não gravam a sobra', async () => {
  resetPublicPageViewBudgetForTests();
  const writes = [];
  let lookups = 0;
  const prisma = {
    event: {
      findUnique: async () => {
        lookups += 1;
        return published;
      },
    },
    $executeRaw: async (statement) => {
      writes.push(statement);
      return 1;
    },
  };
  const start = new Date('2026-10-10T03:00:00.000Z');
  const settled = await Promise.allSettled(Array.from(
    { length: PUBLIC_PAGE_VIEW_LIMIT + 8 },
    () => recordPublicPageView(prisma, 'cardiologia', start),
  ));
  const rejected = settled.filter((result) => result.status === 'rejected');
  assert.equal(writes.length, PUBLIC_PAGE_VIEW_LIMIT);
  assert.equal(lookups, PUBLIC_PAGE_VIEW_LIMIT);
  assert.equal(rejected.length, 8);
  for (const result of rejected) {
    assert.equal(result.reason instanceof HttpException && result.reason.getStatus() === 429, true);
  }
});

test('slug novo além do mapa cheio não consulta o banco', async () => {
  resetPublicPageViewBudgetForTests();
  let lookups = 0;
  const prisma = {
    event: {
      findUnique: async () => {
        lookups += 1;
        return null;
      },
    },
    $executeRaw: async () => {
      throw new Error('não deveria gravar');
    },
  };
  const start = new Date('2026-10-10T03:00:00.000Z');
  for (let index = 0; index < PUBLIC_PAGE_VIEW_MAX_SLUGS; index += 1) {
    const slug = `ev-${String(index).padStart(4, '0')}-aaaa`;
    await assert.rejects(() => recordPublicPageView(prisma, slug, start), (error) => error instanceof NotFoundException);
  }
  const lookupsBefore = lookups;
  await assert.rejects(
    () => recordPublicPageView(prisma, 'evento-extra-cheio', start),
    (error) => error instanceof HttpException && error.getStatus() === 429,
  );
  assert.equal(lookups, lookupsBefore);

  const later = new Date(start.getTime() + PUBLIC_PAGE_VIEW_WINDOW_MS);
  await assert.rejects(() => recordPublicPageView(prisma, 'evento-extra-cheio', later), (error) => error instanceof NotFoundException);
  assert.equal(lookups, lookupsBefore + 1);
});
