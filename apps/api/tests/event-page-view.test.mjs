import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, NotFoundException } from '@nestjs/common';
import {
  PUBLIC_PAGE_VIEW_LIMIT,
  PUBLIC_PAGE_VIEW_MAX_SLUGS,
  PUBLIC_PAGE_VIEW_LOOKUP_LIMIT,
  PUBLIC_PAGE_VIEW_WINDOW_MS,
  recordPublicPageView,
  resetPublicPageViewBudgetForTests,
  reservePublicPageView,
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
  for (let index = 0; index < PUBLIC_PAGE_VIEW_LIMIT + 1; index += 1) {
    await assert.rejects(() => recordPublicPageView(draft, 'cardiologia'), (error) => error instanceof NotFoundException);
  }
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

test('pedidos concorrentes de evento confirmado recusam a sobra antes de consultar', async () => {
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
  await recordPublicPageView(prisma, 'cardiologia', start);
  const settled = await Promise.allSettled(Array.from(
    { length: PUBLIC_PAGE_VIEW_LIMIT - 1 + 8 },
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

test('descobertas concorrentes consultam sob a cota global e não gravam além da cota do evento', async () => {
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
  assert.equal(lookups, PUBLIC_PAGE_VIEW_LIMIT + 8);
  assert.equal(rejected.length, 8);
  for (const result of rejected) {
    assert.equal(result.reason instanceof HttpException && result.reason.getStatus() === 429, true);
  }
});

test('orçamento de consultas desconhecidas recusa sem consultar e recupera na próxima janela', async () => {
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
  for (let index = 0; index < PUBLIC_PAGE_VIEW_LOOKUP_LIMIT; index += 1) {
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

test('slugs inexistentes não ocupam cotas dos eventos publicados', async () => {
  resetPublicPageViewBudgetForTests();
  const start = new Date('2026-10-10T03:00:00.000Z');
  let queries = 0;
  const prisma = {
    event: { findUnique: async () => { queries += 1; return null; } },
    $executeRaw: async () => { throw new Error('não deveria gravar'); },
  };
  for (let index = 0; index < PUBLIC_PAGE_VIEW_LOOKUP_LIMIT; index += 1) {
    await assert.rejects(() => recordPublicPageView(prisma, `inexistente-${index}`, start), (error) => error instanceof NotFoundException);
  }
  assert.equal(queries, PUBLIC_PAGE_VIEW_LOOKUP_LIMIT);
  // A consulta de descoberta esgotou; as cotas por evento permanecem disponíveis.
  for (let index = 0; index < PUBLIC_PAGE_VIEW_MAX_SLUGS; index += 1) {
    assert.doesNotThrow(() => reservePublicPageView(`validado-${index}`, start));
  }
});

test('evento já confirmado continua contando quando consultas desconhecidas esgotam', async () => {
  resetPublicPageViewBudgetForTests();
  const start = new Date('2026-10-10T03:00:00.000Z');
  const writes = [];
  const prisma = prismaFor(published, writes);
  await recordPublicPageView(prisma, published.slug, start);
  for (let index = 1; index < PUBLIC_PAGE_VIEW_LOOKUP_LIMIT; index += 1) {
    await assert.rejects(() => recordPublicPageView(prisma, `inexistente-${index}`, start), (error) => error instanceof NotFoundException);
  }
  await assert.rejects(() => recordPublicPageView(prisma, 'inexistente-extra', start), (error) => error instanceof HttpException && error.getStatus() === 429);
  await recordPublicPageView(prisma, published.slug, start);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].values[2], published.id);
});

test('mapa cheio de eventos publicados recusa outro sem gravar e recupera na próxima janela', async () => {
  resetPublicPageViewBudgetForTests();
  const writes = [];
  let lookups = 0;
  const prisma = {
    event: { findUnique: async ({ where }) => { lookups += 1; return { ...published, id: where.slug, slug: where.slug }; } },
    $executeRaw: async (statement) => { writes.push(statement); return 1; },
  };
  const start = new Date('2026-10-10T03:00:00.000Z');
  // Slugs confirmados previamente não consomem a cota de descoberta.
  for (let index = 0; index < PUBLIC_PAGE_VIEW_MAX_SLUGS; index += 1) {
    reservePublicPageView(`validado-${index}`, start);
  }
  await assert.rejects(() => recordPublicPageView(prisma, 'novo-publicado', start), (error) => error instanceof HttpException && error.getStatus() === 429);
  assert.equal(lookups, 1);
  assert.equal(writes.length, 0);
  await recordPublicPageView(prisma, 'novo-publicado', new Date(start.getTime() + PUBLIC_PAGE_VIEW_WINDOW_MS));
  assert.equal(writes.length, 1);
});
