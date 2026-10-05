import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationPayloadHash, normalizeEvaluationAnswers, normalizeEvaluationConfig } from '../dist/event-evaluation.policy.js';

const questions = [
  { id: 'nota_geral', label: 'Nota geral', kind: 'RATING', required: true },
  { id: 'comentario', label: 'Comentário', kind: 'TEXT', required: false },
];

test('normaliza configuração acessível com códigos únicos', () => {
  const value = normalizeEvaluationConfig({ active: true, title: ' Avaliação do evento ', questions });
  assert.equal(value.title, 'Avaliação do evento');
  assert.deepEqual(value.questions, questions);
});

test('recusa questionário vazio, duplicado ou acima do limite', () => {
  assert.throws(() => normalizeEvaluationConfig({ active: true, title: 'Avaliação', questions: [] }), /1 a 20/u);
  assert.throws(() => normalizeEvaluationConfig({ active: true, title: 'Avaliação', questions: [questions[0], questions[0]] }), /códigos únicos/u);
  assert.throws(() => normalizeEvaluationConfig({ active: true, title: 'Avaliação', questions: Array.from({ length: 21 }, (_, i) => ({ id: `q_${i}`, label: 'Pergunta', kind: 'TEXT', required: false })) }), /1 a 20/u);
});

test('aceita nota 1 e 5, texto limitado e omite opcional vazio', () => {
  assert.deepEqual(normalizeEvaluationAnswers({ nota_geral: 1, comentario: '' }, questions), { nota_geral: 1 });
  assert.deepEqual(normalizeEvaluationAnswers({ nota_geral: 5, comentario: '  Muito bom  ' }, questions), { nota_geral: 5, comentario: 'Muito bom' });
});

test('recusa nota fora do intervalo, obrigatória ausente e pergunta alheia', () => {
  assert.throws(() => normalizeEvaluationAnswers({ nota_geral: 0 }, questions), /1 a 5/u);
  assert.throws(() => normalizeEvaluationAnswers({ comentario: 'ok' }, questions), /Responda/u);
  assert.throws(() => normalizeEvaluationAnswers({ nota_geral: 4, invasora: 'não' }, questions), /não pertence/u);
});

test('ignora propriedades herdadas ao validar resposta opcional', () => {
  const inherited = Object.create({ comentario: 'não deve ser lido' });
  inherited.nota_geral = 4;
  assert.deepEqual(normalizeEvaluationAnswers(inherited, questions), { nota_geral: 4 });
});

test('hash é estável independentemente da ordem das chaves e muda com conteúdo', () => {
  assert.equal(evaluationPayloadHash({ nota_geral: 5, comentario: 'ok' }), evaluationPayloadHash({ comentario: 'ok', nota_geral: 5 }));
  assert.notEqual(evaluationPayloadHash({ nota_geral: 5 }), evaluationPayloadHash({ nota_geral: 4 }));
});
