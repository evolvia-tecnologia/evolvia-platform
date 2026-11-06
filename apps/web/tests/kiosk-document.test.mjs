import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretKioskDocument, kioskCopy, kioskLanguage } from '../lib/kiosk-copy.ts';

test('o totem lê CPF só com números e passaporte com letras, inclusive 11 caracteres', () => {
  assert.deepEqual(interpretKioskDocument('529.982.247-25'), { ok: true, value: '52998224725' });
  assert.deepEqual(interpretKioskDocument('111.111.111-11'), { ok: false, error: 'cpf' });
  assert.deepEqual(interpretKioskDocument('12345678901'), { ok: false, error: 'cpf' });
  assert.deepEqual(interpretKioskDocument('AB123456789'), { ok: true, value: 'AB123456789' });
  assert.equal(interpretKioskDocument('AB123456789').value.length, 11);
  assert.deepEqual(interpretKioskDocument('ab-12'), { ok: false, error: 'short' });
  assert.deepEqual(interpretKioskDocument(''), { ok: false, error: 'empty' });
  assert.equal(kioskLanguage('en'), 'en');
  assert.equal(kioskLanguage('fr'), 'pt');
  assert.match(kioskCopy('pt').documentTitle, /CPF ou Passaporte/u);
  assert.match(kioskCopy('es').documentTitle, /pasaporte/u);
  assert.match(kioskCopy('en').documentTitle, /passport/u);
});
