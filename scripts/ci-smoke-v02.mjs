import assert from 'node:assert/strict';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const password = `Validacao-${runId}-Aa9!`;

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

const health = await request('/health');
assert.equal(health.status, 'ok');
assert.equal(health.version, '0.2.0-alpha.2');

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

console.log('CI_SMOKE_OK');
