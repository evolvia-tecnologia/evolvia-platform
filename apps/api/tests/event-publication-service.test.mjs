import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationService } from '../dist/event-publication/event-publication.service.js';

const event = {
  id: 'evt_1234567890',
  organizationId: 'org_1234567890',
  name: 'Congresso Evolvia',
  slug: 'congresso-evolvia',
  status: 'SETUP',
  format: 'IN_PERSON',
  startDate: null,
  endDate: null,
  venue: null,
};

function makePrisma(overrides = {}) {
  return {
    event: {
      findUnique: async () => event,
      ...(overrides.event ?? {}),
    },
    $transaction: async (callback) => callback({
      auditLog: { create: async () => ({}) },
      ...(overrides.tx ?? {}),
    }),
  };
}

function makePublication(overrides = {}) {
  return {
    id: 'pub_1',
    organizationId: event.organizationId,
    eventId: event.id,
    shortDescription: null,
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
    revision: 1,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRepository(overrides = {}) {
  return {
    lockEventScope: async () => ({ status: 'SETUP' }),
    findByScope: async () => null,
    create: async () => makePublication(),
    updateIfRevision: async () => null,
    ...overrides,
  };
}

test('leitura administrativa exige membership no organizationId canônico do evento', async () => {
  let checkedOrganizationId = '';
  const authorization = {
    requireMembership: async (_userId, organizationId) => {
      checkedOrganizationId = organizationId;
      throw new Error('membership negada');
    },
  };
  const service = new EventPublicationService(makePrisma(), authorization, makeRepository());

  await assert.rejects(() => service.getAdmin('user_1', event.id), /membership negada/);
  assert.equal(checkedOrganizationId, event.organizationId);
});

test('OPERATOR não consegue mutar conteúdo editorial mesmo conhecendo o eventId', async () => {
  let transactionCalled = false;
  const prisma = makePrisma();
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const authorization = {
    requireMembership: async () => ({ role: 'OPERATOR' }),
  };
  const service = new EventPublicationService(prisma, authorization, makeRepository());

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, { revision: 0, shortDescription: 'Teste' }),
    /Evento não encontrado/,
  );
  assert.equal(transactionCalled, false);
});

test('revisão otimista bloqueia sobrescrita de edição concorrente', async () => {
  const current = makePublication({ revision: 2, shortDescription: 'Versão atual' });
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const repository = makeRepository({
    findByScope: async () => current,
  });
  const service = new EventPublicationService(makePrisma(), authorization, repository);

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, { revision: 1, shortDescription: 'Versão antiga' }),
    /outra sessão/,
  );
});

test('estado HOMOLOGATION bloqueia mutação editorial antes de abrir transação', async () => {
  let transactionCalled = false;
  const prisma = makePrisma({ event: { findUnique: async () => ({ ...event, status: 'HOMOLOGATION' }) } });
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const service = new EventPublicationService(prisma, authorization, makeRepository());

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, { revision: 0, shortDescription: 'Teste' }),
    /congelado/,
  );
  assert.equal(transactionCalled, false);
});

test('payload administrativo expõe permissões efetivas sem conceder edição a VIEWER', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'VIEWER' }),
  };
  const service = new EventPublicationService(makePrisma(), authorization, makeRepository());

  const payload = await service.getAdmin('user_1', event.id);

  assert.equal(payload.permissions.canEdit, false);
  assert.equal(payload.permissions.canPreparePreview, false);
  assert.equal(payload.publication.revision, 0);
  assert.equal(payload.checklist.blockingCount, 3);
});

test('OWNER em SETUP recebe edição permitida e checklist derivado sem duplicar Event', async () => {
  const completeEvent = {
    ...event,
    format: 'ONLINE',
    startDate: new Date('2026-10-10T12:00:00.000Z'),
    endDate: new Date('2026-10-12T21:00:00.000Z'),
  };
  const publication = makePublication({
    shortDescription: 'Descrição pública',
    publicContactEmail: 'contato@evento.test',
    accessibilitySummary: 'Recursos de acessibilidade informados.',
  });
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const repository = makeRepository({ findByScope: async () => publication });
  const prisma = makePrisma({ event: { findUnique: async () => completeEvent } });
  const service = new EventPublicationService(prisma, authorization, repository);

  const payload = await service.getAdmin('user_1', event.id);

  assert.equal(payload.permissions.canEdit, true);
  assert.equal(payload.permissions.canPreparePreview, true);
  assert.equal(payload.checklist.blockingCount, 0);
  assert.equal(payload.checklist.recommendedPendingCount, 0);
  assert.equal('organizationId' in payload.event, false);
});

test('evento PUBLISHED fica congelado para edição mas mantém preparação de preview para OWNER', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const prisma = makePrisma({ event: { findUnique: async () => ({ ...event, status: 'PUBLISHED' }) } });
  const service = new EventPublicationService(prisma, authorization, makeRepository());

  const payload = await service.getAdmin('user_1', event.id);

  assert.equal(payload.permissions.canEdit, false);
  assert.equal(payload.permissions.canPreparePreview, true);
});
