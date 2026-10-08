import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ScientificProgramService } from '../dist/scientific-program.service.js';
import { ScientificProgramPublicService } from '../dist/scientific-program-public.service.js';
import { presentPublicProgramActivity, presentPublicProgramWork } from '../dist/scientific-program-public-policy.js';

function linkFixture({
  submission = { id: 'submission-1', status: 'ACCEPTED' },
  activitySubmissionId = null,
  taken = false,
  eventStatus = 'PUBLISHED',
  denied = false,
  missingActivity = false,
} = {}) {
  const event = {
    id: 'event-1', organizationId: 'org-1', profileCode: 'SCIENTIFIC_EVENT', status: eventStatus, ownerId: 'editor-1',
  };
  const activity = {
    id: 'activity-1', submissionId: activitySubmissionId, eventId: event.id, organizationId: event.organizationId,
  };
  const writes = [];
  const audits = [];
  const prisma = {
    event: { findUnique: async () => event },
    scientificProgramActivity: {
      findFirst: async ({ where }) => {
        if (where.id === 'activity-1') return missingActivity ? null : activity;
        if (where.submissionId && taken) return { id: 'activity-2' };
        return null;
      },
    },
    scientificSubmission: {
      findFirst: async ({ where }) => (submission && where.id === submission.id ? submission : null),
    },
    $transaction: async (callback) => callback({
      scientificProgramActivity: { update: async (input) => { writes.push(input); } },
      auditLog: { create: async (input) => { audits.push(input.data); } },
    }),
  };
  const service = new ScientificProgramService(
    prisma,
    { requireRole: async () => { if (denied) throw Object.assign(new Error('acesso negado'), { status: 403 }); } },
    { assertFoundationMutable() {} },
  );
  service.get = async () => ({ reloaded: true });
  return { service, writes, audits };
}

