import assert from 'node:assert/strict';
import test from 'node:test';
import orderPolicy from '../dist/registration-order-policy.js';
import reservationPolicy from '../dist/registration-reservations-policy.js';

const {
  MAX_REGISTRATION_ORDER_ENTRIES,
  canonicalRegistrationOrderPayload,
  normalizeRegistrationOrder,
  prepareRegistrationOrderReservation,
  registrationOrderPayloadHash,
} = orderPolicy;
const { RegistrationReservationPolicyError } = reservationPolicy;

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


test('normaliza a cobrança única somente na primeira ficha', () => {
  let billingReads = 0;
  const order = {
    entries: [
      entry('52998224725', 'pessoa1@example.com'),
      entry('16899535009', 'pessoa2@example.com'),
      entry('PASSAPORTE3', 'pessoa3@example.com'),
    ],
  };
  Object.defineProperty(order, 'billing', {
    enumerable: true,
    get() {
      billingReads += 1;
      return billing;
    },
  });

  const result = normalizeRegistrationOrder(order);

  assert.equal(billingReads, 1);
  assert.equal(result.billing.payer.email, 'maria@example.com');
  assert.equal(result.entries.every((item) => !('billing' in item)), true);
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

test('rejeita tipos inválidos de categoria, lote e benefício sem lançar TypeError', () => {
  const malformed = [
    { categoryId: 12345678 },
    { lotId: 12345678 },
    { benefitCode: 100 },
    { benefitCode: ['CUPOM100'] },
    { benefitCode: { code: 'CUPOM100' } },
    { benefitCode: null },
  ];
  for (const override of malformed) {
    assert.throws(
      () => normalizeRegistrationOrder({
        entries: [
          entry('52998224725', 'pessoa1@example.test', override),
          entry('16899535009', 'pessoa2@example.test'),
        ],
      }),
      (error) => error instanceof RegistrationReservationPolicyError
        && /Categoria, lote ou benefício inválidos/u.test(error.message),
      `Tipo inválido: ${JSON.stringify(override)}`,
    );
  }
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

test('prévia pública de pedido consolida preços e vagas sem expor identidade nem reservar estoque', () => {
  const normalized = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'pessoa1@example.test'),
      entry('16899535009', 'pessoa2@example.test'),
    ],
  });
  const offer = { categories: [{ id: 'category_0001', remaining: 2, lots: [{ id: 'lot_0001', priceCents: 3500, remaining: 2 }] }] };
  const preview = orderPolicy.previewRegistrationOrder(normalized, offer);
  assert.deepEqual(preview, {
    entryCount: 2, subtotalCents: 7000,
    entries: [
      { categoryId: 'category_0001', lotId: 'lot_0001', priceCents: 3500 },
      { categoryId: 'category_0001', lotId: 'lot_0001', priceCents: 3500 },
    ], stockReserved: false,
  });
  assert.doesNotMatch(JSON.stringify(preview), /52998224725|pessoa1@/u);
  assert.equal(offer.categories[0].lots[0].remaining, 2);
});

test('prévia recusa preço/estoque inválidos e não inventa desconto', () => {
  const input = normalizeRegistrationOrder({
    entries: [entry('52998224725', 'a@example.test'), entry('16899535009', 'b@example.test')],
  });
  const offer = (priceCents, remaining) => ({ categories: [{ id: 'category_0001', remaining: 2, lots: [{ id: 'lot_0001', priceCents, remaining }] }] });
  for (const candidate of [offer(1000, 1), offer(-10, 5), offer(1.5, 2), { categories: [] }]) {
    assert.throws(() => orderPolicy.previewRegistrationOrder(input, candidate), RegistrationReservationPolicyError);
  }
  assert.throws(() => orderPolicy.previewRegistrationOrder({
    ...input, entries: [{ ...input.entries[0], benefitCode: 'PROMO100' }, input.entries[1]],
  }, offer(1000, 2)), /Descontos/u);
});


test('prévia rejeita estoques malformados e mantém capacidade ilimitada explícita', () => {
  const order = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'a@example.test'),
      entry('16899535009', 'b@example.test'),
    ],
  });
  const offer = (remaining) => ({
    categories: [{
      id: 'category_0001', remaining: 2,
      lots: [{ id: 'lot_0001', priceCents: 1000, remaining }],
    }],
  });
  for (const remaining of [-1, 0, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', undefined]) {
    assert.throws(
      () => orderPolicy.previewRegistrationOrder(order, offer(remaining)),
      RegistrationReservationPolicyError,
      `Estoque inválido ou insuficiente: ${String(remaining)}`,
    );
  }
  const unlimited = orderPolicy.previewRegistrationOrder(order, offer(null));
  assert.equal(unlimited.entryCount, 2);
  assert.equal(unlimited.subtotalCents, 2000);
  assert.equal(unlimited.stockReserved, false);
});

test('prévia recusa estouro da capacidade da categoria compartilhada entre lotes', () => {
  const order = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'a@example.test'),
      entry('16899535009', 'b@example.test', { lotId: 'lot_0002' }),
    ],
  });
  const offer = {
    categories: [{
      id: 'category_0001',
      remaining: 1,
      lots: [
        { id: 'lot_0001', priceCents: 2500, remaining: 2 },
        { id: 'lot_0002', priceCents: 3500, remaining: 2 },
      ],
    }],
  };
  assert.throws(
    () => orderPolicy.previewRegistrationOrder(order, offer),
    /vagas suficientes na categoria/u,
  );
  const valid = orderPolicy.previewRegistrationOrder(order, {
    categories: [{ ...offer.categories[0], remaining: 2 }],
  });
  assert.equal(valid.subtotalCents, 6000);
  assert.equal(valid.stockReserved, false);
  assert.doesNotMatch(JSON.stringify(valid), /52998224725|a@example/u);
});

