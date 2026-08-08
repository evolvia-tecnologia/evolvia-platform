import assert from 'node:assert/strict';

const baseUrl = process.env.EVOLVIA_API_URL ?? 'http://127.0.0.1:4000';
const runId = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;
const password = `A4-${runId}-Aa9!seguro`;

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

const owner = await request('/auth/register', {
  method: 'POST',
  expected: 201,
  body: {
    name: 'Responsável A4',
    email: `a4-owner-${runId}@evolvia-ci.local`,
    password,
  },
});

assert.ok(owner.token);
assert.ok(owner.organization?.id);
const token = owner.token;
const organizationId = owner.organization.id;

const event = await request('/events', {
  method: 'POST',
  token,
  expected: 201,
  body: {
    organizationId,
    name: 'Congresso A4 Automatizado',
    eventType: 'Congresso científico de saúde',
    format: 'HYBRID',
    venue: 'Ambiente de validação A4',
    registrationMode: 'FREE',
  },
});

assert.equal(event.profileCode, 'SCIENTIFIC_EVENT');
assert.equal(event.organizationId, organizationId);

const otherEvent = await request('/events', {
  method: 'POST',
  token,
  expected: 201,
  body: {
    organizationId,
    name: 'Outro Congresso A4',
    eventType: 'Evento científico de pesquisa',
    format: 'ONLINE',
    venue: 'Ambiente de validação A4',
    registrationMode: 'FREE',
  },
});
assert.equal(otherEvent.profileCode, 'SCIENTIFIC_EVENT');

const structure = await request(`/scientific-events/${event.id}/structure/people`, {
  method: 'POST',
  token,
  expected: 201,
  body: {
    name: 'Dra. Ana Validação',
    email: `ana-a4-${runId}@evolvia-ci.local`,
    institution: 'Instituto Evolvia',
  },
});

const person = structure.people.find((item) => item.email === `ana-a4-${runId}@evolvia-ci.local`);
assert.ok(person?.id);

await request(`/scientific-events/${otherEvent.id}/guests`, {
  method: 'POST',
  token,
  expected: 400,
  body: {
    personId: person.id,
    participationType: 'SPEAKER',
  },
});

let guests = await request(`/scientific-events/${event.id}/guests`, {
  method: 'POST',
  token,
  expected: 201,
  body: {
    personId: person.id,
    participationType: 'SPEAKER',
    professionalTitle: 'Pesquisadora',
    miniBio: 'Perfil de validação automatizada do Gate A4.',
    accessibilityNotes: 'Sem necessidade informada.',
  },
});

assert.equal(guests.summary.total, 1);
assert.equal(guests.guests[0].personId, person.id);
assert.equal(guests.guests[0].roleLabel, 'Palestrante');
assert.equal(guests.guests[0].invitationStatus, 'DRAFT');
assert.equal(Object.hasOwn(guests.guests[0], 'invitationTokenHash'), false);
const guestId = guests.guests[0].id;

const configured = await request(`/scientific-events/${event.id}/guest-invitation-template`, {
  method: 'PUT',
  token,
  body: {
    subject: 'Convite {EVENTO}',
    body: 'Olá {NOME}. Confirme sua participação como {FUNCAO} em {EVENTO}.',
    expiresInDays: 7,
  },
});
assert.equal(configured.invitationTemplate.expiresInDays, 7);

const prepared = await request(`/scientific-events/${event.id}/guests/${guestId}/prepare-invitation`, {
  method: 'POST',
  token,
  expected: 201,
  body: { expiresInDays: 7 },
});

assert.ok(prepared.preparedInvitation?.token);
assert.ok(prepared.preparedInvitation?.path?.startsWith('/convites/cientificos/'));
assert.match(prepared.preparedInvitation.subject, /Congresso A4 Automatizado/);
const invitationToken = prepared.preparedInvitation.token;

const publicInvitation = await request(`/scientific-invitations/${invitationToken}`);
assert.equal(publicInvitation.event.name, 'Congresso A4 Automatizado');
assert.equal(publicInvitation.guest.roleLabel, 'Palestrante');
assert.equal(publicInvitation.guest.displayName, 'Dra. Ana Validação');
assert.ok(['VIEWED', 'SENT', 'PREPARED'].includes(publicInvitation.invitation.status));

const response = await request(`/scientific-invitations/${invitationToken}/respond`, {
  method: 'POST',
  expected: 201,
  body: { response: 'CONFIRMED' },
});
assert.equal(response.invitation.status, 'CONFIRMED');

await request(`/scientific-invitations/${invitationToken}/respond`, {
  method: 'POST',
  expected: 409,
  body: { response: 'DECLINED' },
});

guests = await request(`/scientific-events/${event.id}/guests`, { token });
assert.equal(guests.summary.confirmed, 1);
assert.equal(guests.summary.pending, 0);
assert.equal(guests.guests[0].invitationStatus, 'CONFIRMED');
assert.equal(Object.hasOwn(guests.guests[0], 'invitationTokenHash'), false);

console.log('CI_SMOKE_A4_OK');
