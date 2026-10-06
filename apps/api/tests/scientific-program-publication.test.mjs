import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificProgramService } from '../dist/scientific-program.service.js';
import { ScientificProgramPublicService } from '../dist/scientific-program-public.service.js';
import { presentPublicProgramActivity } from '../dist/scientific-program-public-policy.js';

function organizerFixture({ status = 'READY_FOR_REVIEW', eventStatus = 'PUBLISHED', denied = false, raced = false, overlap = false } = {}) {
  const event = { id: 'event-1', organizationId: 'org-1', profileCode: 'SCIENTIFIC_EVENT', status: eventStatus,
    startDate: new Date('2026-10-15T00:00:00Z'), endDate: new Date('2026-10-17T00:00:00Z') };
  const activity = { id: 'activity-1', eventId: event.id, organizationId: event.organizationId, status, spaceId: 'space-1',
    startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z'), space: { name: 'Auditório' }, participants: [] };
  const other = { ...activity, id: 'activity-2', status: 'DRAFT' };
  const writes = [], audits = [], foundationChecks = [];
  const prisma = {
    event: { findUnique: async () => event },
    scientificProgramActivity: {
      findFirst: async ({ where }) => where.id === activity.id && where.eventId === event.id
        && where.organizationId === event.organizationId ? activity : null,
      findMany: async ({ where }) => {
        assert.deepEqual(where, { eventId: event.id, organizationId: event.organizationId });
        return overlap ? [activity, other] : [activity];
      },
    },
    $transaction: async (callback) => callback({
      scientificProgramActivity: { updateMany: async (input) => { writes.push(input); return { count: raced ? 0 : 1 }; } },
      auditLog: { create: async (input) => { audits.push(input.data); } },
    }),
  };
  const service = new ScientificProgramService(prisma,
    { requireRole: async () => { if (denied) throw Object.assign(new Error('acesso negado'), { status: 403 }); } },
    { assertFoundationMutable: (value) => { foundationChecks.push(value); } });
  service.get = async () => ({ reloaded: true });
  return { service, writes, audits, foundationChecks };
}

test('publicar atividade revisada grava transição condicional e auditoria mesmo com evento publicado', async () => {
  const { service, writes, audits, foundationChecks } = organizerFixture();
  assert.deepEqual(await service.publishActivity('editor-1', 'event-1', 'activity-1'), { reloaded: true });
  assert.equal(foundationChecks.length, 0);
  assert.deepEqual(writes, [{
    where: { id: 'activity-1', eventId: 'event-1', organizationId: 'org-1', status: 'READY_FOR_REVIEW' },
    data: { status: 'PUBLISHED' },
  }]);
  assert.equal(audits[0].action, 'scientific.program_activity_published');
  assert.equal(audits[0].organizationId, 'org-1');
  assert.deepEqual(audits[0].metadata, { from: 'READY_FOR_REVIEW', to: 'PUBLISHED' });
});

test('rascunho não pode ser publicado sem revisão', async () => {
  const { service, writes } = organizerFixture({ status: 'DRAFT' });
  await assert.rejects(service.publishActivity('editor-1', 'event-1', 'activity-1'),
    (error) => error.status === 409 && error.getResponse().code === 'PROGRAM_ACTIVITY_NOT_REVIEWED');
  assert.equal(writes.length, 0);
});

test('conflito bloqueante impede a publicação', async () => {
  const { service, writes } = organizerFixture({ overlap: true });
  await assert.rejects(service.publishActivity('editor-1', 'event-1', 'activity-1'),
    (error) => error.status === 409 && error.getResponse().code === 'PROGRAM_CONFLICTS_BLOCK_PUBLICATION');
  assert.equal(writes.length, 0);
});

test('evento cancelado não recebe novas atividades públicas', async () => {
  const { service, writes } = organizerFixture({ eventStatus: 'CANCELLED' });
  await assert.rejects(service.publishActivity('editor-1', 'event-1', 'activity-1'), { status: 409 });
  assert.equal(writes.length, 0);
});

test('pessoa sem papel de edição não publica nem retira', async () => {
  for (const action of ['publishActivity', 'unpublishActivity']) {
    const { service, writes } = organizerFixture({ denied: true, status: 'PUBLISHED' });
    await assert.rejects(service[action]('intruso', 'event-1', 'activity-1'), { status: 403 });
    assert.equal(writes.length, 0);
  }
});

test('alteração concorrente recusa a publicação sem auditoria parcial', async () => {
  const { service, audits } = organizerFixture({ raced: true });
  await assert.rejects(service.publishActivity('editor-1', 'event-1', 'activity-1'),
    (error) => error.status === 409 && error.getResponse().code === 'PROGRAM_ACTIVITY_CHANGED');
  assert.equal(audits.length, 0);
});

test('retirar da página volta para revisada e é idempotente', async () => {
  const published = organizerFixture({ status: 'PUBLISHED' });
  await published.service.unpublishActivity('editor-1', 'event-1', 'activity-1');
  assert.deepEqual(published.writes[0].data, { status: 'READY_FOR_REVIEW' });
  assert.equal(published.writes[0].where.status, 'PUBLISHED');
  assert.equal(published.audits[0].action, 'scientific.program_activity_unpublished');

  const ready = organizerFixture();
  await ready.service.unpublishActivity('editor-1', 'event-1', 'activity-1');
  assert.equal(ready.writes.length, 0);
});

test('atividade em outro evento ou organização não é encontrada', async () => {
  const { service, writes } = organizerFixture();
  await assert.rejects(service.publishActivity('editor-1', 'event-1', 'activity-de-outro-evento'), { status: 404 });
  assert.equal(writes.length, 0);
});

const confirmed = (name, extra = {}) => ({
  participationType: 'SPEAKER', customRoleLabel: null,
  person: { name, status: 'ACTIVE', email: 'privado@exemplo.org', institution: 'Instituição interna',
    guestProfile: { displayName: null, professionalTitle: null, invitationStatus: 'CONFIRMED', ...extra } },
});

const row = {
  id: 'activity-1', title: 'Conferência de abertura', activityType: 'Conferência', description: '  Abertura oficial  ',
  startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z'),
  operationalNotes: 'microfone de lapela', status: 'PUBLISHED',
  space: { name: 'Sala virtual', kind: 'VIRTUAL', location: null, active: true },
  taxonomyArea: { name: 'Cardiologia', active: true },
  participants: [
    confirmed('Ana Souza', { displayName: 'Dra. Ana Souza', professionalTitle: 'Cardiologista' }),
    confirmed('Bruno Lima', { invitationStatus: 'SENT' }),
    { ...confirmed('Carla Dias'), person: { ...confirmed('Carla Dias').person, status: 'INACTIVE' } },
    { ...confirmed('Davi Rocha'), participationType: 'OTHER', customRoleLabel: ' Facilitação ' },
    { ...confirmed('Eva Prado'), person: { ...confirmed('Eva Prado').person, guestProfile: null } },
  ],
};

test('apresentação pública mostra só pessoas confirmadas e nenhum dado interno', () => {
  const presented = presentPublicProgramActivity(row);
  assert.deepEqual(presented, {
    id: 'activity-1', title: 'Conferência de abertura', activityType: 'Conferência', description: 'Abertura oficial',
    startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z',
    space: { name: 'Sala virtual', location: null }, online: true, area: 'Cardiologia',
    participants: [
      { name: 'Dra. Ana Souza', professionalTitle: 'Cardiologista', participationType: 'SPEAKER', customRoleLabel: null },
      { name: 'Davi Rocha', professionalTitle: null, participationType: 'OTHER', customRoleLabel: 'Facilitação' },
    ],
  });
  const serialized = JSON.stringify(presented);
  for (const secret of ['privado@exemplo.org', 'Instituição interna', 'microfone', 'http', 'Bruno', 'Carla', 'Eva']) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});

test('espaço ou área inativos não aparecem no público', () => {
  const presented = presentPublicProgramActivity({
    ...row,
    space: { ...row.space, active: false },
    taxonomyArea: { name: 'Antiga', active: false },
  });
  assert.equal(presented.space, null);
  assert.equal(presented.online, false);
  assert.equal(presented.area, null);
});

function publicFixture(event) {
  const queries = [];
  const prisma = {
    event: { findUnique: async ({ where }) => (where.slug === event?.slug ? event : null) },
    scientificProgramActivity: { findMany: async (query) => { queries.push(query); return [row]; } },
  };
  return { service: new ScientificProgramPublicService(prisma), queries };
}

const publishedEvent = { id: 'event-1', organizationId: 'org-1', slug: 'congresso', status: 'PUBLISHED',
  profileCode: 'SCIENTIFIC_EVENT', timeZone: 'America/Sao_Paulo', format: 'HYBRID' };

test('programação pública lê apenas atividades publicadas do próprio evento e organização', async () => {
  const { service, queries } = publicFixture(publishedEvent);
  const result = await service.findBySlug(' Congresso ');
  assert.deepEqual(result.event, { slug: 'congresso', timeZone: 'America/Sao_Paulo', format: 'HYBRID' });
  assert.equal(result.activities.length, 1);
  assert.deepEqual(queries[0].where, { eventId: 'event-1', organizationId: 'org-1', status: 'PUBLISHED' });
  assert.equal(queries[0].select.operationalNotes, undefined);
  assert.equal(queries[0].select.participants.select.person.select.email, undefined);
});

test('evento não publicado, sem organização ou não científico não expõe programação', async () => {
  for (const event of [
    { ...publishedEvent, status: 'READY_TO_PUBLISH' },
    { ...publishedEvent, status: 'HOMOLOGATION' },
    { ...publishedEvent, organizationId: null },
    { ...publishedEvent, profileCode: 'CORPORATE_EVENT' },
  ]) {
    const { service, queries } = publicFixture(event);
    assert.equal(await service.findBySlug('congresso'), null);
    assert.equal(queries.length, 0);
  }
  const { service } = publicFixture(publishedEvent);
  assert.equal(await service.findBySlug('   '), null);
  assert.equal(await service.findBySlug('outro-evento'), null);
});
