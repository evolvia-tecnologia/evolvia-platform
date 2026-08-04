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
assert.equal(health.version, '0.2.0-alpha.1');

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

console.log('CI_SMOKE_OK');
