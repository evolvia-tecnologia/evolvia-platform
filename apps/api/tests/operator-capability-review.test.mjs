import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODIGO_ESCOPO_OPERADOR,
  EntradaInvalida,
  decidirAcaoDeOperador,
  normalizarConcessao,
} from '../src/operator-capability-policy.ts';

/**
 * As duas observações da revisão da #642, cada uma com o teste que a reprova.
 *
 * Em arquivo próprio, e não dentro de `operator-capability-policy.test.mjs`,
 * por rastreio: o nome liga as asserções às threads de revisão que elas
 * fecham, e quem reabrir a discussão acha o teste pelo nome do arquivo.
 *
 * Cada observação tem aqui o teste que a REPROVA no código anterior, não só
 * uma asserção do comportamento novo. Correção de uma linha sem teste que
 * distinga antes de depois é mudança de texto, não de comportamento provado.
 */

const ORG = 'org-1';
const EVT = 'evt-1';
const USR = 'usr-1';
const ESCOPADO = ['credential', 'access_control', 'material_delivery', 'registration', CODIGO_ESCOPO_OPERADOR];

const pedido = (over = {}) => ({
  papel: 'OPERATOR',
  acao: 'checkin',
  organizationId: ORG,
  eventId: EVT,
  userId: USR,
  capacidadesDoEvento: ESCOPADO,
  concessoes: [],
  ...over,
});

const conceder = (acao, over = {}) => ({
  organizationId: ORG, eventId: EVT, userId: USR, acao, revogadaEm: null, ...over,
});

// REPROVA HOJE. `revogadaEm` é declarado `Date | string | null`, e a forma
// string não é hipotética: uma concessão que passe por JSON chega com a data
// serializada. Com `!c.revogadaEm`, o valor `''` é falsy e a concessão conta
// como ATIVA — um dado corrompido ou truncado vira autorização.
//
// A direção certa num módulo de autorização é a oposta: valor que não é
// exatamente null nem undefined significa "há marca de revogação", logo nega.
// Deny-by-default aplicado ao próprio campo, e não só à ação.
test('revogadaEm com string vazia NÃO autoriza: valor estranho nega, não libera', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { revogadaEm: '' })] }));
  assert.equal(d.permitido, false, 'string vazia em revogadaEm não pode valer como concessão ativa');
  assert.equal(d.motivo, 'sem_concessao_para_a_acao');
});

// REGRESSÃO. A correção acima não pode endurecer o caso normal: ausente e
// `undefined` continuam significando concessão viva.
test('revogadaEm ausente ou undefined continua sendo concessão ativa', () => {
  const semCampo = { organizationId: ORG, eventId: EVT, userId: USR, acao: 'checkin' };
  for (const c of [conceder('checkin', { revogadaEm: undefined }), semCampo, conceder('checkin')]) {
    assert.equal(decidirAcaoDeOperador(pedido({ concessoes: [c] })).permitido, true, JSON.stringify(c));
  }
});

// REGRESSÃO. Revogação de verdade revoga nas duas formas do tipo declarado.
test('revogadaEm revoga tanto como Date quanto como string de data', () => {
  for (const valor of [new Date(), '2026-11-09T12:00:00.000Z']) {
    const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { revogadaEm: valor })] }));
    assert.equal(d.permitido, false, `revogadaEm=${String(valor)} tinha de revogar`);
  }
});

// REPROVA HOJE. `typeof [] === 'object'`, então um array atravessa a guarda de
// entrada e só falha depois, dizendo `Campo "organizationId" é obrigatório.` —
// mensagem que manda o cliente procurar um campo quando o problema é a forma
// do corpo inteiro. Array é engano comum em JSON, e merece a mensagem certa.
test('normalizarConcessao recusa array como pedido inválido, e não por campo faltando', () => {
  for (const entrada of [[], [{ organizationId: ORG, eventId: EVT, userId: USR, motivo: 'x', acoes: ['checkin'] }]]) {
    assert.throws(
      () => normalizarConcessao(entrada),
      (erro) => erro instanceof EntradaInvalida && /Pedido inválido/u.test(erro.message),
      `array deveria ser recusado pela forma: ${JSON.stringify(entrada)}`,
    );
  }
});
