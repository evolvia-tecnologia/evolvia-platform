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
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: esperado ${expected}, recebido ${response.status}. Resposta: ${text}`,
  );
  return payload;
}

const owner = await request('/auth/register', {
  method: 'POST', expected: 201,
  body: { name: 'Responsável A6', email: `a6-owner-${runId}@evolvia-ci.local`, password },
});
assert.ok(owner.token);
assert.ok(owner.organization?.id);
const token = owner.token;
const organizationId = owner.organization.id;

async function createScientificEvent(name) {
  return request('/events', {
    method: 'POST', token, expected: 201,
    body: {
      organizationId,
      name,
      eventType: 'Congresso científico de cardiologia',
      format: 'HYBRID',
      startDate: '2026-10-20T00:00:00.000Z',
      endDate: '2026-10-22T23:59:59.000Z',
      venue: 'Centro de Convenções Evolvia',
      registrationMode: 'FREE',
    },
  });
}

const event = await createScientificEvent('Congresso A6 Automatizado');
const otherEvent = await createScientificEvent('Outro Congresso A6');
assert.equal(event.profileCode, 'SCIENTIFIC_EVENT');

let structure = await request(`/scientific-events/${event.id}/structure/people`, {
  method: 'POST', token, expected: 201,
  body: {
    name: 'Dra. Ana Paula Ribeiro',
    email: `ana-a6-${runId}@evolvia-ci.local`,
    institution: 'Instituto Evolvia de Cardiologia',
  },
});
const person = structure.people.find((item) => item.email === `ana-a6-${runId}@evolvia-ci.local`);
assert.ok(person?.id);

structure = await request(`/scientific-events/${event.id}/structure/people`, {
  method: 'POST', token, expected: 201,
  body: {
    name: 'Dr. Bruno Martins',
    email: `bruno-a6-${runId}@evolvia-ci.local`,
    institution: 'Universidade Evolvia',
  },
});
const secondPerson = structure.people.find((item) => item.email === `bruno-a6-${runId}@evolvia-ci.local`);
assert.ok(secondPerson?.id);

structure = await request(`/scientific-events/${event.id}/structure/taxonomy`, {
  method: 'POST', token, expected: 201,
  body: { name: 'Saúde', level: 'AREA', sortOrder: 1 },
});
const area = structure.taxonomy.find((item) => item.name === 'Saúde');
assert.ok(area?.id);
structure = await request(`/scientific-events/${event.id}/structure/taxonomy`, {
  method: 'POST', token, expected: 201,
  body: { name: 'Cardiologia', level: 'SUBAREA', parentId: area.id, sortOrder: 1 },
});
const subarea = structure.taxonomy.find((item) => item.name === 'Cardiologia');
assert.ok(subarea?.id);

let submissions = await request(`/scientific-events/${event.id}/submissions/config`, {
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
assert.equal(submissions.config.requireArea, true);
assert.equal(submissions.config.requireSubarea, true);
assert.equal(submissions.config.requireFile, true);
assert.equal(submissions.config.reviewMode, 'DOUBLE_BLIND');

submissions = await request(`/scientific-events/${event.id}/submissions/modalities`, {
  method: 'POST', token, expected: 201,
  body: {
    name: 'Pôster digital',
    description: 'Resumo estruturado para apresentação em ePoster.',
    rules: { presenterRequired: true, fileEnabled: true },
  },
});
const modality = submissions.modalities.find((item) => item.name === 'Pôster digital');
assert.ok(modality?.id);

await request(`/scientific-events/${otherEvent.id}/submissions`, {
  method: 'POST', token, expected: 400,
  body: {
    modalityId: modality.id,
    title: 'Modalidade de outro evento deve ser bloqueada',
  },
});

submissions = await request(`/scientific-events/${event.id}/submissions`, {
  method: 'POST', token, expected: 201,
  body: {
    modalityId: modality.id,
    title: 'Impacto da inteligência artificial no cuidado cardiovascular',
    abstractText: 'Estudo prospectivo sobre apoio à decisão clínica em cardiologia.',
    keywords: ['cardiologia', 'inteligência artificial'],
    taxonomyAreaId: area.id,
    taxonomySubareaId: subarea.id,
  },
});
const submissionId = submissions.createdSubmissionId;
assert.ok(submissionId);
assert.equal(submissions.summary.total, 1);
assert.equal(submissions.summary.drafts, 1);

await request(`/scientific-events/${event.id}/submissions/${submissionId}/submit`, {
  method: 'POST', token, expected: 400,
  body: { fileKey: `a6/${runId}/trabalho.pdf`, contentHash: 'hash-incompleto-a6' },
});

submissions = await request(`/scientific-events/${event.id}/submissions/${submissionId}/authors`, {
  method: 'POST', token, expected: 201,
  body: { personId: person.id, sortOrder: 1, isPresenter: true, isCorresponding: true },
});
assert.equal(submissions.submissions[0].authors.length, 1);
assert.equal(submissions.submissions[0].authors[0].personId, person.id);
assert.equal(submissions.submissions[0].authors[0].isPresenter, true);

await request(`/scientific-events/${event.id}/submissions/${submissionId}/authors`, {
  method: 'POST', token, expected: 400,
  body: { personId: secondPerson.id, sortOrder: 2, isPresenter: true },
});

submissions = await request(`/scientific-events/${event.id}/submissions/${submissionId}/authors`, {
  method: 'POST', token, expected: 201,
  body: { personId: secondPerson.id, sortOrder: 2, isPresenter: false },
});
assert.equal(submissions.submissions[0].authors.length, 2);

submissions = await request(`/scientific-events/${event.id}/submissions/${submissionId}/submit`, {
  method: 'POST', token, expected: 201,
  body: {
    fileKey: `a6/${runId}/trabalho-v1.pdf`,
    contentHash: `sha256-a6-${runId}`,
  },
});
const submitted = submissions.submissions.find((item) => item.id === submissionId);
assert.ok(submitted);
assert.equal(submitted.status, 'SUBMITTED');
assert.equal(submitted.currentVersion, 1);
assert.equal(submitted.versions.length, 1);
assert.equal(submitted.versions[0].versionNumber, 1);
assert.equal(submitted.versions[0].fileKey, `a6/${runId}/trabalho-v1.pdf`);
assert.equal(submitted.versions[0].contentHash, `sha256-a6-${runId}`);
assert.equal(submissions.summary.submitted, 1);

await request(`/scientific-events/${event.id}/submissions/${submissionId}/authors`, {
  method: 'POST', token, expected: 400,
  body: { personId: secondPerson.id, sortOrder: 3, isPresenter: false },
});

await request(`/scientific-events/${event.id}/submissions/${submissionId}/submit`, {
  method: 'POST', token, expected: 400,
  body: { fileKey: `a6/${runId}/duplicado.pdf`, contentHash: 'hash-duplicado-a6' },
});

const correctionHash = `sha256-a6-correction-${runId}`;
let correction = await request(`/scientific-events/${event.id}/submissions/${submissionId}/corrections`, {
  method: 'POST', token, expected: 201,
  body: {
    reason: 'Correção solicitada pelo autor após revisão do conteúdo.',
    abstractText: 'Estudo prospectivo revisado com detalhamento adicional do método e dos resultados.',
    fileKey: `a6/${runId}/trabalho-v2.pdf`,
    contentHash: correctionHash,
  },
});
assert.equal(correction.corrected, true);
assert.equal(correction.previousVersion, 1);
assert.equal(correction.currentVersion, 2);
assert.equal(correction.status, 'SUBMITTED');

correction = await request(`/scientific-events/${event.id}/submissions/${submissionId}/corrections`, {
  method: 'POST', token, expected: 201,
  body: {
    reason: 'Repetição idempotente da mesma correção.',
    abstractText: 'Estudo prospectivo revisado com detalhamento adicional do método e dos resultados.',
    fileKey: `a6/${runId}/trabalho-v2.pdf`,
    contentHash: correctionHash,
  },
});
assert.equal(correction.corrected, false);
assert.equal(correction.idempotent, true);
assert.equal(correction.currentVersion, 2);

submissions = await request(`/scientific-events/${event.id}/submissions`, { token });
const corrected = submissions.submissions.find((item) => item.id === submissionId);
assert.ok(corrected);
assert.equal(submissions.summary.total, 1);
assert.equal(submissions.summary.drafts, 0);
assert.equal(submissions.summary.submitted, 1);
assert.equal(corrected.currentVersion, 2);
assert.equal(corrected.versions.length, 2);
assert.equal(corrected.versions[0].versionNumber, 2);
assert.equal(corrected.versions[0].fileKey, `a6/${runId}/trabalho-v2.pdf`);
assert.equal(corrected.versions[0].contentHash, correctionHash);
assert.equal(corrected.versions[1].versionNumber, 1);
assert.equal(corrected.versions[1].fileKey, `a6/${runId}/trabalho-v1.pdf`);
assert.equal(submissions.config.allowCorrections, true);
assert.equal(submissions.modalities.length, 1);

console.log('CI_SMOKE_A6_OK');