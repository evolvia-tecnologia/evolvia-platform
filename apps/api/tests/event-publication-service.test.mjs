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
  timeZone: 'America/Sao_Paulo',
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
    catalogListed: true,
    themeConfig: null,
    revision: 1,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSection(overrides = {}) {
  return {
    id: 'section_1',
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: 'pub_1',
    kind: 'TEXT',
    title: 'Sobre o evento',
    enabled: true,
    sortOrder: 0,
    content: { text: 'Conteúdo público estruturado.' },
    canonicalSourceType: null,
    canonicalSourceId: null,
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
    findSectionsByScope: async () => [],
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
  assert.equal(payload.permissions.canEditSections, false);
  assert.equal(payload.permissions.canPreparePreview, false);
  assert.equal(payload.publication.revision, 0);
  assert.equal(payload.checklist.blockingCount, 4);
  assert.equal(payload.evaGuidance.scope, 'EVENT_PUBLICATION');
  assert.equal(payload.evaGuidance.nextStep.code, 'NO_AVAILABLE_ACTION');
  assert.equal(payload.evaGuidance.pendingItems.filter((item) => item.priority === 'BLOCKING').length, 4);
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
    coverAssetId: 'asset_cover_complete',
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
  assert.equal(payload.permissions.canEditSections, true);
  assert.equal(payload.permissions.canPreparePreview, true);
  assert.equal(payload.checklist.blockingCount, 0);
  assert.equal(payload.checklist.recommendedPendingCount, 0);
  assert.equal(payload.evaGuidance.nextStep.code, 'SEND_TO_HOMOLOGATION');
  assert.equal('organizationId' in payload.event, false);
  assert.equal(JSON.stringify(payload.evaGuidance).includes(event.organizationId), false);
  assert.equal(JSON.stringify(payload.evaGuidance).includes('contato@evento.test'), false);
});

test('EVA explica homologação conforme permissão efetiva sem revelar o papel nominal', async () => {
  const completeEvent = {
    ...event,
    status: 'HOMOLOGATION',
    format: 'ONLINE',
    startDate: new Date('2026-10-10T12:00:00.000Z'),
  };
  const publication = makePublication({
    shortDescription: 'Descrição pública',
    coverAssetId: 'asset_cover_homologation',
  });
  const repository = makeRepository({ findByScope: async () => publication });
  const prisma = makePrisma({ event: { findUnique: async () => completeEvent } });

  const managerPayload = await new EventPublicationService(
    prisma,
    { requireMembership: async () => ({ role: 'MANAGER' }) },
    repository,
  ).getAdmin('user_manager', event.id);
  const ownerPayload = await new EventPublicationService(
    prisma,
    { requireMembership: async () => ({ role: 'OWNER' }) },
    repository,
  ).getAdmin('user_owner', event.id);

  assert.equal(managerPayload.evaGuidance.nextStep.code, 'WAIT_FOR_APPROVAL');
  assert.equal(ownerPayload.evaGuidance.nextStep.code, 'APPROVE_HOMOLOGATION');
  assert.equal(JSON.stringify(managerPayload.evaGuidance).includes('MANAGER'), false);
  assert.equal(JSON.stringify(ownerPayload.evaGuidance).includes('OWNER'), false);
});

test('EVA trata timezone legado pendente como fundação do evento, não como campo editorial', async () => {
  const legacyEvent = {
    ...event,
    format: 'ONLINE',
    startDate: new Date('2026-10-10T12:00:00.000Z'),
    timeZone: null,
  };
  const publication = makePublication({ shortDescription: 'Descrição pública' });
  const service = new EventPublicationService(
    makePrisma({ event: { findUnique: async () => legacyEvent } }),
    { requireMembership: async () => ({ role: 'OWNER' }) },
    makeRepository({ findByScope: async () => publication }),
  );

  const payload = await service.getAdmin('user_owner', event.id);

  assert.equal(payload.evaGuidance.nextStep.code, 'COMPLETE_EVENT_SETUP');
  assert.equal(payload.evaGuidance.nextStep.targetId, 'event-configuration');
  assert.equal(payload.evaGuidance.pendingItems.some((item) => item.code === 'EVENT_TIME_ZONE'), true);
});

test('leitura de seções usa o mesmo organizationId + eventId + publicationId do agregado', async () => {
  const publication = makePublication();
  let receivedScope = null;
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const repository = makeRepository({
    findByScope: async () => publication,
    findSectionsByScope: async (_client, organizationId, eventId, publicationId) => {
      receivedScope = { organizationId, eventId, publicationId };
      return [makeSection()];
    },
  });
  const service = new EventPublicationService(makePrisma(), authorization, repository);

  const payload = await service.getAdmin('user_1', event.id);

  assert.deepEqual(receivedScope, {
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: publication.id,
  });
  assert.equal(payload.sections.length, 1);
  assert.equal(payload.sections[0].kind, 'TEXT');
  assert.equal('organizationId' in payload.sections[0], false);
  assert.equal('eventId' in payload.sections[0], false);
  assert.equal('publicationId' in payload.sections[0], false);
});

test('themeConfig aceita somente presets e tokens controlados', async () => {
  let receivedEditable = null;
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const repository = makeRepository({
    create: async (_tx, _organizationId, _eventId, editable) => {
      receivedEditable = editable;
      return makePublication({ themeConfig: editable.themeConfig });
    },
  });
  const service = new EventPublicationService(makePrisma(), authorization, repository);

  await service.updateAdmin('user_1', event.id, {
    revision: 0,
    themeConfig: {
      preset: 'HIGH_CONTRAST',
      fontScale: 'LARGE',
      contentWidth: 'WIDE',
      primaryColor: '#0b5ec7',
      accentColor: '#174d91',
    },
  });

  assert.deepEqual(receivedEditable.themeConfig, {
    preset: 'HIGH_CONTRAST',
    fontScale: 'LARGE',
    contentWidth: 'WIDE',
    primaryColor: '#0B5EC7',
    accentColor: '#174D91',
  });
});

test('themeConfig rejeita CSS ou chaves arbitrárias', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const service = new EventPublicationService(makePrisma(), authorization, makeRepository());

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, {
      revision: 0,
      themeConfig: { customCss: 'body{display:none}', primaryColor: '#000000' },
    }),
    /opção não permitida/,
  );
});

test('themeConfig rejeita cor fora de #RRGGBB', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const service = new EventPublicationService(makePrisma(), authorization, makeRepository());

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, {
      revision: 0,
      themeConfig: { primaryColor: 'red' },
    }),
    /#RRGGBB/,
  );
});

test('themeConfig rejeita valores fora dos presets controlados', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const service = new EventPublicationService(makePrisma(), authorization, makeRepository());

  await assert.rejects(
    () => service.updateAdmin('user_1', event.id, {
      revision: 0,
      themeConfig: { preset: 'CUSTOM' },
    }),
    /Preset visual inválido/,
  );
});

test('evento PUBLISHED fica congelado para edição mas mantém preparação de preview para OWNER', async () => {
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const prisma = makePrisma({ event: { findUnique: async () => ({ ...event, status: 'PUBLISHED' }) } });
  const service = new EventPublicationService(prisma, authorization, makeRepository());

  const payload = await service.getAdmin('user_1', event.id);

  assert.equal(payload.permissions.canEdit, false);
  assert.equal(payload.permissions.canEditSections, false);
  assert.equal(payload.permissions.canPreparePreview, true);
});
