import assert from 'node:assert/strict';
import test from 'node:test';
import { subjectAreaWhere } from '../dist/event-publication/public-discovery.policy.js';

test('área marcada encontra o evento e o perfil científico não entra em educação', () => {
  const where = subjectAreaWhere('educacao');
  assert.ok(where);
  assert.deepEqual(where.OR[0], { subjectAreas: { has: 'educacao' } });
  assert.deepEqual(where.OR[1].AND[0], { subjectAreas: { isEmpty: true } });
  const keywords = JSON.stringify(where.OR[1].AND[1]);
  assert.match(keywords, /educação/u);
  assert.doesNotMatch(keywords, /congresso|SCIENTIFIC_EVENT/u);
});

test('área desconhecida não filtra o catálogo', () => {
  assert.equal(subjectAreaWhere(' '), undefined);
  assert.equal(subjectAreaWhere('futebol'), undefined);
});
