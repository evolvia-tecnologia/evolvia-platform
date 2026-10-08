import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ScientificStationService } from '../dist/scientific-station.service.js';

const work = {
  id: 'csubmission01',
  title: 'Cuidado seguro',
  presentationFormatCode: 'EPOSTER',
  stationPublicCode: 7,
  stationShowAbstract: true,
  stationShowEposter: true,
  keywords: ['cuidado'],
  taxonomyArea: { name: 'Clínica' },
  taxonomySubarea: null,
  authors: [{ person: { name: 'Ana Souza', institution: 'Hospital' } }],
  versions: [{ eposterFileKey: 'poster.pdf', secondEposterFileKey: null }],
};

function service() {
  const queries = [];
  const prisma = {
    event: { findFirst: async () => ({ id: 'event-1', name: 'Congresso', slug: 'congresso', organizationId: 'org-1' }) },
    scientificSubmission: {
      count: async (query) => { queries.push(['count', query.where]); return 25; },
      findMany: async (query) => { queries.push(['list', query]); return query.skip === 0 ? [work] : []; },
    },
  };
  return { service: new ScientificStationService(prisma, {}, {}), queries };
}

test('a estação lista vinte trabalhos por página dentro do evento', async () => {
  const h = service();
  const first = await h.service.search('congresso', undefined, undefined, undefined);
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 20);
  assert.equal(first.total, 25);
  assert.equal(first.works[0].title, 'Cuidado seguro');
  assert.equal(first.works[0].showEposter, true);
  assert.equal(h.queries[1][1].skip, 0);
  assert.equal(h.queries[1][1].take, 20);
  assert.equal(h.queries[0][1].eventId, 'event-1');
  assert.equal(h.queries[0][1].organizationId, 'org-1');
  assert.doesNotMatch(JSON.stringify(first), /email|organizationId|poster\.pdf/iu);

  const second = await h.service.search('congresso', 'title', 'cuidado', '2');
  assert.equal(second.page, 2);
  assert.equal(second.works.length, 0);
  assert.equal(h.queries.at(-1)[1].skip, 20);
  assert.equal(h.queries.at(-1)[1].take, 20);
  assert.equal(h.queries.at(-1)[1].where.eventId, 'event-1');
  assert.equal(h.queries.at(-1)[1].where.title.contains, 'cuidado');

  const before = h.queries.length;
  await assert.rejects(() => h.service.search('congresso', undefined, undefined, '0'), (error) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /Página inválida/u);
    return true;
  });
  assert.equal(h.queries.length, before);
});
