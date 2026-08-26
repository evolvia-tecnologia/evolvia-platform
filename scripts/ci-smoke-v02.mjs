import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
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
assert.equal(publication.checklist.blockingCount, 0);

await request(`/public/events/${completedEvent.slug}`, { expected: 404 });

const logoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlJAAAAAASUVORK5CYII=';
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

console.log('CI_SMOKE_OK');
