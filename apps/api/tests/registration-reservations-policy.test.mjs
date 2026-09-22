import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RegistrationReservationPolicyError,
  calculateRegistrationPrice,
  normalizeIdempotencyKey,
  normalizePublicRegistration,
} from '../src/registration-reservations-policy.ts';

const valid = {
  categoryId: 'category_valid_01',
  lotId: 'lot_valid_000001',
  benefitCode: ' lancamento-20 ',
  answers: {
    full_name: ' Pessoa Participante ',
    preferred_name: 'Pessoa',
    identity_document: '123.456.789-00',
    email: 'PESSOA@EXAMPLE.COM',
    phone: '11999999999',
    terms_acceptance: true,
  },
};

test('normaliza PII operacional e código sem expor valores', () => {
  const result = normalizePublicRegistration(valid);
  assert.equal(result.benefitCode, 'LANCAMENTO-20');
  assert.equal(result.answers.identity_document, '12345678900');
  assert.equal(result.answers.email, 'pessoa@example.com');
});

test('exige consentimento, documento, e-mail, categoria e lote', () => {
  for (const patch of [
    { answers: { ...valid.answers, terms_acceptance: false } },
    { answers: { ...valid.answers, identity_document: '1' } },
    { answers: { ...valid.answers, email: 'invalido' } },
    { categoryId: 'x' },
    { lotId: 'x' },
  ]) {
    assert.throws(() => normalizePublicRegistration({ ...valid, ...patch }), RegistrationReservationPolicyError);
  }
});

test('limita campos e rejeita conteúdo estrutural inesperado', () => {
  assert.throws(() => normalizePublicRegistration({ ...valid, answers: { ...valid.answers, unsafe: { nested: true } } }), RegistrationReservationPolicyError);
});

test('chave idempotente tem contrato estrito', () => {
  assert.equal(normalizeIdempotencyKey('reservation-123456789'), 'reservation-123456789');
  for (const value of [undefined, 'curta', 'chave com espaço']) {
    assert.throws(() => normalizeIdempotencyKey(value), RegistrationReservationPolicyError);
  }
});

test('calcula preço em centavos de forma determinística', () => {
  assert.equal(calculateRegistrationPrice(10_000, 20), 8_000);
  assert.equal(calculateRegistrationPrice(10_001, 100), 0);
  assert.throws(() => calculateRegistrationPrice(-1, 10), RegistrationReservationPolicyError);
});
