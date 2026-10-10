import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a classificação mostra o corte e não decide o trabalho', async () => {
  const [page, ranking, css] = await Promise.all([
    read('../app/eventos/[id]/cientifico/classificacao/page.tsx'),
    read('../components/scientific-ranking.tsx'),
    read('../components/scientific-ranking.module.css'),
  ]);
  assert.match(page, /ScientificRanking/u);
  assert.match(page, /não aceita nem recusa|continua decidindo/u);
  assert.match(ranking, /Eliminatório/u);
  assert.match(ranking, /Classificatório/u);
  assert.match(ranking, /Nota de corte/u);
  assert.match(ranking, /Esta leitura não aceita nem recusa o trabalho/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.doesNotMatch(ranking, /organizationId|authorComment|confidentialComment/u);
});