test('trabalho aceito fica ligado à atividade sem tirar a publicação', async () => {
  const { service, writes, audits } = linkFixture();
  assert.deepEqual(await service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'), { reloaded: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].where.id, 'activity-1');
  assert.deepEqual(writes[0].data.submission.connect.id_eventId_organizationId, {
    id: 'submission-1', eventId: 'event-1', organizationId: 'org-1',
  });
  assert.equal(audits[0].action, 'scientific.program_work_linked');
  assert.deepEqual(audits[0].metadata, { submissionId: 'submission-1' });
  assert.equal(writes[0].data.status, undefined);
});

test('aceite com ressalvas também pode entrar na programação', async () => {
  const { service, writes } = linkFixture({ submission: { id: 'submission-2', status: 'ACCEPTED_WITH_CHANGES' } });
  await service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-2');
  assert.equal(writes[0].data.submission.connect.id_eventId_organizationId.id, 'submission-2');
});

test('repetir o mesmo vínculo não grava de novo', async () => {
  const { service, writes, audits } = linkFixture({ activitySubmissionId: 'submission-1' });
  await service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1');
  assert.equal(writes.length, 0);
  assert.equal(audits.length, 0);
});

test('retirar o vínculo desconecta o trabalho', async () => {
  const { service, writes, audits } = linkFixture({ activitySubmissionId: 'submission-1' });
  await service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', null);
  assert.deepEqual(writes[0].data, { submission: { disconnect: true } });
  assert.equal(audits[0].action, 'scientific.program_work_unlinked');
  assert.deepEqual(audits[0].metadata, { submissionId: null });
});

test('trabalho em análise, de outro evento ou já agendado não entra', async () => {
  const pending = linkFixture({ submission: { id: 'submission-1', status: 'UNDER_REVIEW' } });
  await assert.rejects(
    pending.service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'),
    (error) => error.status === 400 && /aceito/u.test(error.message),
  );
  assert.equal(pending.writes.length, 0);

  const missing = linkFixture({ submission: null });
  await assert.rejects(
    missing.service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'),
    { status: 404 },
  );

  const duplicate = linkFixture({ taken: true });
  await assert.rejects(
    duplicate.service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'),
    (error) => error.status === 409 && /outra atividade/u.test(error.message),
  );
  assert.equal(duplicate.writes.length, 0);
});

test('evento encerrado e atividade de outro evento não recebem o vínculo', async () => {
  const closed = linkFixture({ eventStatus: 'FINISHED' });
  await assert.rejects(closed.service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'), { status: 409 });
  assert.equal(closed.writes.length, 0);

  const other = linkFixture({ missingActivity: true });
  await assert.rejects(other.service.linkConfirmedWork('editor-1', 'event-1', 'activity-1', 'submission-1'), { status: 404 });

  const denied = linkFixture({ denied: true });
  await assert.rejects(denied.service.linkConfirmedWork('intruso', 'event-1', 'activity-1', 'submission-1'), { status: 403 });
});

const acceptedWork = {
  title: '  Diretrizes de insuficiência cardíaca  ',
  status: 'ACCEPTED',
  stationPublicCode: 12,
  authors: [
    { person: { name: 'Dra. Ana Souza', email: 'ana@privado.example', institution: 'Hospital interno' } },
    { person: { name: '   ', email: 'vazio@privado.example' } },
    { person: { name: 'Dr. Paulo Reis' } },
  ],
};

test('página pública mostra título, código e autores do trabalho aceito', () => {
  assert.deepEqual(presentPublicProgramWork(acceptedWork), {
    title: 'Diretrizes de insuficiência cardíaca',
    code: 12,
    authors: ['Dra. Ana Souza', 'Dr. Paulo Reis'],
  });
  const presented = presentPublicProgramActivity({
    id: 'activity-1', title: 'Mesa', activityType: 'Mesa-redonda', description: null,
    startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z'),
    space: null, taxonomyArea: null, participants: [], submission: acceptedWork,
  });
  assert.deepEqual(presented.work, {
    title: 'Diretrizes de insuficiência cardíaca', code: 12, authors: ['Dra. Ana Souza', 'Dr. Paulo Reis'],
  });
  const serialized = JSON.stringify(presented);
  for (const secret of ['ana@privado.example', 'Hospital interno', 'vazio@privado.example', 'organizationId', 'fileKey']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('trabalho recusado, rascunho ou sem título não aparece na página pública', () => {
  for (const status of ['REJECTED', 'SUBMITTED', 'UNDER_REVIEW', 'DRAFT']) {
    assert.equal(presentPublicProgramWork({ ...acceptedWork, status }), null);
  }
  assert.equal(presentPublicProgramWork({ ...acceptedWork, title: '   ' }), null);
  assert.equal(presentPublicProgramWork(null), null);
  assert.deepEqual(presentPublicProgramWork({ ...acceptedWork, status: 'ACCEPTED_WITH_CHANGES', stationPublicCode: null }).code, null);
});

test('consulta pública pede o trabalho sem e-mail, instituição ou arquivo', async () => {
  const queries = [];
  const event = {
    id: 'event-1', organizationId: 'org-1', slug: 'congresso', status: 'PUBLISHED',
    profileCode: 'SCIENTIFIC_EVENT', timeZone: 'America/Sao_Paulo', format: 'HYBRID',
  };
  const prisma = {
    event: { findUnique: async () => event },
    scientificProgramActivity: { findMany: async (query) => { queries.push(query); return []; } },
  };
  const result = await new ScientificProgramPublicService(prisma).findBySlug('congresso');
  assert.deepEqual(result.activities, []);
  const submission = queries[0].select.submission.select;
  assert.deepEqual(Object.keys(submission).sort(), ['authors', 'stationPublicCode', 'status', 'title']);
  assert.deepEqual(submission.authors.select.person.select, { name: true });
  assert.equal(queries[0].select.operationalNotes, undefined);
});

test('rota do vínculo fica no controlador da programação', () => {
  const source = readFileSync(new URL('../src/scientific-program.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /activities\/:activityId\/confirmed-work/);
  assert.match(source, /linkConfirmedWork/);
});
