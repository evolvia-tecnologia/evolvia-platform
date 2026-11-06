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
  return {
    billing: {
      payer: { kind: 'PERSON', name: 'Maria Compradora', document: '52998224725', email: 'pagador@example.test' },
      recipient: { kind: 'PERSON', name: 'Maria Compradora', document: '52998224725', email: 'pagador@example.test' },
    },
    entries: [
      participant('52998224725', 'pessoa1@example.test'),
      participant('16899535009', 'pessoa2@example.test'),
    ],
  };
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

test('prévia de evento pago rejeita ausência de cobrança antes de anunciar checkout', async () => {
  const order = input();
  delete order.billing;
  await assert.rejects(
    () => previewService().previewOrder('congresso-qa', order),
    (error) => error.getStatus?.() === 400 && /Dados de cobrança são obrigatórios/u.test(error.message),
  );
  const free = previewService({ ...options, event: { ...options.event, registrationMode: 'FREE' } });
  const freePreview = await free.previewOrder('congresso-qa', order);
  assert.equal(freePreview.entryCount, 2);
  assert.equal(freePreview.stockReserved, false);
});

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

test('comprovante opcional não é exigido, obrigatório antes de pagamento é sinalizado', async () => {
  const category = options.categories[0];
  const optional = previewService({ ...options, categories: [{ ...category, proofRequirement: 'OPTIONAL' }] });
  const required = previewService({ ...options, categories: [{ ...category, proofRequirement: 'REQUIRED_BEFORE_PAYMENT' }] });
  const optionalPreview = await optional.previewOrder('congresso-qa', input());
  const requiredPreview = await required.previewOrder('congresso-qa', input());
  assert.equal(optionalPreview.requiresProof, false);
  assert.equal(requiredPreview.requiresProof, true);
  assert.equal(optionalPreview.stockReserved, false);
  assert.equal(requiredPreview.stockReserved, false);
  assert.doesNotMatch(JSON.stringify(requiredPreview), /52998224725|pessoa1@/u);
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

test('prévia pública responde 400 a tipos inválidos sem consultar oferta ou gateway', async () => {
  const service = previewService();
  service.getOptions = async () => {
    throw new Error('Não consultar oferta com pedido malformado');
  };
  for (const override of [
    { categoryId: 12345678 },
    { lotId: 12345678 },
    { benefitCode: 100 },
    { benefitCode: ['CUPOM100'] },
  ]) {
    const malformed = input();
    Object.assign(malformed.entries[0], override);
    await assert.rejects(
      () => service.previewOrder('congresso-qa', malformed),
      (error) => error.getStatus?.() === 400
        && /Categoria, lote ou benefício inválidos/u.test(error.message),
    );
  }
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


test('getOptions oculta lotes com categoria esgotada e preserva fila habilitada', async () => {
  const endsAt = new Date(Date.now() + 86_400_000);
  const event = {
    id: 'event-qa', organizationId: 'org-qa', slug: 'congresso-qa',
    name: 'Congresso fictício', status: 'PUBLISHED',
    profileCode: 'SCIENTIFIC_EVENT', eventType: 'Congresso',
    registrationMode: 'PAID', timeZone: 'America/Sao_Paulo',
    registrationForm: null,
    registrationCatalog: { categories: [
      {
        id: 'category_full', name: 'Esgotada', description: null, capacity: 2,
        proofRequirement: 'NONE',
        lots: [{ id: 'lot_full', name: 'Lote cheio', priceCents: 3000, quantity: 10,
          endsAt, waitlistEnabled: true, waitlistClosesAt: null, waitlistOfferMinutes: 15 }],
      },
      {
        id: 'category_closed', name: 'Esgotada sem fila', description: null, capacity: 2,
        proofRequirement: 'NONE',
        lots: [{ id: 'lot_closed', name: 'Lote indisponível', priceCents: 3500, quantity: 10,
          endsAt, waitlistEnabled: false, waitlistClosesAt: null, waitlistOfferMinutes: null }],
      },
      {
        id: 'category_open', name: 'Disponível', description: null, capacity: 3,
        proofRequirement: 'NONE',
        lots: [{ id: 'lot_open', name: 'Lote livre', priceCents: 4000, quantity: 3,
          endsAt, waitlistEnabled: false, waitlistClosesAt: null, waitlistOfferMinutes: null }],
      },
    ] },
  };
  const prisma = {
    event: { findUnique: async ({ where }) => {
      assert.equal(where.slug, 'congresso-qa');
      return event;
    } },
    eventRegistrationReservation: { groupBy: async ({ by, where }) => {
      assert.equal(where.eventId, event.id);
      return by[0] === 'categoryId'
        ? [
          { categoryId: 'category_full', _count: { _all: 2 } },
          { categoryId: 'category_closed', _count: { _all: 2 } },
        ]
        : [];
    } },
    eventRegistrationWaitlistEntry: { groupBy: async ({ where }) => {
      assert.equal(where.eventId, event.id);
      return [];
    } },
    eventRegistrationTermsDocument: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, event.organizationId);
      assert.equal(where.eventId, event.id);
      return { fileName: 'termos.pdf', version: 1 };
    } },
    eventFinancialResponsibility: { findUnique: async () => null },
  };
  const service = new RegistrationReservationsService(prisma, { isConfigured: () => false }, {});
  const result = await service.getOptions('congresso-qa');
  assert.deepEqual(result.categories.map((category) => category.id), ['category_open']);
  assert.equal(result.categories[0].lots[0].id, 'lot_open');
  assert.deepEqual(result.waitlist.map((item) => item.lotId), ['lot_full']);
  assert.equal(result.waitlist[0].categoryId, 'category_full');
});

test('prévia diferencia erro de ficha (400) de falha interna sem expor detalhes ao cliente', async () => {
  // O normalizador aceita a ficha base, mas o formulário publicado exige
  // um campo adicional obrigatório para esta categoria.
  const requiredField = { code: 'empresa_extra', label: 'Empresa obrigatória', required: true };
  const validationService = previewService({ ...options, fields: [...fields, requiredField] });
  await assert.rejects(
    () => validationService.previewOrder('congresso-qa', input()),
    (error) => error.getStatus?.() === 400 && /campo obrigatório/u.test(error.message),
  );

  // Simula falha inesperada ao consultar oferta, sem banco/gateway real.
  // Nest converte erros não HTTP em resposta genérica 500, sem ecoar a mensagem.
  const brokenCategory = { ...options.categories[0] };
  Object.defineProperty(brokenCategory, 'lots', {
    get() { throw new Error('detalhe-interno-nao-publico'); },
  });
  const broken = previewService({ ...options, categories: [brokenCategory] });
  await assert.rejects(
    () => broken.previewOrder('congresso-qa', input()),
    (error) => error.message === 'detalhe-interno-nao-publico'
      && typeof error.getStatus !== 'function',
  );
});


test('falha inesperada durante a validação publicada não vaza detalhes como HTTP 400', async () => {
  const brokenField = { code: 'full_name', label: 'Nome completo' };
  Object.defineProperty(brokenField, 'required', {
    get() { throw new Error('segredo-interno-na-validacao'); },
  });
  const service = previewService({ ...options, fields: [brokenField, ...fields.slice(1)] });
  await assert.rejects(
    () => service.previewOrder('congresso-qa', input()),
    (error) => error.message === 'segredo-interno-na-validacao'
      && typeof error.getStatus !== 'function',
  );
});
