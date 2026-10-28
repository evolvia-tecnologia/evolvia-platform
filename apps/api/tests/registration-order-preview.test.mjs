import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationReservationsService } from '../dist/registration-reservations.service.js';

const fields = ['full_name', 'preferred_name', 'identity_document', 'email', 'phone', 'terms_acceptance']
  .map((code) => ({ code, label: code, required: true }));
const options = {
  event: { slug: 'congresso-qa', registrationMode: 'PAID' },
  terms: { fileName: 'termos.pdf', version: 1, url: '/api/termos' },
  categories: [
    { id: 'category_0001', proofRequirement: 'NONE', remaining: 2, lots: [
      { id: 'lot_0001', priceCents: 2700, remaining: 2 },
    ] },
  ],
  fields,
};
function input() {
  const participant = (identity_document, email) => ({
    categoryId: 'category_0001', lotId: 'lot_0001', answers: {
      full_name: 'Participante de Teste', preferred_name: 'Participante',
      identity_document, email, phone: '11999999999', terms_acceptance: true,
    },
  });
  return { entries: [
    participant('52998224725', 'pessoa1@example.test'),
    participant('16899535009', 'pessoa2@example.test'),
  ] };
}
function previewService(view = options) {
  // The exercise is deliberately read-only: no Prisma, gateway, network or fees.
  const service = new RegistrationReservationsService(
    new Proxy({}, { get() { throw new Error('Prisma não deve ser acessado'); } }),
    new Proxy({}, { get() { throw new Error('Asaas não deve ser acessado'); } }),
    new Proxy({}, { get() { throw new Error('Webhook não deve ser acessado'); } }),
  );
  service.getOptions = async (slug) => {
    assert.equal(slug, 'congresso-qa');
    return view;
  };
  return service;
}

test('prévia read-only retorna subtotal sem CPF/e-mail/cobrança e sem reserva', async () => {
  const quote = await previewService().previewOrder('congresso-qa', input());
  assert.equal(quote.entryCount, 2);
  assert.equal(quote.subtotalCents, 5400);
  assert.equal(quote.currency, 'BRL');
  assert.equal(quote.stockReserved, false);
  assert.equal(quote.expiresAt, null);
  assert.equal(quote.requiresProof, false);
  assert.doesNotMatch(JSON.stringify(quote), /52998224725|pessoa1@/u);
});

test('prévia rejeita vagas insuficientes e categoria inexistente, sem pagamento', async () => {
  const service = previewService({ ...options, categories: [{
    ...options.categories[0], lots: [{ ...options.categories[0].lots[0], remaining: 1 }],
  }] });
  await assert.rejects(() => service.previewOrder('congresso-qa', input()), /vagas suficientes/u);
  const noOffer = previewService({ ...options, categories: [] });
  await assert.rejects(() => noOffer.previewOrder('congresso-qa', input()), /lote indisponível/u);
});

test('prévia exige termos e bloqueia campo de outra categoria', async () => {
  const missingTerms = previewService({ ...options, terms: null });
  await assert.rejects(() => missingTerms.previewOrder('congresso-qa', input()), /Política de Privacidade/u);
  const scoping = previewService({ ...options,
    fields: [...fields, { code: 'empresa_exclusiva', label: 'Empresa', required: true, appliesToCategoryIds: ['category_0002'] }],
  });
  const payload = input();
  payload.entries[0].answers.empresa_exclusiva = 'Outra categoria';
  await assert.rejects(() => scoping.previewOrder('congresso-qa', payload), /não pertencem a esta categoria/u);
});

test('prévia impede desconto sem cálculo de benefício e ficha duplicada', async () => {
  const s = previewService();
  const discount = input();
  discount.entries[1].benefitCode = 'CUPOM100';
  await assert.rejects(() => s.previewOrder('congresso-qa', discount), /Descontos/u);
  const repeated = input();
  repeated.entries[1].answers.identity_document = repeated.entries[0].answers.identity_document;
  await assert.rejects(() => s.previewOrder('congresso-qa', repeated), /identidade diferente/u);
});


test('prévia respeita limite compartilhado da categoria mesmo entre lotes diferentes', async () => {
  const order = input();
  order.entries[1].lotId = 'lot_0002';
  const category = {
    ...options.categories[0],
    remaining: 1,
    lots: [
      { ...options.categories[0].lots[0], remaining: 2 },
      { id: 'lot_0002', priceCents: 4100, remaining: 2 },
    ],
  };
  const limited = previewService({ ...options, categories: [category] });
  await assert.rejects(
    () => limited.previewOrder('congresso-qa', order),
    /vagas suficientes na categoria/u,
  );
  const available = previewService({ ...options, categories: [{ ...category, remaining: 2 }] });
  const quote = await available.previewOrder('congresso-qa', order);
  assert.equal(quote.subtotalCents, 6800);
  assert.equal(quote.entryCount, 2);
  assert.equal(quote.stockReserved, false);
  assert.doesNotMatch(JSON.stringify(quote), /52998224725|pessoa1@/u);
});
