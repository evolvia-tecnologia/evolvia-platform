import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const webBaseUrl = process.env.EVOLVIA_WEB_URL ?? 'http://127.0.0.1:3000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const asaasWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN ?? 'evolvia_ci_webhook_token_32_characters_minimum';
const password = `Validacao-${runId}-Aa9!`;
const expectedVersion = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();

async function request(path, {
  method = 'GET',
  token,
  body,
  headers = {},
  expected = 200,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  assert.equal(
    response.status,
    expected,
    `${method} ${path}: esperado ${expected}, recebido ${response.status}. Resposta: ${text}`,
  );

  return payload;
}

async function requestBinary(path, {
  token,
  expected = 200,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const bytes = Buffer.from(await response.arrayBuffer());

  assert.equal(
    response.status,
    expected,
    `GET ${path}: esperado ${expected}, recebido ${response.status}.`,
  );

  return { response, bytes };
}


async function requestWeb(path, { expected = 200 } = {}) {
  const response = await fetch(`${webBaseUrl}${path}`, {
    headers: { accept: 'text/html' },
  });
  const html = await response.text();

  assert.equal(
    response.status,
    expected,
    `WEB GET ${path}: esperado ${expected}, recebido ${response.status}.`,
  );

  return { response, html };
}

// O SSR hidratável do React separa nós de texto adjacentes com o marcador vazio
// `<!-- -->`. Removê-lo compara exatamente a frase que a pessoa lê, sem descartar
// comentários com conteúdo, tags ou qualquer outra parte do HTML.
function withoutReactTextSeparators(html) {
  return html.replaceAll('<!-- -->', '');
}

const health = await request('/health');
assert.equal(health.status, 'ok');
assert.equal(health.version, expectedVersion);

const live = await request('/health/live');
assert.equal(live.status, 'ok');
assert.equal(live.version, expectedVersion);

const ready = await request('/health/ready');
assert.equal(ready.status, 'ready');
assert.equal(ready.dependencies.database, 'ok');

const ownerEmail = `owner-${runId}@evolvia-ci.local`;
const managerEmail = `manager-${runId}@evolvia-ci.local`;

const owner = await request('/auth/register', {
  method: 'POST',
  expected: 201,
  body: {
    name: 'Proprietário de Validação',
    email: ownerEmail,
    password,
  },
});

const manager = await request('/auth/register', {
  method: 'POST',
  expected: 201,
  body: {
    name: 'Gestor de Validação',
    email: managerEmail,
    password,
  },
});

assert.ok(owner.token);
assert.ok(manager.token);
assert.ok(owner.organization?.id);
assert.ok(manager.organization?.id);
const ownerVerificationToken = createHmac('sha256', process.env.JWT_SECRET ?? '')
  .update(`email-verification:${owner.user.id}`)
  .digest('hex');
await request('/auth/email-verification/confirm', {
  method: 'POST', expected: 201,
  body: { token: ownerVerificationToken },
});

const ownerToken = owner.token;
const managerToken = manager.token;
const ownerOrganizationId = owner.organization.id;
const managerPersonalOrganizationId = manager.organization.id;

const ownerOrganizations = await request('/organizations', {
  token: ownerToken,
});
assert.equal(ownerOrganizations.length, 1);
assert.equal(ownerOrganizations[0].role, 'OWNER');
assert.equal(ownerOrganizations[0].organization.id, ownerOrganizationId);

const membership = await request(
  `/organizations/${ownerOrganizationId}/members`,
  {
    method: 'POST',
    token: ownerToken,
    expected: 201,
    body: {
      email: managerEmail,
      role: 'MANAGER',
    },
  },
);
assert.equal(membership.role, 'MANAGER');

const legalProfilePath = `/organizations/${ownerOrganizationId}/legal-profile`;
const legalProfileBody = {
  expectedRevision: 0, kind: 'COMPANY', legalName: 'Organização de Validação Ltda',
  tradeName: 'Validação', taxId: '11.222.333/0001-81',
  contactEmail: 'fiscal@evolvia-ci.local', postalCode: '01001-000',
  street: 'Praça da Sé', number: '1', complement: '',
  district: 'Sé', city: 'São Paulo', state: 'SP',
};
await request(legalProfilePath, { expected: 401 });
await request(legalProfilePath, { token: managerToken, expected: 404 });
await request(legalProfilePath, {
  method: 'PUT', token: managerToken, expected: 404, body: legalProfileBody,
});
await request(legalProfilePath, {
  method: 'PUT', token: ownerToken, expected: 400,
  body: { ...legalProfileBody, taxId: '11.222.333/0001-82' },
});
const savedLegalProfile = await request(legalProfilePath, {
  method: 'PUT', token: ownerToken, body: legalProfileBody,
});
assert.equal(savedLegalProfile.revision, 1);
assert.equal(savedLegalProfile.profile.taxId, '11222333000181');
assert.equal(savedLegalProfile.verified, false);
await request(legalProfilePath, {
  method: 'PUT', token: ownerToken, expected: 409, body: legalProfileBody,
});
const ownLegalProfile = await request(legalProfilePath, { token: ownerToken });
assert.equal(ownLegalProfile.profile.legalName, legalProfileBody.legalName);
assert.equal(ownLegalProfile.revision, 1);
await request(`/organizations/${managerPersonalOrganizationId}/legal-profile`, {
  token: ownerToken, expected: 404,
});

const managerOrganizations = await request('/organizations', {
  token: managerToken,
});
assert.deepEqual(
  new Set(managerOrganizations.map((item) => item.organization.id)),
  new Set([ownerOrganizationId, managerPersonalOrganizationId]),
);

const sharedEvent = await request('/events', {
  method: 'POST',
  token: managerToken,
  expected: 201,
  body: {
    organizationId: ownerOrganizationId,
    name: 'Evento Compartilhado de Validação',
    eventType: 'Evento corporativo ou treinamento',
    format: 'IN_PERSON',
    venue: 'Ambiente automatizado',
    registrationMode: 'FREE',
  },
});
assert.equal(sharedEvent.organizationId, ownerOrganizationId);
assert.equal(sharedEvent.profileCode, 'CORPORATE_TRAINING');

const ownerEvents = await request(
  `/events?organizationId=${ownerOrganizationId}`,
  { token: ownerToken },
);
assert.ok(ownerEvents.some((event) => event.id === sharedEvent.id));

const bootstrappedWizard = await request(`/event-wizard/${sharedEvent.id}`, {
  token: ownerToken,
});
assert.equal(bootstrappedWizard.session.status, 'COMPLETED');
assert.equal(bootstrappedWizard.session.completionPercent, 100);
assert.equal(bootstrappedWizard.answers.name, 'Evento Compartilhado de Validação');
assert.ok(bootstrappedWizard.answers.capabilities.includes('registration'));

const eventsAfterReadBootstrap = await request(
  `/events?organizationId=${ownerOrganizationId}`,
  { token: ownerToken },
);
const sharedEventAfterRead = eventsAfterReadBootstrap.find(
  (event) => event.id === sharedEvent.id,
);
assert.ok(sharedEventAfterRead);
assert.deepEqual(sharedEventAfterRead.capabilityCodes, []);

const privateEvent = await request('/events', {
  method: 'POST',
  token: managerToken,
  expected: 201,
  body: {
    organizationId: managerPersonalOrganizationId,
    name: 'Evento Privado de Validação',
    eventType: 'Outro tipo de evento',
    format: 'ONLINE',
    venue: 'Ambiente automatizado',
    registrationMode: 'INVITATION',
  },
});
assert.equal(privateEvent.organizationId, managerPersonalOrganizationId);
assert.equal(privateEvent.profileCode, 'OTHER');

await request(
  `/events?organizationId=${managerPersonalOrganizationId}`,
  {
    token: ownerToken,
    expected: 404,
  },
);

await request(
  `/organizations/${ownerOrganizationId}/members/${membership.id}/role`,
  {
    method: 'PATCH',
    token: managerToken,
    expected: 403,
    body: { role: 'OWNER' },
  },
);

const members = await request(
  `/organizations/${ownerOrganizationId}/members`,
  { token: ownerToken },
);
const ownerMembership = members.find(
  (item) => item.user.email === ownerEmail,
);
assert.ok(ownerMembership);

await request(
  `/organizations/${ownerOrganizationId}/members/${ownerMembership.id}/role`,
  {
    method: 'PATCH',
    token: ownerToken,
    expected: 409,
    body: { role: 'ADMIN' },
  },
);

const wizardStarted = await request('/event-wizard/start', {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: {
    organizationId: ownerOrganizationId,
    eventType: 'Congresso ou evento científico',
  },
});

assert.equal(wizardStarted.event.status, 'DRAFT');
assert.equal(wizardStarted.event.profileCode, 'SCIENTIFIC_EVENT');
assert.equal(wizardStarted.session.currentStep, 'format');
assert.equal(wizardStarted.session.revision, 1);
assert.ok(wizardStarted.answers.capabilities.includes('scientific_submission'));

const wizardEventId = wizardStarted.event.id;
const wizardAnswers = {
  ...wizardStarted.answers,
  format: 'HYBRID',
  name: 'Congresso Automatizado Evolvia',
  estimatedAudience: 1200,
  audiencePending: false,
  startDate: '2026-10-20T12:00:00.000Z',
  endDate: '2026-10-22T12:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  datesPending: false,
  venue: 'Centro de Convenções e transmissão online',
  venuePending: false,
  registrationMode: 'PAID',
  capabilitiesCustomized: false,
};

const wizardSaved = await request(`/event-wizard/${wizardEventId}`, {
  method: 'PATCH',
  token: ownerToken,
  body: {
    currentStep: 'review',
    revision: wizardStarted.session.revision,
    answers: wizardAnswers,
  },
});

assert.equal(wizardSaved.session.revision, 2);
assert.equal(wizardSaved.session.completionPercent, 92);
assert.equal(wizardSaved.answers.name, 'Congresso Automatizado Evolvia');
assert.equal(wizardSaved.answers.estimatedAudience, 1200);
assert.equal(wizardSaved.answers.audiencePending, false);
assert.equal(wizardSaved.answers.timeZone, 'America/Sao_Paulo');
assert.ok(wizardSaved.answers.capabilities.includes('payment'));
assert.ok(wizardSaved.answers.capabilities.includes('scientific_submission'));

await request(`/event-wizard/${wizardEventId}`, {
  method: 'PATCH',
  token: ownerToken,
  expected: 409,
  body: {
    currentStep: 'review',
    revision: wizardStarted.session.revision,
    answers: wizardAnswers,
  },
});

const wizardCompleted = await request(`/event-wizard/${wizardEventId}/complete`, {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: {
    currentStep: 'review',
    revision: wizardSaved.session.revision,
    answers: wizardAnswers,
  },
});

assert.equal(wizardCompleted.session.status, 'COMPLETED');
assert.equal(wizardCompleted.session.completionPercent, 100);
assert.equal(wizardCompleted.event.status, 'SETUP');

const authorConfiguration = await request(`/scientific-events/${wizardEventId}/submissions/config`, {
  method: 'PUT', token: ownerToken,
  body: { requireFile: false, minAuthors: 1, maxSubmissionsPerAuthor: 2, minKeywords: 2, maxKeywords: 4 },
});
assert.equal(authorConfiguration.config.maxSubmissionsPerAuthor, 2);
const authorModality = await request(`/scientific-events/${wizardEventId}/submissions/modalities`, {
  method: 'POST', token: ownerToken, expected: 201, body: { name: 'Resumo simples' },
});
const authorModalityId = authorModality.modalities.find((item) => item.name === 'Resumo simples')?.id;
assert.ok(authorModalityId);

const reloadedWizard = await request(`/event-wizard/${wizardEventId}`, {
  token: ownerToken,
});
assert.equal(reloadedWizard.answers.estimatedAudience, 1200);
assert.equal(reloadedWizard.answers.audiencePending, false);

const emptyBenefits = await request(`/events/${wizardEventId}/registration-benefits`, { token: ownerToken });
assert.equal(emptyBenefits.revision, 0);
assert.deepEqual(emptyBenefits.benefits, []);
assert.equal(emptyBenefits.publicRedemptionEnabled, false);

const benefitPeriod = {
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-12-31T23:59:59.000Z',
};

const savedCommercial = await request(`/events/${wizardEventId}/registration-commercial`, {
  method: 'PUT',
  token: ownerToken,
  body: {
    expectedRevision: 0,
    categories: [{
      code: 'participante',
      name: 'Participante',
      description: 'Categoria pública validada pelo smoke.',
      capacity: 20,
      proofRequirement: 'NONE',
      lots: [{
        code: 'lote_unico',
        name: 'Lote único',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2027-12-31T23:59:59.000Z',
        quantity: 10,
        priceCents: 10000,
      }],
    }],
  },
});
assert.equal(savedCommercial.categories.length, 1);
assert.equal(savedCommercial.categories[0].lots.length, 1);

const savedBenefits = await request(`/events/${wizardEventId}/registration-benefits`, {
  method: 'PUT',
  token: ownerToken,
  body: {
    expectedRevision: 0,
    benefits: [
      { code: 'LANCAMENTO-20', name: 'Lançamento 20%', kind: 'COUPON', discountPercent: 20, maxUses: 100, ...benefitPeriod },
      { code: 'CONVIDADO-VIP', name: 'Convidado VIP', kind: 'INVITATION', discountPercent: 0, maxUses: 10, ...benefitPeriod },
      { code: 'CORTESIA-IMPRENSA', name: 'Cortesia imprensa', kind: 'COURTESY', discountPercent: 100, maxUses: 5, ...benefitPeriod },
    ],
  },
});
assert.equal(savedBenefits.revision, 1);
assert.equal(savedBenefits.benefits.length, 3);
assert.equal(savedBenefits.benefits.find((benefit) => benefit.kind === 'COURTESY')?.discountPercent, 100);
assert.equal(savedBenefits.publicRedemptionEnabled, false);

await request(`/events/${wizardEventId}/registration-benefits`, {
  method: 'PUT', token: ownerToken, expected: 409,
  body: { expectedRevision: 0, benefits: [] },
});
await request(`/events/${privateEvent.id}/registration-benefits`, { token: ownerToken, expected: 404 });
await request(`/events/${sharedEvent.id}/registration-benefits`, {
  method: 'PUT', token: ownerToken, expected: 400,
  body: {
    expectedRevision: 0,
    benefits: [{ code: 'CUPOM-GRATIS', name: 'Cupom inválido', kind: 'COUPON', discountPercent: 10, maxUses: 1, ...benefitPeriod }],
  },
});

const managerWizard = await request('/event-wizard/start', {
  method: 'POST',
  token: managerToken,
  expected: 201,
  body: {
    organizationId: managerPersonalOrganizationId,
    eventType: 'Outro tipo de evento',
  },
});

await request(`/event-wizard/${managerWizard.event.id}`, {
  token: ownerToken,
  expected: 404,
});

const ownerEventsAfterWizard = await request(
  `/events?organizationId=${ownerOrganizationId}`,
  { token: ownerToken },
);
const completedEvent = ownerEventsAfterWizard.find((event) => event.id === wizardEventId);
assert.ok(completedEvent);
assert.equal(completedEvent.wizard.completionPercent, 100);
assert.ok(completedEvent.capabilityCodes.includes('registration'));
assert.ok(completedEvent.capabilityCodes.includes('payment'));


const publication = await request(`/events/${wizardEventId}/publication`, {
  method: 'PATCH',
  token: ownerToken,
  body: {
    revision: 0,
    shortDescription: 'Página pública validada pelo smoke do Go/No-Go.',
    publicContactEmail: ownerEmail,
    accessibilitySummary: 'Entrada acessível e canal de apoio informado.',
  },
});
assert.equal(publication.publication.revision, 1);
assert.equal(publication.checklist.blockingCount, 1);
const pendingPublicMedia = publication.checklist.items.find((item) => item.code === 'PUBLIC_MEDIA');
assert.ok(pendingPublicMedia);
assert.equal(pendingPublicMedia.ready, false);
assert.equal(pendingPublicMedia.required, true);

await request(`/public/events/${completedEvent.slug}`, { expected: 404 });

const logoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
const uploadedLogo = await request(`/events/${wizardEventId}/publication/media`, {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: {
    usage: 'LOGO',
    contentBase64: logoBase64,
    altText: 'Marca do evento de validação',
    decorative: false,
    publicationRevision: 1,
  },
});
assert.equal(uploadedLogo.publicationRevision, 2);
assert.equal(uploadedLogo.media.usage, 'LOGO');
assert.equal(uploadedLogo.media.mimeType, 'image/png');
assert.equal(uploadedLogo.media.width, 1);
assert.equal(uploadedLogo.media.height, 1);
assert.equal(JSON.stringify(uploadedLogo).includes('storageKey'), false);
assert.equal(JSON.stringify(uploadedLogo).includes('checksumSha256'), false);

const publicationAfterLogo = await request(`/events/${wizardEventId}/publication`, {
  token: ownerToken,
});
assert.equal(publicationAfterLogo.publication.revision, 2);
assert.equal(publicationAfterLogo.checklist.blockingCount, 0);
assert.equal(
  publicationAfterLogo.checklist.items.find((item) => item.code === 'PUBLIC_MEDIA')?.ready,
  true,
);

const adminMedia = await request(`/events/${wizardEventId}/publication/media`, {
  token: ownerToken,
});
assert.equal(adminMedia.length, 1);
assert.equal(adminMedia[0].usage, 'LOGO');

const privateLogo = await requestBinary(`/events/${wizardEventId}/publication/media/LOGO`, {
  token: ownerToken,
});
assert.equal(privateLogo.response.headers.get('content-type'), 'image/png');
assert.equal(privateLogo.response.headers.get('cache-control'), 'private, no-store');
assert.equal(privateLogo.response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(privateLogo.bytes.toString('base64'), logoBase64);

const privatePreview = await request(`/events/${wizardEventId}/publication/preview`, {
  token: ownerToken,
});
assert.equal(privatePreview.event.slug, completedEvent.slug);
assert.equal(privatePreview.media.logo.usage, 'LOGO');
assert.equal(privatePreview.media.logo.url, `/api/events/${wizardEventId}/publication/media/LOGO`);
assert.equal(JSON.stringify(privatePreview).includes('storageKey'), false);

await requestBinary(`/public/events/${completedEvent.slug}/media/LOGO`, {
  expected: 404,
});

const inHomologation = await request(`/events/${wizardEventId}/publication/status`, {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: { targetStatus: 'HOMOLOGATION', publicationRevision: 2 },
});
assert.equal(inHomologation.event.status, 'HOMOLOGATION');
assert.equal(inHomologation.permissions.canEdit, false);

await request(`/events/${wizardEventId}/publication`, {
  method: 'PATCH',
  token: ownerToken,
  expected: 409,
  body: { revision: 1, shortDescription: 'Alteração proibida durante a homologação.' },
});

const readyToPublish = await request(`/events/${wizardEventId}/publication/status`, {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: { targetStatus: 'READY_TO_PUBLISH', publicationRevision: 2 },
});
assert.equal(readyToPublish.event.status, 'READY_TO_PUBLISH');

await request(`/events/${wizardEventId}/publication/status`, {
  method: 'POST',
  token: ownerToken,
  expected: 400,
  body: { targetStatus: 'PUBLISHED', publicationRevision: 2 },
});

const published = await request(`/events/${wizardEventId}/publication/status`, {
  method: 'POST',
  token: ownerToken,
  expected: 201,
  body: { targetStatus: 'PUBLISHED', publicationRevision: 2, confirmation: 'PUBLICAR' },
});
assert.equal(published.event.status, 'PUBLISHED');

const publicPage = await request(`/public/events/${completedEvent.slug}`);
assert.equal(publicPage.event.slug, completedEvent.slug);

const registrationOptions = await request(`/public/events/${completedEvent.slug}/registration`);
assert.equal(registrationOptions.categories.length, 1);
assert.equal(registrationOptions.categories[0].lots.length, 1);
assert.equal(registrationOptions.paymentEnabled, true);

const reservationBody = {
  categoryId: savedCommercial.categories[0].id,
  lotId: savedCommercial.categories[0].lots[0].id,
  benefitCode: 'LANCAMENTO-20',
  answers: {
    full_name: 'Participante Reserva',
    preferred_name: 'Participante',
    identity_document: `DOC-${runId}`,
    email: `reserva-${runId}@evolvia-ci.local`,
    phone: '11999999999',
    terms_acceptance: true,
  },
};
const reservationHeaders = { 'idempotency-key': `ci-reservation-${runId}` };
const reservation = await request(`/public/events/${completedEvent.slug}/registration/reservations`, {
  method: 'POST',
  headers: reservationHeaders,
  body: reservationBody,
  expected: 201,
});
assert.equal(reservation.status, 'PENDING_PAYMENT');
assert.equal(reservation.basePriceCents, 10000);
assert.equal(reservation.discountPercent, 20);
assert.equal(reservation.finalPriceCents, 8000);
assert.match(reservation.protocol, /^EVO-[A-F0-9]{16}$/u);
assert.equal(reservation.paymentEnabled, true);

const replayedReservation = await request(`/public/events/${completedEvent.slug}/registration/reservations`, {
  method: 'POST',
  headers: reservationHeaders,
  body: reservationBody,
  expected: 201,
});
assert.equal(replayedReservation.protocol, reservation.protocol);

const checkoutHeaders = { 'idempotency-key': `ci-checkout-${runId}` };
const checkout = await request(`/public/events/${completedEvent.slug}/registration/reservations/${reservation.protocol}/checkout`, {
  method: 'POST',
  headers: checkoutHeaders,
  body: {},
  expected: 201,
});
assert.equal(checkout.reservationStatus, 'PENDING_PAYMENT');
assert.equal(checkout.checkoutStatus, 'ACTIVE');
assert.equal(checkout.amountCents, 8000);
assert.match(checkout.checkoutUrl, /^https:\/\/sandbox\.asaas\.com\/checkoutSession\/show\/ci_[a-f0-9]{32}$/u);

const replayedCheckout = await request(`/public/events/${completedEvent.slug}/registration/reservations/${reservation.protocol}/checkout`, {
  method: 'POST',
  headers: checkoutHeaders,
  body: {},
  expected: 201,
});
assert.equal(replayedCheckout.checkoutUrl, checkout.checkoutUrl);

await request(`/public/events/${completedEvent.slug}/registration/reservations/${reservation.protocol}/checkout`, {
  method: 'POST',
  headers: { 'idempotency-key': `ci-checkout-conflict-${runId}` },
  body: {},
  expected: 409,
});

const providerCheckoutId = checkout.checkoutUrl.split('/').at(-1);
const webhookBody = {
  id: `evt_checkout_paid_${runId}`,
  event: 'CHECKOUT_PAID',
  checkout: {
    id: providerCheckoutId,
    status: 'PAID',
    items: [{ name: 'Inscrição Evolvia', quantity: 1, value: 80 }],
    additionalFutureField: 'ignored-by-contract',
  },
};
await request('/webhooks/asaas/checkout', {
  method: 'POST',
  headers: { 'asaas-access-token': 'invalid-token-with-32-characters-minimum' },
  body: webhookBody,
  expected: 401,
});
const webhook = await request('/webhooks/asaas/checkout', {
  method: 'POST',
  headers: { 'asaas-access-token': asaasWebhookToken },
  body: webhookBody,
  expected: 201,
});
assert.deepEqual(webhook, { accepted: true, duplicate: false, queued: false });
const duplicateWebhook = await request('/webhooks/asaas/checkout', {
  method: 'POST',
  headers: { 'asaas-access-token': asaasWebhookToken },
  body: webhookBody,
  expected: 201,
});
assert.deepEqual(duplicateWebhook, { accepted: true, duplicate: true, queued: false });

const paidStatus = await request(`/public/events/${completedEvent.slug}/registration/reservations/${reservation.protocol}`);
assert.equal(paidStatus.reservationStatus, 'CONFIRMED');
assert.equal(paidStatus.checkoutStatus, 'PAID');
assert.equal(paidStatus.paymentConfirmed, true);
assert.equal(paidStatus.checkoutUrl, null);

await request('/participant/me', { expected: 401 });
const participantSignup = {
  name: 'Participante Reserva',
  email: reservationBody.answers.email,
  password,
};
// Criar conta não exige inscrição prévia nem documento; o vínculo acontece após confirmar o e-mail.
const participantAccount = await request('/auth/participant/register', {
  method: 'POST', expected: 201, body: participantSignup,
});
assert.ok(participantAccount.token);
assert.equal(participantAccount.emailVerificationRequired, true);
const unverifiedDashboard = await request('/participant/me', { token: participantAccount.token });
assert.equal(unverifiedDashboard.emailVerified, false);
assert.equal(unverifiedDashboard.linked, false);
assert.equal(unverifiedDashboard.events.length, 0);
await request('/participant/links', {
  method: 'POST', expected: 403, token: participantAccount.token,
  body: { identityDocument: reservationBody.answers.identity_document },
});
const verificationToken = createHmac('sha256', process.env.JWT_SECRET ?? '')
  .update(`email-verification:${participantAccount.user.id}`)
  .digest('hex');
await request('/auth/email-verification/confirm', {
  method: 'POST', expected: 201,
  body: { token: verificationToken },
});
await request('/auth/email-verification/confirm', {
  method: 'POST', expected: 401,
  body: { token: verificationToken },
});
const participantOrganizations = await request('/organizations', { token: participantAccount.token });
assert.deepEqual(participantOrganizations, []);
const creationKey = `participant-organization-${runId}`;
await request('/organizations', {
  method: 'POST', expected: 400, token: participantAccount.token,
  body: { name: 'Organização da Participante' },
});
const participantOrganization = await request('/organizations', {
  method: 'POST', expected: 201, token: participantAccount.token,
  headers: { 'idempotency-key': creationKey },
  body: { name: 'Organização da Participante' },
});
assert.ok(participantOrganization.id);
const creationReplay = await request('/organizations', {
  method: 'POST', expected: 201, token: participantAccount.token,
  headers: { 'idempotency-key': creationKey },
  body: { name: 'Organização da Participante' },
});
assert.equal(creationReplay.id, participantOrganization.id);
await request('/organizations', {
  method: 'POST', expected: 409, token: participantAccount.token,
  headers: { 'idempotency-key': creationKey },
  body: { name: 'Outro nome' },
});
const participantMemberships = await request('/organizations', { token: participantAccount.token });
assert.equal(participantMemberships.length, 1);
assert.equal(participantMemberships[0].role, 'OWNER');
assert.equal(participantMemberships[0].organization.id, participantOrganization.id);
const accountLogin = await request('/auth/login', {
  method: 'POST', expected: 201, body: { email: participantSignup.email, password },
});
const dashboard = await request('/participant/me', { token: accountLogin.token });
assert.equal((await request('/me', { token: accountLogin.token })).memberships.length, 1);
assert.equal(dashboard.emailVerified, true);
assert.equal(dashboard.linked, false);
assert.equal(dashboard.events.length, 0);
await request('/participant/links', {
  method: 'POST', expected: 401, token: accountLogin.token,
  body: { identityDocument: 'DOCUMENTO-INCORRETO' },
});
const linkedDashboard = await request('/participant/links', {
  method: 'POST', expected: 201, token: accountLogin.token,
  body: { identityDocument: reservationBody.answers.identity_document },
});
assert.equal(linkedDashboard.linked, true);
assert.equal(linkedDashboard.events.length, 1);
assert.equal(linkedDashboard.events[0].slug, completedEvent.slug);
assert.equal(JSON.stringify(dashboard).includes(reservationBody.answers.identity_document), false);
const dashboardSession = await request(`/participant/events/${completedEvent.slug}/sessions`, {
  method: 'POST', expected: 201, token: accountLogin.token, body: {},
});
const dashboardArea = await request(`/public/events/${completedEvent.slug}/participant/me`, {
  token: dashboardSession.accessToken,
});
assert.equal(dashboardArea.registration.protocol, reservation.protocol);
await request(`/participant/events/${privateEvent.slug}/sessions`, {
  method: 'POST', expected: 404, token: accountLogin.token, body: {},
});

const organizerReservation = await request(`/public/events/${completedEvent.slug}/registration/reservations`, {
  method: 'POST', expected: 201, headers: { 'idempotency-key': `ci-dual-role-${runId}` },
  body: { ...reservationBody,
    answers: { ...reservationBody.answers, full_name: 'Organizador Participante',
      identity_document: `DOC-OWNER-${runId}`, email: ownerEmail },
  },
});
const organizerBeforeLink = await request('/participant/me', { token: ownerToken });
assert.equal(organizerBeforeLink.linked, false);
const organizerLinked = await request('/participant/links', {
  method: 'POST', expected: 201, token: ownerToken,
  body: { protocol: organizerReservation.protocol, identityDocument: `DOC-OWNER-${runId}` },
});
assert.equal(organizerLinked.events.length, 1);
assert.equal(organizerLinked.events[0].status, 'PENDING_PAYMENT');
assert.equal((await request('/organizations', { token: ownerToken })).length, 1);

await request(`/public/events/${completedEvent.slug}/participant/sessions`, {
  method: 'POST',
  body: { identityDocument: 'DOCUMENTO-INCORRETO' },
  expected: 401,
});

const participantSession = await request(`/public/events/${completedEvent.slug}/participant/sessions`, {
  method: 'POST',
  body: { protocol: reservation.protocol, identityDocument: reservationBody.answers.identity_document },
  expected: 201,
});
assert.match(participantSession.accessToken, /^[a-f0-9]{64}$/u);
assert.ok(Date.parse(participantSession.expiresAt) > Date.now());

const participantArea = await request(`/public/events/${completedEvent.slug}/participant/me`, {
  token: participantSession.accessToken,
});
assert.equal(participantArea.event.slug, completedEvent.slug);
assert.equal(participantArea.registration.protocol, reservation.protocol);
assert.equal(participantArea.registration.status, 'CONFIRMED');
assert.equal(participantArea.registration.category, savedCommercial.categories[0].name);
assert.equal(participantArea.registration.lot, savedCommercial.categories[0].lots[0].name);
assert.equal(participantArea.payment.status, 'PAID');
for (const forbidden of ['registrationData', 'identityHash', 'emailHash', 'tokenHash', 'full_name']) {
  assert.equal(JSON.stringify(participantArea).includes(forbidden), false);
}

assert.equal(participantArea.event.profileCode, 'SCIENTIFIC_EVENT');
await request(`/public/events/${completedEvent.slug}/participant/submissions`, { expected: 401 });
const authorPath = `/public/events/${completedEvent.slug}/participant/submissions`;
const authorBefore = await request(authorPath, { token: participantSession.accessToken });
assert.equal(authorBefore.available, true);
assert.deepEqual(authorBefore.submissions, []);
const authorBody = {
  modalityId: authorModalityId,
  title: 'Primeiro trabalho de autor confirmado',
  abstractText: 'Resumo científico submetido pelo participante confirmado no evento de validação.',
  keywords: ['evento', 'pesquisa'],
  institution: 'Instituto Evolvia',
};
const authorHeaders = { 'idempotency-key': `ci-author-${runId}-first` };
const authorSubmitted = await request(authorPath, {
  method: 'POST', expected: 201, token: participantSession.accessToken, headers: authorHeaders, body: authorBody,
});
assert.equal(authorSubmitted.status, 'SUBMITTED');
assert.equal(authorSubmitted.duplicate, false);
const authorReplay = await request(authorPath, {
  method: 'POST', expected: 201, token: participantSession.accessToken, headers: authorHeaders, body: authorBody,
});
assert.equal(authorReplay.id, authorSubmitted.id);
assert.equal(authorReplay.duplicate, true);
await request(authorPath, {
  method: 'POST', expected: 409, token: participantSession.accessToken, headers: authorHeaders,
  body: { ...authorBody, title: 'Outro título na mesma chave' },
});
const authorAfter = await request(authorPath, { token: participantSession.accessToken });
assert.equal(authorAfter.submissions.length, 1);
assert.equal(authorAfter.submissions[0].currentVersion, 1);
const organizerSubmissions = await request(`/scientific-events/${wizardEventId}/submissions`, { token: ownerToken });
assert.equal(organizerSubmissions.summary.submitted, 1);
assert.equal(organizerSubmissions.submissions[0].versions.length, 1);
assert.equal(organizerSubmissions.submissions[0].authors.length, 1);

assert.match(participantArea.credential.code, /^EVQ1\.[a-z0-9]+\.[a-f0-9]{64}$/u);
assert.equal(participantArea.credential.checkedInAt, null);

await request(`/events/${wizardEventId}/check-in`, {
  method: 'POST', body: { code: participantArea.credential.code }, expected: 401,
});
await request(`/events/${privateEvent.id}/check-in`, {
  method: 'POST', token: ownerToken, body: { code: participantArea.credential.code }, expected: 404,
});
await request(`/events/${wizardEventId}/check-in`, {
  method: 'POST', token: ownerToken, body: { code: 'EVQ1.invalid.signature' }, expected: 400,
});
const checkIn = await request(`/events/${wizardEventId}/check-in`, {
  method: 'POST', token: managerToken, body: { code: participantArea.credential.code }, expected: 201,
});
assert.equal(checkIn.protocol, reservation.protocol);
assert.equal(checkIn.alreadyCheckedIn, false);
const repeatedCheckIn = await request(`/events/${wizardEventId}/check-in`, {
  method: 'POST', token: ownerToken, body: { code: participantArea.credential.code }, expected: 201,
});
assert.equal(repeatedCheckIn.alreadyCheckedIn, true);
assert.equal(repeatedCheckIn.checkedInAt, checkIn.checkedInAt);
const refreshedParticipantArea = await request(`/public/events/${completedEvent.slug}/participant/me`, {
  token: participantSession.accessToken,
});
assert.equal(refreshedParticipantArea.credential.checkedInAt, checkIn.checkedInAt);
await request(`/events/${wizardEventId}/registration-operations`, { expected: 401 });
await request(`/events/${privateEvent.id}/registration-operations`, { token: ownerToken, expected: 404 });
await request(`/events/${wizardEventId}/registration-operations?status=INVALID`, { token: ownerToken, expected: 400 });
const operations = await request(`/events/${wizardEventId}/registration-operations?status=CONFIRMED&protocol=${reservation.protocol}`, {
  token: managerToken,
});
assert.equal(operations.event.id, wizardEventId);
assert.equal(operations.summary.CONFIRMED, 1);
assert.equal(operations.summary.checkedIn, 1);
assert.equal(operations.total, 1);
assert.equal(operations.items[0].protocol, reservation.protocol);
assert.equal(operations.items[0].paymentStatus, 'PAID');
assert.equal(operations.items[0].checkedInAt, checkIn.checkedInAt);
for (const forbidden of ['registrationData', 'identityHash', 'emailHash', 'tokenHash', 'full_name', 'identity_document']) {
  assert.equal(JSON.stringify(operations).includes(forbidden), false);
}


const revokedParticipantSession = await request(`/public/events/${completedEvent.slug}/participant/sessions/current`, {
  method: 'DELETE',
  token: participantSession.accessToken,
});
assert.deepEqual(revokedParticipantSession, { revoked: true });
await request(`/public/events/${completedEvent.slug}/participant/me`, {
  token: participantSession.accessToken,
  expected: 401,
});

await request(`/public/events/${completedEvent.slug}/registration/reservations`, {
  method: 'POST',
  headers: { 'idempotency-key': `ci-reservation-duplicate-${runId}` },
  body: reservationBody,
  expected: 409,
});

assert.equal(publicPage.event.eventType, 'Congresso ou evento científico');
assert.equal(publicPage.event.profileCode, 'SCIENTIFIC_EVENT');
assert.equal(publicPage.event.estimatedAudience, 1200);
assert.equal(JSON.stringify(publicPage).includes(ownerOrganizationId), false);
assert.equal(publicPage.media.logo.usage, 'LOGO');
assert.equal(publicPage.media.logo.url, `/api/public/events/${completedEvent.slug}/media/LOGO`);
for (const forbidden of ['storageKey', 'checksumSha256', 'byteSize', 'updatedAt']) {
  assert.equal(JSON.stringify(publicPage).includes(forbidden), false);
}

const publicLogo = await requestBinary(`/public/events/${completedEvent.slug}/media/LOGO`);
assert.equal(publicLogo.response.headers.get('content-type'), 'image/png');
assert.match(publicLogo.response.headers.get('cache-control') ?? '', /^public, max-age=3600/);
assert.equal(publicLogo.response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(publicLogo.response.headers.get('content-disposition'), 'inline');
assert.equal(publicLogo.bytes.toString('base64'), logoBase64);

const filteredDiscovery = await request('/public/events?profile=SCIENTIFIC_EVENT&q=Congresso%20Automatizado');
assert.equal(filteredDiscovery.total, 1);
assert.equal(filteredDiscovery.items[0].slug, completedEvent.slug);
assert.equal(filteredDiscovery.items[0].profileCode, 'SCIENTIFIC_EVENT');
assert.equal(filteredDiscovery.items[0].estimatedAudience, 1200);

const incompatibleProfile = await request('/public/events?profile=ENTERTAINMENT&q=Congresso%20Automatizado');
assert.equal(incompatibleProfile.total, 0);
assert.deepEqual(incompatibleProfile.items, []);

const renderedCatalog = await requestWeb('/eventos?profile=SCIENTIFIC_EVENT');
assert.match(renderedCatalog.html, /Pular para o conteúdo principal/u);
assert.match(renderedCatalog.html, /id="main-content"/u);
assert.match(renderedCatalog.html, /Congresso Automatizado Evolvia/u);
assert.match(withoutReactTextSeparators(renderedCatalog.html), /Público estimado:\s*1\.200 pessoas/u);
assert.match(renderedCatalog.html, new RegExp(`/evento/${completedEvent.slug}`, 'u'));

const renderedParticipantEntry = await requestWeb('/participante');
assert.match(renderedParticipantEntry.html, /Área do participante/u);
assert.match(renderedParticipantEntry.html, /Carregando sua conta/u);

const renderedParticipantLogin = await requestWeb(`/evento/${completedEvent.slug}/participante`);
assert.match(renderedParticipantLogin.html, /Acompanhe sua inscrição/u);
assert.match(renderedParticipantLogin.html, /Código da inscrição/u);

const renderedEvent = await requestWeb(`/evento/${completedEvent.slug}`);
assert.match(renderedEvent.html, /Pular para o conteúdo principal/u);
assert.match(renderedEvent.html, /id="main-content"/u);
assert.match(renderedEvent.html, /tabindex="-1"/u);
assert.match(renderedEvent.html, /aria-label="Navegação principal"/u);
assert.match(renderedEvent.html, /Congresso Automatizado Evolvia/u);
assert.match(renderedEvent.html, /Público estimado/u);
assert.match(withoutReactTextSeparators(renderedEvent.html), /1\.200 pessoas/u);
assert.match(renderedEvent.html, /Que tipo de evento é\?/u);
assert.match(renderedEvent.html, /Área do participante/u);
assert.match(renderedEvent.html, /Já me inscrevi/u);
assert.match(renderedEvent.html, /alt="Marca do evento de validação"/u);
assert.equal(renderedEvent.html.includes(ownerOrganizationId), false);
for (const forbidden of ['storageKey', 'checksumSha256', 'byteSize', 'updatedAt']) {
  assert.equal(renderedEvent.html.includes(forbidden), false);
}

assert.equal(
  renderedEvent.html.includes(`src="${publicPage.media.logo.url}"`),
  true,
);

await requestWeb(`/evento/${completedEvent.slug}-inexistente`, { expected: 404 });

const raceAccount = await request('/auth/register', {
  method: 'POST', expected: 201,
  body: { name: 'Teste de concorrência', email: `race-${runId}@evolvia-ci.local`, password },
});
const raceRequests = await Promise.all([0, 1].map(() => request('/organizations', {
  method: 'POST', expected: 201, token: raceAccount.token,
  headers: { 'idempotency-key': creationKey },
  body: { name: 'Organização concorrente' },
})));
assert.equal(raceRequests[0].id, raceRequests[1].id);
assert.notEqual(raceRequests[0].id, participantOrganization.id);
const raceOrganizations = await request('/organizations', { token: raceAccount.token });
assert.equal(raceOrganizations.length, 2); // pessoal + uma criação concorrente

console.log('CI_SMOKE_OK');
