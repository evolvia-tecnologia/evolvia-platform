import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RegistrationReservationPolicyError,
  calculateRegistrationPrice,
  isPublicTicketOffer,
  normalizeIdempotencyKey,
  normalizePublicRegistration,
  publicOfferCategories,
} from '../src/registration-reservations-policy.ts';

const valid = {
  categoryId: 'category_valid_01',
  lotId: 'lot_valid_000001',
  benefitCode: ' lancamento-20 ',
  answers: {
    full_name: ' Pessoa Participante ',
    preferred_name: 'Pessoa',
    identity_document: '529.982.247-25',
    email: 'PESSOA@EXAMPLE.COM',
    phone: '11999999999',
    terms_acceptance: true,
  },
};

test('normaliza PII operacional e código sem expor valores', () => {
  const result = normalizePublicRegistration(valid);
  assert.equal(result.benefitCode, 'LANCAMENTO-20');
  assert.equal(result.answers.identity_document, '52998224725');
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

test('recusa CPF com dígitos errados e caracteres de injeção na inscrição', () => {
  for (const identity_document of ['123.456.789-00', '000.000.000-00', "' OR 1=1 --", '<script>']) {
    assert.throws(() => normalizePublicRegistration({ ...valid, answers: { ...valid.answers, identity_document } }), RegistrationReservationPolicyError);
  }
});

test('recusa marcação e comando em campo aberto da ficha', () => {
  for (const full_name of ['Ana <script>', 'Ana `id`', 'Ana ${process}', 'javascript:alert(1)']) {
    assert.throws(() => normalizePublicRegistration({ ...valid, answers: { ...valid.answers, full_name } }), RegistrationReservationPolicyError);
  }
  const accepted = normalizePublicRegistration({ ...valid, answers: { ...valid.answers, full_name: "Ana d'Avila" } });
  assert.equal(accepted.answers.full_name, "Ana d'Avila");
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

test('separa pagador e tomador e normaliza os dados fiscais declarados', () => {
  const result = normalizePublicRegistration({
    ...valid,
    billing: {
      payer: { kind: 'PERSON', name: ' Outra Pessoa ', document: 'AB-12345', email: 'PAYER@EXAMPLE.COM' },
      recipient: { kind: 'COMPANY', name: ' Empresa Exemplo Ltda ', document: '12.345.678/0001-90', email: 'FISCAL@EXAMPLE.COM' },
    },
  });
  assert.deepEqual(result.billing, {
    payer: { kind: 'PERSON', name: 'Outra Pessoa', document: 'AB12345', email: 'payer@example.com' },
    recipient: { kind: 'COMPANY', name: 'Empresa Exemplo Ltda', document: '12345678000190', email: 'fiscal@example.com' },
  });
  assert.throws(() => normalizePublicRegistration({ ...valid, billing: {
    payer: result.billing.payer, recipient: { ...result.billing.recipient, document: '123' },
  } }), RegistrationReservationPolicyError);
});

test('vitrine paga do show oculta lote zero só quando há lote pago ativo', () => {
  const mixed = [
    { name: 'Pista', lots: [{ priceCents: 12000 }, { priceCents: 0 }] },
    { name: 'Cortesia', lots: [{ priceCents: 0 }] },
  ];
  const show = publicOfferCategories(mixed, {
    registrationMode: 'PAID',
    profileCode: 'ENTERTAINMENT',
    eventType: 'Show ou entretenimento',
  });
  assert.deepEqual(show.map((item) => ({ name: item.name, prices: item.lots.map((lot) => lot.priceCents) })), [
    { name: 'Pista', prices: [12000] },
  ]);
  const congress = publicOfferCategories(mixed, {
    registrationMode: 'PAID',
    profileCode: 'SCIENTIFIC_EVENT',
    eventType: 'Congresso',
  });
  assert.equal(congress.length, 2);
  assert.equal(congress[1].lots[0].priceCents, 0);
  const onlyFree = publicOfferCategories(
    [{ name: 'Imprensa', lots: [{ priceCents: 0 }] }],
    { registrationMode: 'PAID', profileCode: 'ENTERTAINMENT', eventType: 'Show ou entretenimento' },
  );
  assert.equal(onlyFree[0].lots[0].priceCents, 0);
  const freeEvent = publicOfferCategories(mixed, {
    registrationMode: 'FREE',
    profileCode: 'ENTERTAINMENT',
    eventType: 'Festival',
  });
  assert.equal(freeEvent[1].lots[0].priceCents, 0);
  assert.equal(isPublicTicketOffer('ENTERTAINMENT', null), true);
  assert.equal(isPublicTicketOffer('SCIENTIFIC_EVENT', 'Congresso'), false);
});
