import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationRepository } from '../dist/event-publication/event-publication.repository.js';
import { EventPublicationSectionsService } from '../dist/event-publication/event-publication-sections.service.js';

const event = {
  id: 'evt_sections_1',
  organizationId: 'org_sections_1',
  status: 'SETUP',
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

function makeAuthorization(role = 'OWNER') {
  return {
    requireMembership: async () => ({ role }),
  };
}

function makeSection(overrides = {}) {
  return {
    id: 'sec_1',
    organizationId: event.organizationId,
    eventId: event.id,
    publicationId: 'pub_1',
    kind: 'TEXT',
    title: 'Sobre o evento',
    enabled: true,
    sortOrder: 0,
    content: { text: 'Conteúdo seguro' },
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
    findByScope: async () => ({ id: 'pub_1' }),
    findSectionByScope: async () => makeSection(),
    findSectionsByScope: async () => [makeSection()],
    createSection: async (_tx, _org, _event, _publication, editable) => makeSection(editable),
    updateSectionIfRevision: async (_tx, current, _revision, editable) => ({
      ...current,
      ...editable,
      revision: current.revision + 1,
    }),
    removeSectionIfRevision: async () => true,
    reorderSections: async () => true,
    ...overrides,
  };
}

test('OPERATOR não consegue criar seção editorial', async () => {
  let transactionCalled = false;
  const prisma = makePrisma();
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const service = new EventPublicationSectionsService(
    prisma,
    makeAuthorization('OPERATOR'),
    makeRepository(),
  );

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'TEXT',
        enabled: true,
        sortOrder: 0,
        content: { text: 'Teste' },
      }),
    /Evento não encontrado/,
  );
  assert.equal(transactionCalled, false);
});

test('rejeita HTML arbitrário antes de persistir', async () => {
  let transactionCalled = false;
  const prisma = makePrisma();
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'TEXT',
        enabled: true,
        sortOrder: 0,
        content: { text: '<script>alert(1)</script>' },
      }),
    /HTML arbitrário/,
  );
  assert.equal(transactionCalled, false);
});

test('rejeita URL externa http e exige HTTPS', async () => {
  const service = new EventPublicationSectionsService(makePrisma(), makeAuthorization(), makeRepository());

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'HIGHLIGHT',
        enabled: true,
        sortOrder: 0,
        content: { url: 'http://exemplo.test/recurso' },
      }),
    /HTTPS/,
  );
});

test('referência canônica exige tipo e identificador juntos', async () => {
  const service = new EventPublicationSectionsService(makePrisma(), makeAuthorization(), makeRepository());

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'CANONICAL_REFERENCE',
        enabled: true,
        sortOrder: 0,
        content: {},
        canonicalSourceType: 'SCIENTIFIC_GUEST',
      }),
    /tipo e identificador juntos/,
  );
});

test('referência canônica não aceita convidado fora do escopo do evento', async () => {
  let receivedWhere = null;
  const prisma = makePrisma({
    tx: {
      scientificGuestProfile: {
        findFirst: async ({ where }) => {
          receivedWhere = where;
          return null;
        },
      },
    },
  });
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'CANONICAL_REFERENCE',
        enabled: true,
        sortOrder: 0,
        content: {},
        canonicalSourceType: 'SCIENTIFIC_GUEST',
        canonicalSourceId: 'guest_de_outro_evento',
      }),
    /Referência canônica não encontrada/,
  );

  assert.deepEqual(receivedWhere, {
    id: 'guest_de_outro_evento',
    organizationId: event.organizationId,
    eventId: event.id,
  });
});

test('referência canônica aceita atividade somente quando pertence ao mesmo evento e organização', async () => {
  let receivedWhere = null;
  const prisma = makePrisma({
    tx: {
      scientificProgramActivity: {
        findFirst: async ({ where }) => {
          receivedWhere = where;
          return { id: where.id };
        },
      },
    },
  });
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  const result = await service.create('user_1', event.id, {
    kind: 'CANONICAL_REFERENCE',
    title: 'Programação em destaque',
    enabled: true,
    sortOrder: 0,
    content: {},
    canonicalSourceType: 'SCIENTIFIC_ACTIVITY',
    canonicalSourceId: 'activity_1',
  });

  assert.deepEqual(receivedWhere, {
    id: 'activity_1',
    organizationId: event.organizationId,
    eventId: event.id,
  });
  assert.equal(result.canonicalSourceType, 'SCIENTIFIC_ACTIVITY');
  assert.equal(result.canonicalSourceId, 'activity_1');
});

test('reordenação rejeita IDs duplicados antes da transação', async () => {
  let transactionCalled = false;
  const prisma = makePrisma();
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  await assert.rejects(
    () => service.reorder('user_1', event.id, { sectionIds: ['sec_1', 'sec_1'], sectionRevisions: [1, 1] }),
    /IDs duplicados/,
  );
  assert.equal(transactionCalled, false);
});

