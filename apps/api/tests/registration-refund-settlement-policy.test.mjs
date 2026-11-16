import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planRefundSettlement,
  refundSettlementIdempotencyKey,
  confirmRefundSettlement,
} from '../dist/registration-refund-settlement-policy.js';

const base = {
  organizationId: 'org1',
  eventId: 'evt1',
  refundRequestId: 'req1',
  provider: 'ASAAS',
  providerPaymentId: 'pay1',
  reservationId: 'res1',
  decision: 'APPROVED',
  paymentAmountCents: 12500,
  confirmedRefundCents: 0,
  reservedRefundCents: 0,
  requestedRefundCents: 4000,
};

test('prepara estorno parcial em centavos sem efetuar pagamento', () => {
  const plan = planRefundSettlement(base);
  assert.equal(plan.requestedRefundCents, 4000);
  assert.equal(plan.remainingRefundCents, 8500);
  assert.equal(plan.paymentKind, 'RESERVATION');
  assert.match(plan.idempotencyKey, /^[0-9a-f]{64}$/u);
});

test('mesmo pedido financeiro mantém chave estável mesmo se valor mudar', () => {
  const one = planRefundSettlement(base);
  const other = planRefundSettlement({ ...base, requestedRefundCents: 5000 });
  assert.equal(one.idempotencyKey, other.idempotencyKey);
  assert.notEqual(one.requestedRefundCents, other.requestedRefundCents);
});

test('chave separa tenant, evento, transação e pedido', () => {
  const start = refundSettlementIdempotencyKey(base);
  for (const field of ['organizationId', 'eventId', 'providerPaymentId', 'refundRequestId']) {
    const changed = refundSettlementIdempotencyKey({ ...base, [field]: 'another123' });
    assert.notEqual(changed, start, field);
  }
});

test('compra múltipla preserva o pagamento agrupado e o mesmo saldo da transação', () => {
  const plan = planRefundSettlement({
    ...base, orderId: 'order1', confirmedRefundCents: 2000,
    reservedRefundCents: 3000, requestedRefundCents: 6500,
  });
  assert.equal(plan.paymentKind, 'ORDER');
  assert.equal(plan.remainingRefundCents, 1000);
});

test('não processa pedido solicitado ou recusado', () => {
  for (const decision of ['REQUESTED', 'REJECTED']) {
    assert.throws(() => planRefundSettlement({ ...base, decision }), /Somente pedidos aprovados/u);
  }
});

test('recusa quantia maior que saldo e reservas pendentes', () => {
  assert.throws(
    () => planRefundSettlement({ ...base, confirmedRefundCents: 8000, reservedRefundCents: 4000, requestedRefundCents: 1000 }),
    /supera o saldo/u,
  );
});

test('recusa zero, valores negativos, decimais, NaN e unsafe integers', () => {
  for (const bad of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planRefundSettlement({ ...base, requestedRefundCents: bad }), /Valor inválido|Saldo do pagamento/u);
  }
});

test('recusa provedor ou identificadores inválidos', () => {
  for (const id of ['', '../tenant', 'x\0another', 'id com espaços']) {
    assert.throws(() => refundSettlementIdempotencyKey({ ...base, organizationId: id }), /Identificador inválido/u);
  }
});

test('não confirma estorno apenas porque o provedor aceitou HTTP', () => {
  assert.throws(() => confirmRefundSettlement(base, 4000, {
    provider: 'ASAAS', providerPaymentId: 'pay1', amountCents: 4000,
    status: 'PENDING', providerRefundId: 'refund1',
  }), /não confirmado/u);
});

test('confirma apenas provedor, cobrança, quantia e recibo conciliados', () => {
  const response = {
    provider: 'ASAAS', providerPaymentId: 'pay1', amountCents: 4000,
    status: 'SUCCEEDED', providerRefundId: 'refund1',
  };
  assert.equal(confirmRefundSettlement(base, 4000, response), 'refund1');
  for (const patch of [
    { provider: 'OUTRO' }, { providerPaymentId: 'pay2' },
    { amountCents: 4001 }, { providerRefundId: null },
    { status: 'FAILED' },
  ]) {
    assert.throws(() => confirmRefundSettlement(base, 4000, { ...response, ...patch }), /não confirmado/u);
  }
});
