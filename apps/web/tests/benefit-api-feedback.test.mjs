import assert from 'node:assert/strict';
import test from 'node:test';
import { benefitCatalogConfirmed, benefitErrorTargets, benefitFieldFromApiMessage } from '../lib/benefit-api-feedback.ts';

const row = (patch) => ({ code: 'CONVITE-1', name: 'Convite', validFrom: '2026-11-01T10:00', validUntil: '2026-12-01T10:00', ...patch });

test('a frase vigente da API aponta o campo e a linha preenchida', () => {
  assert.equal(benefitFieldFromApiMessage('O nome do benefício é inválido.'), 'name');
  assert.equal(benefitFieldFromApiMessage('Cupons e cortesias só podem ser configurados em eventos com inscrição paga.'), null);
  const named = benefitErrorTargets('O nome do benefício é inválido.', [row({ name: 'Ok' }), row({ name: '<b>Convite</b>' })]);
  assert.deepEqual(named, [{ index: 1, field: 'name' }]);
  const duplicated = benefitErrorTargets('Cada cupom, convite ou cortesia deve possuir um código único.', [
    row({ code: 'vip' }),
    row({ code: 'VIP' }),
    row({ code: 'OUTRO' }),
  ]);
  assert.deepEqual(duplicated, [{ index: 0, field: 'code' }, { index: 1, field: 'code' }]);
  const dates = benefitErrorTargets('O benefício deve expirar depois da abertura.', [
    row({ validFrom: '2026-12-02T10:00', validUntil: '2026-12-01T10:00' }),
  ]);
  assert.deepEqual(dates, [{ index: 0, field: 'validUntil' }]);
});

const catalogRow = (patch) => ({
  code: 'CONVITE-1',
  name: 'Convite',
  kind: 'INVITATION',
  discountPercent: 0,
  maxUses: 1,
  validFrom: '2026-11-01T13:00:00.000Z',
  validUntil: '2026-12-01T13:00:00.000Z',
  active: true,
  sortOrder: 0,
  ...patch,
});

test('a lista salva só confirma quando o servidor devolve os mesmos códigos', () => {
  const sent = [catalogRow({}), catalogRow({ code: 'CUPOM-2', kind: 'COUPON', discountPercent: 10, sortOrder: 1 })];
  assert.equal(benefitCatalogConfirmed(sent, sent.map((item) => ({ ...item, id: 'extra' }))), true);
  assert.equal(benefitCatalogConfirmed(sent, [
    catalogRow({ validFrom: '2026-11-01T13:00:00.000+00:00' }),
    sent[1],
  ]), true);
  assert.equal(benefitCatalogConfirmed(sent, [sent[0]]), false);
  assert.equal(benefitCatalogConfirmed(sent, [sent[1], sent[0]]), false);
  assert.equal(benefitCatalogConfirmed(sent, [sent[0], catalogRow({ ...sent[1], name: 'Outro' })]), false);
  assert.equal(benefitCatalogConfirmed(sent, null), false);
});

test('vários códigos sem linha identificável ficam só no resumo', () => {
  const targets = benefitErrorTargets('O limite de usos não pode ser menor que a quantidade já utilizada.', [row({}), row({})]);
  assert.deepEqual(targets, []);
  assert.deepEqual(benefitErrorTargets('Não foi possível salvar os benefícios.', [row({})]), []);
});
