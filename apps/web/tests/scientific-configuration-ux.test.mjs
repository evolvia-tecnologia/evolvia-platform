import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8');
const scientificCss = readFileSync(new URL('../components/scientific-submissions.module.css', import.meta.url), 'utf8');
const eventsCss = readFileSync(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8');

test('configurador reúne regras de submissão e resumo efetivo em linguagem do organizador', () => {
  for (const text of ['RESUMO DAS REGRAS EFETIVAS', 'Máximo de trabalhos por autor responsável', 'Apresentadores por trabalho', 'Exigir autor correspondente', 'Exigir instituição para cada autor', 'Quantidade máxima de caracteres do título', 'Quantidade do resumo', 'Modalidades de submissão', 'Coletar nome científico', 'Coletar agência de fomento', 'Coletar conflito de interesse', 'Exigir autorização para os anais', 'Nota única de 0 a 10', 'e-pôster depois do aceite']) {
    assert.match(component, new RegExp(text, 'u'));
  }
});

test('o gate deixa o organizador escolher área, modalidades e autoria', () => {
  for (const text of ['Apenas área', 'Área e subárea', '1 aceita somente quem envia a inscrição', 'Pedir outros autores', 'Pedir a ordem de autoria', 'Pedir a instituição dos autores', 'oral, tema livre, pôster, pôster digital']) {
    assert.match(component, new RegExp(text, 'u'));
  }
  assert.doesNotMatch(component, /Esta classificação é diferente da modalidade do trabalho/u);
});

test('configurador e catálogo público não reintroduzem paletas hexadecimais locais', () => {
  assert.doesNotMatch(scientificCss, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(eventsCss, /#[0-9a-f]{3,8}/iu);
});
