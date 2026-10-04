import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8');
const scientificCss = readFileSync(new URL('../components/scientific-submissions.module.css', import.meta.url), 'utf8');
const eventsCss = readFileSync(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8');

test('configurador reúne regras de submissão e resumo efetivo em linguagem do organizador', () => {
  for (const text of ['RESUMO DAS REGRAS EFETIVAS', 'Máximo de trabalhos por autor responsável', 'Apresentadores por trabalho', 'Exigir autor correspondente', 'Exigir instituição para cada autor', 'Máximo de caracteres no título', 'Formas de apresentação', 'Coletar nome científico', 'Coletar agência de fomento', 'Coletar conflito de interesse', 'Exigir autorização para os anais', 'Nota única de 0 a 10', 'e-pôster depois do aceite']) {
    assert.match(component, new RegExp(text, 'u'));
  }
});

test('modalidade e forma de apresentação permanecem conceitos distintos', () => {
  assert.match(component, /Esta classificação é diferente da modalidade do trabalho/u);
  assert.match(component, /oral, pôster ou ePoster/u);
});

test('configurador e catálogo público não reintroduzem paletas hexadecimais locais', () => {
  assert.doesNotMatch(scientificCss, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(eventsCss, /#[0-9a-f]{3,8}/iu);
});
