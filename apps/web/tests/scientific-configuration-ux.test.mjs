import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8');
const scientificCss = readFileSync(new URL('../components/scientific-submissions.module.css', import.meta.url), 'utf8');
const eventsCss = readFileSync(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8');

test('configurador reúne regras de submissão e resumo efetivo em linguagem do organizador', () => {
  for (const text of [
    'RESUMO DAS REGRAS EFETIVAS',
    'Máximo de trabalhos por autor responsável',
    'Exigir exatamente um apresentador',
    'Exigir autor correspondente',
    'Exigir instituição para cada autor',
    'Máximo de caracteres no título',
    'Formas de apresentação',
    'Salvar regras essenciais',
    'Salvando regras essenciais',
    'Regras essenciais de submissão atualizadas',
    'por inscrito/autor responsável',
  ]) {
    assert.match(component, new RegExp(text, 'u'));
  }
});

test('regras essenciais têm ajuda curta, validação local e semântica acessível', () => {
  assert.match(component, /resolveScientificNumericRules/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /role="alert"/u);
  assert.match(component, /aria-invalid=\{Boolean\(error\)\}/u);
  assert.match(component, /htmlFor=\{id\}/u);
  assert.match(component, /Padrão Evolvia/u);
  assert.match(component, /authorActionsAvailableHere/u);
  assert.doesNotMatch(component, /criar trabalho em nome/iu);
});

test('modalidade e forma de apresentação permanecem conceitos distintos', () => {
  assert.match(component, /Esta classificação é diferente da modalidade do trabalho/u);
  assert.match(component, /oral, pôster ou ePoster/u);
});

test('configurador e catálogo público não reintroduzem paletas hexadecimais locais', () => {
  assert.doesNotMatch(scientificCss, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(eventsCss, /#[0-9a-f]{3,8}/iu);
});

test('controles essenciais têm alvo de foco e toque compatível com WCAG 2.2', () => {
  assert.match(scientificCss, /min-height:44px/u);
  assert.match(scientificCss, /outline:3px solid/u);
  assert.match(scientificCss, /\.ruleList input\{width:24px;height:24px/u);
});
