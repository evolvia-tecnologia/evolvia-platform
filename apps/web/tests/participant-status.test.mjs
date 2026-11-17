import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentLabel, registrationLabel, sessionDelay } from '../components/participant-status.ts';

// 1. Toda situação de inscrição tem rótulo em português, nenhum devolve o código cru.
test('rotula as quatro situações de inscrição sem vazar o código', () => {
  const esperado = {
    PENDING_PAYMENT: 'Aguardando pagamento',
    CONFIRMED: 'Confirmada',
    EXPIRED: 'Reserva expirada',
    CANCELLED: 'Cancelada',
  };
  for (const [codigo, rotulo] of Object.entries(esperado)) {
    assert.equal(registrationLabel(codigo), rotulo);
    assert.notEqual(registrationLabel(codigo), codigo);
  }
});

// 2. Situação desconhecida do servidor não quebra a tela nem mostra o código.
test('situação de inscrição desconhecida cai em texto legível', () => {
  assert.equal(registrationLabel('SITUACAO_NOVA_DO_SERVIDOR'), 'Em análise');
});

// 3. As oito situações de pagamento, incluindo a distinção paga vs em análise.
test('rotula as oito situações de pagamento', () => {
  const esperado = {
    CREATING: 'Preparando pagamento',
    ACTIVE: 'Aguardando pagamento',
    PAID: 'Pago',
    PAID_REVIEW: 'Pagamento em análise',
    CANCELED: 'Cancelado',
    EXPIRED: 'Pagamento expirado',
    FAILED: 'Falha no pagamento',
    UNKNOWN: 'Situação em verificação',
  };
  for (const [codigo, rotulo] of Object.entries(esperado)) assert.equal(paymentLabel(codigo), rotulo);
});

// 4. Pago e em análise NÃO podem colidir: quem está em análise não pode ler "Pago".
test('pagamento em análise não é apresentado como pago', () => {
  assert.notEqual(paymentLabel('PAID_REVIEW'), paymentLabel('PAID'));
  assert.ok(!paymentLabel('PAID_REVIEW').match(/^Pago$/u));
});

// 5. Evento gratuito não tem pagamento: null é "não aplicável", nunca "falha".
test('ausência de pagamento não é falha de pagamento', () => {
  assert.equal(paymentLabel(null), 'Não aplicável');
  assert.notEqual(paymentLabel(null), paymentLabel('FAILED'));
  assert.notEqual(paymentLabel(null), paymentLabel('UNKNOWN'));
});

// 6. Sessão no futuro devolve o tempo que falta, para o setTimeout da tela.
test('sessão futura devolve os milissegundos restantes', () => {
  const agora = Date.parse('2026-11-06T12:00:00.000Z');
  assert.equal(sessionDelay('2026-11-06T12:15:00.000Z', agora), 15 * 60 * 1000);
  assert.equal(sessionDelay('2026-11-06T12:00:00.001Z', agora), 1);
});

// 7. Falha fechada: sessão vencida ou no instante exato expira já, não prorroga.
test('sessão vencida ou no limite expira imediatamente', () => {
  const agora = Date.parse('2026-11-06T12:00:00.000Z');
  assert.equal(sessionDelay('2026-11-06T12:00:00.000Z', agora), 0);
  assert.equal(sessionDelay('2026-11-06T11:59:59.999Z', agora), 0);
  assert.equal(sessionDelay('2020-01-01T00:00:00.000Z', agora), 0);
});

// 8. O ponto de segurança: data ilegível do servidor NÃO pode manter a sessão viva.
test('data inválida expira a sessão em vez de mantê-la aberta', () => {
  const agora = Date.parse('2026-11-06T12:00:00.000Z');
  for (const ruim of ['', 'amanhã', 'null', '2026-13-45T99:99:99Z', 'Infinity']) {
    assert.equal(sessionDelay(ruim, agora), 0, `deveria expirar para ${JSON.stringify(ruim)}`);
  }
});

// 9. "now" inválido também não pode abrir sessão infinita.
//
// O caso -Infinity é o que justifica a guarda Number.isFinite: sem ela,
// finito - (-Infinity) = +Infinity passaria por "remaining > 0" e a função
// devolveria Infinity. Com NaN a guarda seria redundante, porque qualquer
// comparação com NaN já é falsa; é o infinito que a torna necessária.
test('instante atual inválido expira a sessão', () => {
  assert.equal(sessionDelay('2026-11-06T12:15:00.000Z', Number.NaN), 0);
  assert.equal(sessionDelay('2026-11-06T12:15:00.000Z', Number.POSITIVE_INFINITY), 0);
  assert.equal(sessionDelay('2026-11-06T12:15:00.000Z', Number.NEGATIVE_INFINITY), 0);
});

// 10. O retorno é sempre número finito não negativo: a tela passa isso a setTimeout.
test('nunca devolve negativo, NaN ou Infinity', () => {
  const casos = [['2026-11-06T12:15:00.000Z', 0], ['', 0], ['x', Number.NaN], ['2026-11-06T12:00:00.000Z', 1e18]];
  for (const [quando, agora] of casos) {
    const d = sessionDelay(quando, agora);
    assert.ok(Number.isFinite(d), `finito para ${quando}`);
    assert.ok(d >= 0, `não negativo para ${quando}`);
  }
});
