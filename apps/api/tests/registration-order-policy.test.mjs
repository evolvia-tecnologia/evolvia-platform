import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_REGISTRATION_ORDER_ENTRIES,
  canonicalRegistrationOrderPayload,
  normalizeRegistrationOrder,
  registrationOrderPayloadHash,
} from '../src/registration-order-policy.ts';
import { RegistrationReservationPolicyError } from '../src/registration-reservations-policy.ts';

const billing = {
  payer: {
    kind: 'PERSON',
    name: 'Maria Compradora',
    document: '529.982.247-25',
    email: 'MARIA@EXAMPLE.COM',
  },
  recipient: {
    kind: 'COMPANY',
    name: 'Empresa Exemplo',
    document: '11.222.333/0001-81',
    email: 'FINANCEIRO@EXAMPLE.COM',
  },
};

function entry(identity, email, overrides = {}) {
  return {
    categoryId: 'category_0001',
    lotId: 'lot_0001',
    answers: {
      full_name: 'Participante Exemplo',
      preferred_name: 'Participante',
      identity_document: identity,
      email,
      phone: '11999999999',
      terms_acceptance: true,
    },
    ...overrides,
  };
}

test('normaliza uma cobrança e cada ficha da compra múltipla', () => {
  const result = normalizeRegistrationOrder({
    billing,
    entries: [
      entry('529.982.247-25', 'PESSOA1@EXAMPLE.COM'),
      entry('168.995.350-09', 'PESSOA2@EXAMPLE.COM'),
    ],
  });

  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].answers.identity_document, '52998224725');
  assert.equal(result.entries[1].answers.email, 'pessoa2@example.com');
  assert.deepEqual(result.billing, {
    payer: {
      kind: 'PERSON',
      name: 'Maria Compradora',
      document: '52998224725',
      email: 'maria@example.com',
    },
    recipient: {
      kind: 'COMPANY',
      name: 'Empresa Exemplo',
      document: '11222333000181',
      email: 'financeiro@example.com',
    },
  });
  assert.equal('billing' in result.entries[0], false);
});

test('rejeita a mesma identidade em duas posições mesmo com formatação diferente', () => {
  assert.throws(
    () => normalizeRegistrationOrder({
      entries: [
        entry('529.982.247-25', 'pessoa1@example.com'),
        entry('52998224725', 'pessoa2@example.com'),
      ],
    }),
    (error) => error instanceof RegistrationReservationPolicyError
      && /identidade diferente/u.test(error.message),
  );
});

test('limita a compra a duas até dez entradas', () => {
  assert.throws(
    () => normalizeRegistrationOrder({ entries: [entry('52998224725', 'pessoa1@example.com')] }),
    RegistrationReservationPolicyError,
  );
  assert.throws(
    () => normalizeRegistrationOrder({
      entries: Array.from({ length: MAX_REGISTRATION_ORDER_ENTRIES + 1 }, (_, index) =>
        entry(`PASSAPORTE${index}`, `pessoa${index}@example.com`)),
    }),
    RegistrationReservationPolicyError,
  );
});

test('rejeita cobrança repetida dentro de uma ficha', () => {
  assert.throws(
    () => normalizeRegistrationOrder({
      billing,
      entries: [
        { ...entry('52998224725', 'pessoa1@example.com'), billing },
        entry('16899535009', 'pessoa2@example.com'),
      ],
    }),
    (error) => error instanceof RegistrationReservationPolicyError
      && /uma única vez/u.test(error.message),
  );
});

test('hash é estável para chaves em ordem diferente e sensível à ordem das entradas', () => {
  const first = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'pessoa1@example.com'),
      entry('16899535009', 'pessoa2@example.com'),
    ],
  });
  const same = normalizeRegistrationOrder({
    entries: [
      {
        lotId: 'lot_0001',
        answers: {
          terms_acceptance: true,
          phone: '11999999999',
          email: 'pessoa1@example.com',
          identity_document: '52998224725',
          preferred_name: 'Participante',
          full_name: 'Participante Exemplo',
        },
        categoryId: 'category_0001',
      },
      entry('16899535009', 'pessoa2@example.com'),
    ],
  });
  const reversed = { ...first, entries: [...first.entries].reverse() };

  assert.equal(canonicalRegistrationOrderPayload(first), canonicalRegistrationOrderPayload(same));
  assert.match(registrationOrderPayloadHash(first), /^[a-f0-9]{64}$/u);
  assert.equal(registrationOrderPayloadHash(first), registrationOrderPayloadHash(same));
  assert.notEqual(registrationOrderPayloadHash(first), registrationOrderPayloadHash(reversed));
});

test('reutiliza a proteção de conteúdo da ficha individual', () => {
  assert.throws(
    () => normalizeRegistrationOrder({
      entries: [
        entry('52998224725', 'pessoa1@example.com', {
          answers: {
            ...entry('52998224725', 'pessoa1@example.com').answers,
            full_name: '<script>alert(1)</script>',
          },
        }),
        entry('16899535009', 'pessoa2@example.com'),
      ],
    }),
    RegistrationReservationPolicyError,
  );
});
