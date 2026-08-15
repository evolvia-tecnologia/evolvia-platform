import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationService } from '../dist/event-publication/event-publication.service.js';

const baseEvent = {
  id: 'evt_transition_1',
  organizationId: 'org_transition_1',
  name: 'Congresso Evolvia',
  slug: 'congresso-evolvia',
  status: 'SETUP',
  format: 'ONLINE',
  startDate: new Date('2026-10-10T12:00:00.000Z'),
  endDate: null,
  venue: null,
  updatedAt: new Date('2026-08-15T06:00:00.000Z'),
};

const basePublication = {
  id: 'pub_transition_1',
  organizationId: baseEvent.organizationId,
  eventId: baseEvent.id,
  shortDescription: 'Evento pronto para homologação.',
  fullDescription: null,
  publicContactEmail: null,
  publicContactPhone: null,
  logoAssetId: null,
  coverAssetId: null,
  seoTitle: null,
  seoDescription: null,
  socialImageAssetId: null,
  accessibilitySummary: null,
  themeConfig: null,
  revision: 3,
  createdAt: new Date('2026-08-15T05:00:00.000Z'),
  updatedAt: new Date('2026-08-15T06:00:00.000Z'),
};

function makeHarness({ role = 'OWNER', event = baseEvent, publication = basePublication } = {}) {
  let transitionCalls = 0;
  const audits = [];
  const prisma = {
    event: { findUnique: async () => event },
    $transaction: async (callback) => callback({
      auditLog: { create: async (entry) => { audits.push(entry); return entry; } },
    }),
  };
  const authorization = { requireMembership: async () => ({ role }) };
  const repository = {
    lockEventScope: async () => event,
    findByScope: async () => publication,
    findSectionsByScope: async () => [],
    transitionEventStatus: async (_tx, _organizationId, _eventId, _fromStatus, toStatus) => {
      transitionCalls += 1;
      return { status: toStatus, updatedAt: new Date('2026-08-15T06:30:00.000Z') };
    },
  };
  return {
    service: new EventPublicationService(prisma, authorization, repository),
    audits,
    get transitionCalls() { return transitionCalls; },
  };
}

test('MANAGER envia SETUP para HOMOLOGATION com checklist pronto e auditoria', async () => {
  const harness = makeHarness({ role: 'MANAGER' });
  const result = await harness.service.transitionStatus('user_manager', baseEvent.id, {
    targetStatus: 'HOMOLOGATION',
    publicationRevision: 3,
  });

  assert.equal(result.event.status, 'HOMOLOGATION');
  assert.equal(result.permissions.canEdit, false);
  assert.equal(result.permissions.canReturnToSetup, true);
  assert.equal(harness.transitionCalls, 1);
  assert.equal(harness.audits.length, 1);
  assert.equal(harness.audits[0].data.action, 'event.publication.status_changed');
  assert.deepEqual(harness.audits[0].data.metadata, {
    fromStatus: 'SETUP',
    toStatus: 'HOMOLOGATION',
    publicationRevision: 3,
    requiredChecklistReady: true,
    explicitPublicationConfirmation: false,
  });
});

test('checklist bloqueante impede entrada em homologação', async () => {
  const harness = makeHarness({ publication: { ...basePublication, shortDescription: null } });
  await assert.rejects(
    () => harness.service.transitionStatus('user_owner', baseEvent.id, {
      targetStatus: 'HOMOLOGATION',
      publicationRevision: 3,
    }),
    (error) => error?.response?.code === 'PUBLICATION_NOT_READY'
      && error.response.context.pendingCodes.includes('SHORT_DESCRIPTION'),
  );
  assert.equal(harness.transitionCalls, 0);
});

test('revisão editorial obsoleta bloqueia a transição', async () => {
  const harness = makeHarness();
  await assert.rejects(
    () => harness.service.transitionStatus('user_owner', baseEvent.id, {
      targetStatus: 'HOMOLOGATION',
      publicationRevision: 2,
    }),
    (error) => error?.response?.code === 'STALE_PUBLICATION_REVISION',
  );
  assert.equal(harness.transitionCalls, 0);
});

test('MANAGER não aprova homologação', async () => {
  const harness = makeHarness({ role: 'MANAGER', event: { ...baseEvent, status: 'HOMOLOGATION' } });
  await assert.rejects(
    () => harness.service.transitionStatus('user_manager', baseEvent.id, {
      targetStatus: 'READY_TO_PUBLISH',
      publicationRevision: 3,
    }),
    (error) => error?.response?.code === 'INVALID_PUBLICATION_TRANSITION',
  );
  assert.equal(harness.transitionCalls, 0);
});

test('publicação exige confirmação literal e OWNER publica após READY_TO_PUBLISH', async () => {
  const readyEvent = { ...baseEvent, status: 'READY_TO_PUBLISH' };
  const harness = makeHarness({ event: readyEvent });

  await assert.rejects(
    () => harness.service.transitionStatus('user_owner', baseEvent.id, {
      targetStatus: 'PUBLISHED',
      publicationRevision: 3,
    }),
    (error) => error?.response?.code === 'PUBLICATION_CONFIRMATION_REQUIRED',
  );
  assert.equal(harness.transitionCalls, 0);

  const result = await harness.service.transitionStatus('user_owner', baseEvent.id, {
    targetStatus: 'PUBLISHED',
    publicationRevision: 3,
    confirmation: 'PUBLICAR',
  });
  assert.equal(result.event.status, 'PUBLISHED');
  assert.equal(harness.transitionCalls, 1);
  assert.equal(harness.audits[0].data.metadata.explicitPublicationConfirmation, true);
});

test('VIEWER é negado antes de abrir transação de estado', async () => {
  let transactionCalled = false;
  const prisma = {
    event: { findUnique: async () => baseEvent },
    $transaction: async () => { transactionCalled = true; },
  };
  const service = new EventPublicationService(
    prisma,
    { requireMembership: async () => ({ role: 'VIEWER' }) },
    {},
  );

  await assert.rejects(
    () => service.transitionStatus('user_viewer', baseEvent.id, {
      targetStatus: 'HOMOLOGATION',
      publicationRevision: 3,
    }),
    /Evento não encontrado/,
  );
  assert.equal(transactionCalled, false);
});
