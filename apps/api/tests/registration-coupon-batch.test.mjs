import assert from 'node:assert/strict';
import test from 'node:test';
import {
  couponBatchCodes,
  newCouponCode,
  normalizeCouponBatch,
} from '../src/registration-coupon-batch.policy.ts';

const now = new Date('2026-10-10T12:00:00.000Z');
const valid = {
  sponsor: 'Editora Norte',
  quantity: 3,
  discountPercent: 15,
  maxUses: 1,
  validUntil: '2026-12-01T18:00:00.000Z',
};

test('o lote de cupom só aceita os campos do patrocinador', () => {
  const batch = normalizeCouponBatch(valid, now);
  assert.equal(batch.sponsor, 'Editora Norte');
  assert.equal(batch.quantity, 3);
  assert.throws(() => normalizeCouponBatch({ ...valid, organizationId: 'org' }, now), /Informe o patrocinador/u);
  assert.throws(() => normalizeCouponBatch({ ...valid, sponsor: '<script>' }, now), /patrocinador/u);
  assert.throws(() => normalizeCouponBatch({ ...valid, quantity: 1 }, now), /quantidade/u);
  assert.throws(() => normalizeCouponBatch({ ...valid, quantity: 41 }, now), /quantidade/u);
  assert.throws(() => normalizeCouponBatch({ ...valid, validUntil: '2026-10-01T00:00:00.000Z' }, now), /validade/u);
});

test('os códigos do lote são únicos e não repetem um cupom já existente', () => {
  let step = 0;
  const codes = couponBatchCodes(3, new Set(['CAAAAAAAA2']), () => newCouponCode(() => {
    step += 1;
    return step === 1 ? 0 : step;
  }));
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);
  assert.equal(codes.includes('CAAAAAAAA2'), false);
  assert.match(codes[0], /^C[A-Z2-9]{9}$/u);
});
