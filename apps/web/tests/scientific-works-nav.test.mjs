import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [nav, central, submissions, reviews, distribution, workspace] = await Promise.all([
  readFile(new URL('../components/scientific-works-nav.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/scientific-event-central.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/scientific-reviews.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/scientific-review-distribution.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-workspace.tsx', import.meta.url), 'utf8'),
]);

test('hub de trabalhos expõe Configurações e Gerenciamento sem duplicar Estação no menu lateral', () => {
  assert.match(nav, /aria-label="Trabalhos científicos"/u);
  assert.match(nav, /Configurações/u);
  assert.match(nav, /Gerenciamento/u);
  assert.match(nav, /submissoes#regras/u);
  assert.match(nav, /submissoes#conteudo/u);
  assert.match(nav, /submissoes#autoria/u);
  assert.match(nav, /submissoes#areas/u);
  assert.match(nav, /submissoes#formas/u);
  assert.match(nav, /submissoes#cegamento/u);
  assert.match(nav, /submissoes#cartas/u);
  assert.match(nav, /avaliacao#criterios/u);
  assert.match(nav, /submissoes#lista/u);
  assert.match(nav, /avaliacao#distribuicao/u);
  assert.match(nav, /avaliacao#distribuicao-assistida/u);
  assert.match(nav, /avaliacao#acompanhamento/u);
  assert.match(nav, /avaliacao#decisao/u);
  assert.match(nav, /submissoes#estacao/u);
  assert.match(nav, /painel\/comunicacao/u);
  assert.match(nav, /painel\/relatorios/u);
  assert.match(central, /flow === 'works' && <ScientificWorksNav/u);
  assert.match(submissions, /ScientificWorksNav/u);
  assert.match(reviews, /ScientificWorksNav/u);
  assert.doesNotMatch(workspace, /submissoes#estacao/u);
  assert.match(workspace, /Hub, configuração, avaliação, estação e decisões/u);
});

test('âncoras canônicas existem nas telas reutilizadas sem novo contrato de carta', () => {
  for (const id of ['regras', 'conteudo', 'autoria', 'areas', 'formas', 'cegamento', 'cartas', 'lista']) {
    assert.match(submissions, new RegExp(`id="${id}"`, 'u'));
  }
  assert.match(submissions, /Formas de apresentação e prazos/u);
  assert.match(submissions, /Envio e entrega da carta ao autor não acontecem nesta tela/u);
  for (const id of ['criterios', 'distribuicao', 'acompanhamento', 'decisao']) {
    assert.match(reviews, new RegExp(`id="${id}"`, 'u'));
  }
  assert.match(distribution, /id="distribuicao-assistida"/u);
  assert.match(submissions, /useScientificHashScroll/u);
  assert.match(reviews, /useScientificHashScroll/u);
});
