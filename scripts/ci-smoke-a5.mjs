import assert from 'node:assert/strict';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const password = `A5-${runId}-Aa9!seguro`;

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
  body: { name: 'Responsável Cinco', email: `a5-owner-${runId}@evolvia-ci.local`, password },
});
assert.ok(owner.token);
assert.ok(owner.organization?.id);
const token = owner.token;
const organizationId = owner.organization.id;

const event = await request('/events', {
  method: 'POST', token, expected: 201,
  body: {
    organizationId,
    name: 'Congresso A5 Automatizado',
    eventType: 'Congresso científico de cardiologia',
    format: 'HYBRID',
    startDate: '2026-09-10T00:00:00.000Z',
    endDate: '2026-09-12T23:59:59.000Z',
    venue: 'Centro de Convenções Evolvia',
    registrationMode: 'FREE',
  },
});
assert.equal(event.profileCode, 'SCIENTIFIC_EVENT');

const otherEvent = await request('/events', {
  method: 'POST', token, expected: 201,
  body: {
    organizationId,
    name: 'Outro Congresso A5',
    eventType: 'Congresso científico de pesquisa',
    format: 'IN_PERSON',
    startDate: '2026-09-10T00:00:00.000Z',
    endDate: '2026-09-12T23:59:59.000Z',
    venue: 'Outro local',
    registrationMode: 'FREE',
  },
});

let structure = await request(`/scientific-events/${event.id}/structure/people`, {
  method: 'POST', token, expected: 201,
  body: {
    name: 'Dra. Ana Paula Ribeiro',
    email: `ana-a5-${runId}@evolvia-ci.local`,
    institution: 'Instituto Evolvia de Cardiologia',
  },
});
const person = structure.people.find((item) => item.email === `ana-a5-${runId}@evolvia-ci.local`);
assert.ok(person?.id);

await request(`/scientific-events/${event.id}/guests`, {
  method: 'POST', token, expected: 201,
  body: { personId: person.id, participationType: 'MODERATOR' },
});

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
structure = await request(`/scientific-events/${event.id}/structure/taxonomy`, {
  method: 'POST', token, expected: 201,
  body: { name: 'Insuficiência cardíaca', level: 'TOPIC', parentId: subarea.id, sortOrder: 1 },
});
const topic = structure.taxonomy.find((item) => item.name === 'Insuficiência cardíaca');
assert.ok(topic?.id);

let program = await request(`/scientific-events/${event.id}/program/spaces`, {
  method: 'POST', token, expected: 201,
  body: { name: 'Auditório Principal', kind: 'AUDITORIUM', capacity: 300, location: 'Piso térreo' },
});
const auditorium = program.spaces.find((item) => item.name === 'Auditório Principal');
assert.ok(auditorium?.id);
program = await request(`/scientific-events/${event.id}/program/spaces`, {
  method: 'POST', token, expected: 201,
  body: { name: 'Sala 2', kind: 'ROOM', capacity: 80 },
});
const room2 = program.spaces.find((item) => item.name === 'Sala 2');
assert.ok(room2?.id);

await request(`/scientific-events/${otherEvent.id}/program/activities`, {
  method: 'POST', token, expected: 404,
  body: {
    title: 'Vínculo cruzado proibido', activityType: 'Palestra', spaceId: auditorium.id,
    startAt: '2026-09-10T10:00:00.000Z', endAt: '2026-09-10T11:00:00.000Z',
  },
});

program = await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 201,
  body: {
    title: 'Novas diretrizes em insuficiência cardíaca',
    activityType: 'Mesa-redonda',
    spaceId: auditorium.id,
    startAt: '2026-09-10T10:00:00.000Z',
    endAt: '2026-09-10T11:00:00.000Z',
    taxonomyAreaId: area.id,
    taxonomySubareaId: subarea.id,
    taxonomyTopicId: topic.id,
  },
});
const activityA = program.activities.find((item) => item.title === 'Novas diretrizes em insuficiência cardíaca');
assert.ok(activityA?.id);

program = await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 201,
  body: {
    title: 'Cardiologia de precisão', activityType: 'Painel', spaceId: auditorium.id,
    startAt: '2026-09-10T11:00:00.000Z', endAt: '2026-09-10T12:00:00.000Z',
  },
});
const activityB = program.activities.find((item) => item.title === 'Cardiologia de precisão');
assert.ok(activityB?.id);

await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 409,
  body: {
    title: 'Conflito de sala', activityType: 'Palestra', spaceId: auditorium.id,
    startAt: '2026-09-10T10:30:00.000Z', endAt: '2026-09-10T11:30:00.000Z',
  },
});

program = await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 201,
  body: {
    title: 'Sessão paralela', activityType: 'Sessão científica', spaceId: room2.id,
    startAt: '2026-09-10T10:30:00.000Z', endAt: '2026-09-10T11:30:00.000Z',
  },
});
const activityC = program.activities.find((item) => item.title === 'Sessão paralela');
assert.ok(activityC?.id);

await request(`/scientific-events/${event.id}/program/activities/${activityA.id}/participants`, {
  method: 'POST', token, expected: 201,
  body: { personId: person.id, participationType: 'MODERATOR' },
});
await request(`/scientific-events/${event.id}/program/activities/${activityB.id}/participants`, {
  method: 'POST', token, expected: 201,
  body: { personId: person.id, participationType: 'SPEAKER' },
});
await request(`/scientific-events/${event.id}/program/activities/${activityC.id}/participants`, {
  method: 'POST', token, expected: 409,
  body: { personId: person.id, participationType: 'SPEAKER' },
});

await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 400,
  body: {
    title: 'Intervalo inválido', activityType: 'Palestra', spaceId: room2.id,
    startAt: '2026-09-10T14:00:00.000Z', endAt: '2026-09-10T14:00:00.000Z',
  },
});

await request(`/scientific-events/${event.id}/program/activities`, {
  method: 'POST', token, expected: 400,
  body: {
    title: 'Fora do evento', activityType: 'Palestra', spaceId: room2.id,
    startAt: '2026-09-13T10:00:00.000Z', endAt: '2026-09-13T11:00:00.000Z',
  },
});

program = await request(`/scientific-events/${event.id}/program`, { token });
assert.equal(program.summary.spaces, 2);
assert.equal(program.summary.activities, 3);
assert.equal(program.activities.find((item) => item.id === activityA.id).taxonomyTopic.name, 'Insuficiência cardíaca');
assert.equal(program.conflicts.some((item) => item.code === 'INVITATION_PENDING'), true);
assert.equal(program.conflicts.some((item) => item.code === 'SPACE_OVERLAP'), false);
assert.equal(program.conflicts.some((item) => item.code === 'PERSON_OVERLAP'), false);

program = await request(`/scientific-events/${event.id}/program/activities/${activityA.id}/ready-for-review`, {
  method: 'POST', token, expected: 201,
});
assert.equal(program.activities.find((item) => item.id === activityA.id).status, 'READY_FOR_REVIEW');

const conflicts = await request(`/scientific-events/${event.id}/program/conflicts`, { token });
assert.equal(Array.isArray(conflicts.conflicts), true);
assert.equal(conflicts.summary.blockingConflicts, 0);

console.log('CI_SMOKE_A5_OK');
