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

function makeRepository(overrides = {}) {
  return {
    lockEventScope: async () => ({ status: 'SETUP' }),
    findByScope: async () => null,
    create: async () => ({
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
    }),
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
  const current = {
    ...(await makeRepository().create()),
    revision: 2,
    shortDescription: 'Versão atual',
  };
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
