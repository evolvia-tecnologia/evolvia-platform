import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const webBaseUrl = process.env.EVOLVIA_WEB_URL ?? 'http://127.0.0.1:3000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const password = `Validacao-${runId}-Aa9!`;
const expectedVersion = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();

async function request(path, {
  method = 'GET',
  token,
  body,
  expected = 200,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  validFrom: '2026-10-01T12:00:00.000Z',
  validUntil: '2026-10-31T23:59:59.000Z',
};
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

const renderedEvent = await requestWeb(`/evento/${completedEvent.slug}`);
assert.match(renderedEvent.html, /Pular para o conteúdo principal/u);
assert.match(renderedEvent.html, /id="main-content"/u);
assert.match(renderedEvent.html, /tabindex="-1"/u);
assert.match(renderedEvent.html, /aria-label="Navegação principal"/u);
assert.match(renderedEvent.html, /Congresso Automatizado Evolvia/u);
assert.match(renderedEvent.html, /Público estimado/u);
assert.match(withoutReactTextSeparators(renderedEvent.html), /1\.200 pessoas/u);
assert.match(renderedEvent.html, /Que tipo de evento é\?/u);
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

console.log('CI_SMOKE_OK');