test('plano privado de reserva agrupa categorias/lotes sem expor identidade e vincula idempotência', () => {
  const order = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'pessoa1@example.test'),
      entry('16899535009', 'pessoa2@example.test', { lotId: 'lot_0002' }),
      entry('PASSAPORTE3', 'pessoa3@example.test', { categoryId: 'category_0002', lotId: 'lot_0003' }),
    ],
  });
  const key = 'checkout-group-2026-00001';
  const plan = prepareRegistrationOrderReservation(order, key);
  assert.deepEqual(plan.categoryDemand, [
    { categoryId: 'category_0001', quantity: 2 },
    { categoryId: 'category_0002', quantity: 1 },
  ]);
  assert.deepEqual(plan.lotDemand, [
    { categoryId: 'category_0001', lotId: 'lot_0001', quantity: 1 },
    { categoryId: 'category_0001', lotId: 'lot_0002', quantity: 1 },
    { categoryId: 'category_0002', lotId: 'lot_0003', quantity: 1 },
  ]);
  assert.equal(plan.entries.length, 3);
  assert.equal(plan.payloadHash, registrationOrderPayloadHash(order));
  assert.match(plan.idempotencyKeyHash, /^[a-f0-9]{64}$/u);
  assert.match(plan.entries[0].identityHash, /^[a-f0-9]{64}$/u);
  assert.match(plan.entries[0].emailHash, /^[a-f0-9]{64}$/u);
  assert.equal(prepareRegistrationOrderReservation(order, key).idempotencyKeyHash, plan.idempotencyKeyHash);
  assert.notEqual(prepareRegistrationOrderReservation(order, key + '-new').idempotencyKeyHash, plan.idempotencyKeyHash);
  assert.notEqual(
    prepareRegistrationOrderReservation({ ...order, entries: [...order.entries].reverse() }, key).payloadHash,
    plan.payloadHash,
  );
  assert.doesNotMatch(JSON.stringify(plan), /52998224725|pessoa1@example|PASSAPORTE3/u);
  assert.throws(() => prepareRegistrationOrderReservation(order, 'short'), RegistrationReservationPolicyError);
});

test('plano privado agrega dez entradas no mesmo lote sem confundir capacidade da categoria', () => {
  const order = normalizeRegistrationOrder({
    entries: Array.from({ length: 10 }, (_, index) =>
      entry(`PASSAPORTE${index}`, `pessoa${index}@example.test`)),
  });
  const plan = prepareRegistrationOrderReservation(order, 'checkout-group-2026-00002');
  assert.deepEqual(plan.categoryDemand, [{ categoryId: 'category_0001', quantity: 10 }]);
  assert.deepEqual(plan.lotDemand, [{ categoryId: 'category_0001', lotId: 'lot_0001', quantity: 10 }]);
  assert.equal(new Set(plan.entries.map((item) => item.identityHash)).size, 10);
});

test('prévia não mistura estoques de pares categoria/lote com delimitadores ambíguos', () => {
  const order = {
    entries: [
      { categoryId: 'cat:a', lotId: 'lot', answers: {} },
      { categoryId: 'cat', lotId: 'a:lot', answers: {} },
    ],
  };
  const offer = {
    categories: [
      { id: 'cat:a', remaining: 1, lots: [{ id: 'lot', priceCents: 1000, remaining: 1 }] },
      { id: 'cat', remaining: 1, lots: [{ id: 'a:lot', priceCents: 2000, remaining: 1 }] },
    ],
  };
  const preview = orderPolicy.previewRegistrationOrder(order, offer);
  assert.equal(preview.entryCount, 2);
  assert.equal(preview.subtotalCents, 3000);
  assert.equal(preview.stockReserved, false);
});


test('prévia recusa snapshot de oferta malformado com erro de domínio', () => {
  const order = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'a@example.test'),
      entry('16899535009', 'b@example.test'),
    ],
  });
  for (const offer of [null, undefined, {}, { categories: null }, { categories: {} }]) {
    assert.throws(
      () => orderPolicy.previewRegistrationOrder(order, offer),
      (error) => error instanceof RegistrationReservationPolicyError
        && /Oferta indisponível/u.test(error.message),
    );
  }
});


test('prévia rejeita lotes ausentes ou malformados sem TypeError', () => {
  const order = normalizeRegistrationOrder({
    entries: [
      entry('52998224725', 'a@example.test'),
      entry('16899535009', 'b@example.test'),
    ],
  });
  for (const lots of [undefined, null, {}, 'invalid', [null], [{ id: 'other', priceCents: 1000, remaining: 2 }]]) {
    const offer = { categories: [{ id: 'category_0001', remaining: 2, lots }] };
    assert.throws(
      () => orderPolicy.previewRegistrationOrder(order, offer),
      (error) => error instanceof RegistrationReservationPolicyError
        && /Categoria ou lote indisponível/u.test(error.message),
      `Lotes inválidos: ${JSON.stringify(lots)}`,
    );
  }
});
