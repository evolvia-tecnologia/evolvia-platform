import assert from 'node:assert/strict';
import test from 'node:test';
import { benefitErrorTargets, benefitFieldFromApiMessage } from '../lib/benefit-api-feedback.ts';

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

test('vários códigos sem linha identificável ficam só no resumo', () => {
  const targets = benefitErrorTargets('O limite de usos não pode ser menor que a quantidade já utilizada.', [row({}), row({})]);
  assert.deepEqual(targets, []);
  assert.deepEqual(benefitErrorTargets('Não foi possível salvar os benefícios.', [row({})]), []);
});
