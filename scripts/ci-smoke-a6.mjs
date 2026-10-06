import assert from 'node:assert/strict';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const password = `A6-${runId}-Aa9!seguro`;

async function request(path, { method = 'GET', token, body, expected = 200 } = {}) {
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
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  assert.equal(response.status, expected, `${method} ${path}: esperado ${expected}, recebido ${response.status}. Resposta: ${text}`);
  return payload;
}

const owner = await request('/auth/register', {
  method: 'POST', expected: 201,
  body: { name: 'Responsável Seis', email: `a6-owner-${runId}@evolvia-ci.local`, password },
});
assert.ok(owner.token);
assert.ok(owner.organization?.id);
const token = owner.token;
const organizationId = owner.organization.id;

const event = await request('/events', {
  method: 'POST', token, expected: 201,
  body: {
    organizationId,
    name: 'Congresso A6 Automatizado',
    eventType: 'Congresso científico de cardiologia',
    format: 'HYBRID',
    startDate: '2026-10-20T00:00:00.000Z',
    endDate: '2026-10-22T23:59:59.000Z',
    venue: 'Centro de Convenções Evolvia',
    registrationMode: 'FREE',
    subjectAreas: ['saude'],
  },
});
assert.equal(event.profileCode, 'SCIENTIFIC_EVENT');
assert.deepEqual(event.subjectAreas, ['saude']);

let management = await request(`/scientific-events/${event.id}/submissions/config`, {
  method: 'PUT', token,
  body: {
    requireArea: true,
    requireSubarea: true,
    requireFile: true,
    minAuthors: 1,
    maxAuthors: 5,
    reviewMode: 'DOUBLE_BLIND',
    allowCorrections: true,
  },
});
assert.equal(management.config.requireArea, true);
assert.equal(management.config.requireSubarea, true);
assert.equal(management.config.requireFile, true);
assert.equal(management.config.reviewMode, 'DOUBLE_BLIND');
assert.equal(management.actorBoundary.management, 'ORGANIZER');
assert.equal(management.actorBoundary.authorActionsAvailableHere, false);

management = await request(`/scientific-events/${event.id}/submissions/modalities`, {
  method: 'POST', token, expected: 201,
  body: {
    name: 'Pôster digital',
    description: 'Resumo estruturado para apresentação em ePoster.',
    rules: { presenterRequired: true, fileEnabled: true },
  },
});
assert.equal(management.modalities.length, 1);
assert.equal(management.modalities[0].name, 'Pôster digital');
assert.equal(management.summary.total, 0);

// Fronteira crítica A6: o painel administrativo não pode executar ações do autor.
await request(`/scientific-events/${event.id}/submissions`, {
  method: 'POST', token, expected: 404,
  body: { modalityId: management.modalities[0].id, title: 'Não deve ser criado pelo organizador' },
});
await request(`/scientific-events/${event.id}/submissions/submission-inexistente/authors`, {
  method: 'POST', token, expected: 404,
  body: { personId: 'person-inexistente', sortOrder: 1, isPresenter: true },
});
await request(`/scientific-events/${event.id}/submissions/submission-inexistente/submit`, {
  method: 'POST', token, expected: 404,
  body: { fileKey: 'nao-deve-ser-enviado.pdf' },
});
await request(`/scientific-events/${event.id}/submissions/submission-inexistente/corrections`, {
  method: 'POST', token, expected: 404,
  body: { reason: 'A correção pertence ao autor.', contentHash: 'hash-inexistente' },
});

management = await request(`/scientific-events/${event.id}/submissions`, { token });
assert.equal(management.summary.total, 0);
assert.equal(management.actorBoundary.authorActionsAvailableHere, false);
assert.match(management.actorBoundary.message, /autor/i);

// Fronteira crítica A7: a superfície administrativa não pode virar a área pessoal do avaliador.
await request(`/scientific-events/${event.id}/reviews/mine`, { token, expected: 404 });
await request(`/scientific-events/${event.id}/reviews/mine/assignment-inexistente/conflict`, {
  method: 'PUT', token, expected: 404, body: { hasConflict: false },
});
await request(`/scientific-events/${event.id}/reviews/mine/assignment-inexistente/draft`, {
  method: 'PUT', token, expected: 404, body: { scores: [] },
});
await request(`/scientific-events/${event.id}/reviews/mine/assignment-inexistente/submit`, {
  method: 'POST', token, expected: 404, body: { scores: [] },
});

console.log('CI_SMOKE_A6_OK');
