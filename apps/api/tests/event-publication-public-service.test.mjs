import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationPublicService } from '../dist/event-publication/event-publication-public.service.js';

function createPrisma({ total = 0, events = [] } = {}) {
  const calls = { count: [], findMany: [] };
  const prisma = {
    event: {
      count: async (args) => {
        calls.count.push(args);
        return total;
      },
      findMany: async (args) => {
        calls.findMany.push(args);
        return events;
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  return { prisma, calls };
}

test('descoberta pública consulta exclusivamente eventos PUBLISHED e minimiza o resultado', async () => {
  const { prisma, calls } = createPrisma({
    total: 1,
    events: [{
      name: 'Congresso Evolvia',
      slug: 'congresso-evolvia',
      eventType: 'Congresso ou evento científico',
      profileCode: 'SCIENTIFIC_EVENT',
      format: 'HYBRID',
      startDate: new Date('2026-10-10T12:00:00.000Z'),
      endDate: new Date('2026-10-12T21:00:00.000Z'),
      timeZone: 'America/Sao_Paulo',
      venue: 'Centro de Convenções',
      estimatedAudience: 1200,
      eventPublication: { shortDescription: 'Descrição pública' },
    }],
  });
  const service = new EventPublicationPublicService(prisma);

  const result = await service.discover({
    query: '  Congresso  ',
    format: 'HYBRID',
    profileCode: 'SCIENTIFIC_EVENT',
    from: '2026-10-01',
    page: Number.NaN,
    pageSize: 999,
  });

  assert.equal(calls.count.length, 1);
  assert.equal(calls.findMany.length, 1);
  assert.equal(calls.count[0].where.status, 'PUBLISHED');
  assert.equal(calls.count[0].where.format, 'HYBRID');
  assert.equal(calls.count[0].where.profileCode, 'SCIENTIFIC_EVENT');
  assert.deepEqual(calls.count[0].where.AND[0], {
    OR: [
      { endDate: { gte: new Date('2026-10-01T00:00:00.000Z') } },
      { endDate: null },
    ],
  });
  assert.deepEqual(calls.count[0].where.AND[1].OR.slice(0, 3), [
    { name: { contains: 'Congresso', mode: 'insensitive' } },
    { venue: { contains: 'Congresso', mode: 'insensitive' } },
    { eventType: { contains: 'Congresso', mode: 'insensitive' } },
  ]);
  assert.equal(calls.count[0].where.OR, undefined);
  assert.equal(calls.findMany[0].skip, 0);
  assert.equal(calls.findMany[0].take, 24);
  assert.deepEqual(calls.findMany[0].orderBy, [{ startDate: 'asc' }, { createdAt: 'desc' }]);
  assert.deepEqual(calls.findMany[0].select, {
    name: true,
    slug: true,
    eventType: true,
    profileCode: true,
    format: true,
    startDate: true,
    endDate: true,
    timeZone: true,
    venue: true,
    estimatedAudience: true,
    eventPublication: { select: { shortDescription: true } },
  });
  assert.deepEqual(result, {
    items: [{
      name: 'Congresso Evolvia',
      slug: 'congresso-evolvia',
      eventType: 'Congresso ou evento científico',
      profileCode: 'SCIENTIFIC_EVENT',
      format: 'HYBRID',
      startDate: new Date('2026-10-10T12:00:00.000Z'),
      endDate: new Date('2026-10-12T21:00:00.000Z'),
      timeZone: 'America/Sao_Paulo',
      venue: 'Centro de Convenções',
      estimatedAudience: 1200,
      shortDescription: 'Descrição pública',
    }],
    page: 1,
    pageSize: 24,
    total: 1,
    totalPages: 1,
  });
});

test('descoberta pública pagina de forma determinística e não aplica filtros ausentes', async () => {
  const { prisma, calls } = createPrisma({ total: 26, events: [] });
  const service = new EventPublicationPublicService(prisma);

  const result = await service.discover({ page: 3, pageSize: 10 });

  assert.deepEqual(calls.count[0].where, { status: 'PUBLISHED' });
  assert.equal(calls.findMany[0].skip, 20);
  assert.equal(calls.findMany[0].take, 10);
  assert.deepEqual(calls.findMany[0].orderBy, [{ startDate: 'desc' }, { createdAt: 'desc' }]);
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 10);
  assert.equal(result.total, 26);
  assert.equal(result.totalPages, 3);
});

test('descoberta histórica usa término como corte e mostra os realizados mais recentes primeiro', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);

  await service.discover({ until: '2026-10-01' });

  assert.deepEqual(calls.count[0].where, {
    status: 'PUBLISHED',
    AND: [{ endDate: { lt: new Date('2026-10-01T00:00:00.000Z') } }],
  });
  assert.deepEqual(calls.findMany[0].orderBy, [{ startDate: 'desc' }, { createdAt: 'desc' }]);
});

