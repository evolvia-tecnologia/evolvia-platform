import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [reviews, reviewer] = await Promise.all([
  readFile(new URL('../components/scientific-reviews.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/evento/[slug]/avaliador/page.tsx', import.meta.url), 'utf8'),
]);

test('a comissão retoma o parecer sem formulário de nota e o avaliador vê a versão anterior', () => {
  assert.match(reviews, /Retomar parecer/u);
  assert.match(reviews, /Parecer retomado\. A banca e as notas já recebidas permanecem\./u);
  assert.match(reviews, /Versões do parecer/u);
  assert.match(reviews, /assignments\/\$\{assignmentId\}\/reopen/u);
  assert.doesNotMatch(reviews, /name="overallScore"|name=\{`score-/u);
  assert.match(reviewer, /A banca permanece\. As notas da versão anterior continuam neste formulário\./u);
  assert.match(reviewer, /Versões do parecer/u);
  assert.match(reviewer, /item\.opinion\?\.scores\.find/u);
  assert.match(reviewer, /organização não preenche nota nem conflito por você/u);
});
