import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRegistrationBenefits } from '../src/registration-benefits-policy.ts';

const benefit = (overrides = {}) => ({
  code: ' LANCAMENTO-20 ',
  name: 'Lançamento 20%',
  kind: 'COUPON',
  discountPercent: 20,
  maxUses: 100,
  validFrom: '2026-10-01T09:00:00-03:00',
  validUntil: '2026-10-31T23:59:59-03:00',
  ...overrides,
});

test('normaliza código e datas de cupom pago', () => {
  const [result] = normalizeRegistrationBenefits([benefit()], 'PAID');
  assert.equal(result.code, 'LANCAMENTO-20');
  assert.equal(result.discountPercent, 20);
  assert.equal(result.validFrom, '2026-10-01T12:00:00.000Z');
});

test('impõe desconto canônico por tipo', () => {
  assert.equal(normalizeRegistrationBenefits([benefit({ code: 'CONVIDADO', kind: 'INVITATION', discountPercent: 0 })], 'PAID')[0].discountPercent, 0);
  assert.equal(normalizeRegistrationBenefits([benefit({ code: 'CORTESIA', kind: 'COURTESY', discountPercent: 100 })], 'PAID')[0].discountPercent, 100);
  assert.throws(() => normalizeRegistrationBenefits([benefit({ kind: 'COURTESY', discountPercent: 90 })], 'PAID'), /100%/u);
});

test('rejeita códigos duplicados sem diferenciar caixa', () => {
  assert.throws(() => normalizeRegistrationBenefits([
    benefit({ code: 'PROMO-10' }),
    benefit({ code: 'promo-10', name: 'Outro cupom' }),
  ], 'PAID'), /código único/u);
});

test('rejeita período, limite e percentual inválidos', () => {
  assert.throws(() => normalizeRegistrationBenefits([benefit({ validUntil: benefit().validFrom })], 'PAID'), /expirar depois/u);
  assert.throws(() => normalizeRegistrationBenefits([benefit({ maxUses: 0 })], 'PAID'), /limite de usos/u);
  assert.throws(() => normalizeRegistrationBenefits([benefit({ discountPercent: 101 })], 'PAID'), /percentual/u);
});

test('eventos não pagos aceitam somente convite', () => {
  assert.throws(() => normalizeRegistrationBenefits([benefit()], 'FREE'), /só podem/u);
  const invitation = benefit({ code: 'ACESSO-VIP', kind: 'INVITATION', discountPercent: 0 });
  assert.equal(normalizeRegistrationBenefits([invitation], 'INVITATION')[0].kind, 'INVITATION');
});

test('aceita lista vazia e limita volume', () => {
  assert.deepEqual(normalizeRegistrationBenefits([], 'PAID'), []);
  assert.throws(() => normalizeRegistrationBenefits(Array.from({ length: 501 }, (_, index) => benefit({ code: `CODIGO-${index}` })), 'PAID'), /no máximo 500/u);
});