test('reordenação exige uma revisão para cada seção antes da transação', async () => {
  let transactionCalled = false;
  const prisma = makePrisma();
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  await assert.rejects(
    () => service.reorder('user_1', event.id, { sectionIds: ['sec_1', 'sec_2'], sectionRevisions: [1] }),
    /revisão correspondente/,
  );
  assert.equal(transactionCalled, false);
});

test('reordenação rejeita snapshot desatualizado antes de escrever posições', async () => {
  let reorderCalled = false;
  const current = [
    makeSection({ id: 'sec_1', sortOrder: 0, revision: 3 }),
    makeSection({ id: 'sec_2', sortOrder: 1, revision: 5 }),
  ];
  const repository = makeRepository({
    findSectionsByScope: async () => current,
    reorderSections: async () => {
      reorderCalled = true;
      return true;
    },
  });
  const service = new EventPublicationSectionsService(makePrisma(), makeAuthorization(), repository);

  await assert.rejects(
    () => service.reorder('user_1', event.id, {
      sectionIds: ['sec_2', 'sec_1'],
      sectionRevisions: [4, 3],
    }),
    /foram alteradas/,
  );
  assert.equal(reorderCalled, false);
});

test('reordenação envia IDs e revisões esperadas de forma atômica ao repository', async () => {
  const current = [
    makeSection({ id: 'sec_1', sortOrder: 0, revision: 3 }),
    makeSection({ id: 'sec_2', sortOrder: 1, revision: 5 }),
  ];
  let readCount = 0;
  let receivedOrderedSections = null;
  const repository = makeRepository({
    findSectionsByScope: async () => {
      readCount += 1;
      return readCount === 1
        ? current
        : [
            makeSection({ id: 'sec_2', sortOrder: 0, revision: 6 }),
            makeSection({ id: 'sec_1', sortOrder: 1, revision: 4 }),
          ];
    },
    reorderSections: async (_tx, _org, _event, _publication, orderedSections) => {
      receivedOrderedSections = orderedSections;
      return true;
    },
  });
  const service = new EventPublicationSectionsService(makePrisma(), makeAuthorization(), repository);

  const result = await service.reorder('user_1', event.id, {
    sectionIds: ['sec_2', 'sec_1'],
    sectionRevisions: [5, 3],
  });

  assert.deepEqual(receivedOrderedSections, [
    { id: 'sec_2', revision: 5 },
    { id: 'sec_1', revision: 3 },
  ]);
  assert.deepEqual(result.map((section) => [section.id, section.sortOrder, section.revision]), [
    ['sec_2', 0, 6],
    ['sec_1', 1, 4],
  ]);
});

test('repository sinaliza conflito se uma atualização condicional de reorder não afetar a seção', async () => {
  let call = 0;
  const tx = {
    $executeRaw: async () => {
      call += 1;
      if (call === 1) return 2;
      if (call === 2) return 1;
      return 0;
    },
  };
  const repository = new EventPublicationRepository({});

  const result = await repository.reorderSections(
    tx,
    event.organizationId,
    event.id,
    'pub_1',
    [
      { id: 'sec_1', revision: 3 },
      { id: 'sec_2', revision: 5 },
    ],
  );

  assert.equal(result, false);
  assert.equal(call, 3);
});

test('auditoria de criação registra metadados mínimos sem conteúdo editorial', async () => {
  let auditData = null;
  const prisma = makePrisma({
    tx: {
      auditLog: {
        create: async ({ data }) => {
          auditData = data;
          return {};
        },
      },
    },
  });
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  const result = await service.create('user_1', event.id, {
    kind: 'TEXT',
    title: ' Sobre   o evento ',
    enabled: true,
    sortOrder: 0,
    content: { text: 'Informação pública' },
  });

  assert.equal(result.title, 'Sobre o evento');
  assert.ok(auditData);
  assert.equal(auditData.action, 'event.publication.section.created');
  const serializedMetadata = JSON.stringify(auditData.metadata);
  assert.equal(serializedMetadata.includes('Informação pública'), false);
  assert.equal(serializedMetadata.includes('content'), false);
});

test('HOMOLOGATION congela mutação das seções antes da transação', async () => {
  let transactionCalled = false;
  const prisma = makePrisma({ event: { findUnique: async () => ({ ...event, status: 'HOMOLOGATION' }) } });
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error('não deveria abrir transação');
  };
  const service = new EventPublicationSectionsService(prisma, makeAuthorization(), makeRepository());

  await assert.rejects(
    () =>
      service.create('user_1', event.id, {
        kind: 'TEXT',
        enabled: true,
        sortOrder: 0,
        content: { text: 'Teste' },
      }),
    /congeladas/,
  );
  assert.equal(transactionCalled, false);
});