test('descoberta pública ignora data inválida em vez de fabricar intervalo', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);

  await service.discover({ from: '2026-02-31', until: 'data-inválida' });

  assert.deepEqual(calls.count[0].where, { status: 'PUBLISHED' });
});

test('busca pública limita termos excessivos antes de chegar ao banco', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);
  const longQuery = `  ${'x'.repeat(180)}  `;

  await service.discover({ query: longQuery });

  assert.equal(calls.count[0].where.AND[0].OR[0].name.contains.length, 120);
  assert.equal(calls.count[0].where.AND[0].OR[1].venue.contains.length, 120);
});

test('descoberta mantém publicado sem data de término e ignora área ou região desconhecida', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);

  await service.discover({ from: '2026-10-04', area: 'script', region: 'ZZ' });

  assert.deepEqual(calls.count[0].where.AND, [{
    OR: [
      { endDate: { gte: new Date('2026-10-04T00:00:00.000Z') } },
      { endDate: null },
    ],
  }]);
});

test('área de negócios alcança o perfil corporativo e a região usa o local publicado', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);

  await service.discover({ area: 'negocios', region: 'SP' });

  const [area, region] = calls.count[0].where.AND;
  assert.equal(area.OR.some((clause) => clause.profileCode?.in?.includes('CORPORATE_TRAINING')), true);
  assert.equal(region.OR.some((clause) => clause.venue?.contains === 'São Paulo'), true);
  assert.equal(JSON.stringify(region).includes('"Para"'), false);
});

test('região de Mato Grosso não absorve Mato Grosso do Sul', async () => {
  const { prisma, calls } = createPrisma();
  const service = new EventPublicationPublicService(prisma);

  await service.discover({ region: 'MT' });

  const region = calls.count[0].where.AND[0];
  assert.equal(region.AND[0].OR.some((clause) => clause.venue?.contains === 'Mato Grosso'), true);
  assert.deepEqual(region.AND[1], { NOT: { venue: { contains: 'Mato Grosso do Sul', mode: 'insensitive' } } });
});

test('índice do sitemap usa a atualização pública mais recente sem expor metadados internos', async () => {
  const eventUpdatedAt = new Date('2026-08-15T03:40:00.000Z');
  const publicationUpdatedAt = new Date('2026-08-15T03:45:00.000Z');
  const sectionUpdatedAt = new Date('2026-08-15T03:50:00.000Z');
  const { prisma, calls } = createPrisma({
    events: [{
      slug: 'congresso-evolvia',
      updatedAt: eventUpdatedAt,
      eventPublication: { updatedAt: publicationUpdatedAt },
      eventPublicationSections: [{ updatedAt: sectionUpdatedAt }],
    }],
  });
  const service = new EventPublicationPublicService(prisma);

  const result = await service.listForSitemap();

  assert.equal(calls.findMany.length, 1);
  assert.deepEqual(calls.findMany[0], {
    where: { status: 'PUBLISHED' },
    select: {
      slug: true,
      updatedAt: true,
      eventPublication: { select: { updatedAt: true } },
      eventPublicationSections: {
        where: { enabled: true },
        select: { updatedAt: true },
      },
    },
    orderBy: { slug: 'asc' },
    take: 50_000,
  });
  assert.deepEqual(result, [{ slug: 'congresso-evolvia', updatedAt: sectionUpdatedAt }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ['slug', 'updatedAt']);
});
