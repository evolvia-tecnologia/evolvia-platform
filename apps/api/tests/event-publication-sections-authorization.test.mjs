import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventPublicationSectionsService } from '../dist/event-publication/event-publication-sections.service.js';

const event = {
  id: 'evt_auth_sections_1',
  organizationId: 'org_auth_sections_1',
  status: 'SETUP',
};

function makeRepository() {
  return {
    lockEventScope: async () => ({ status: 'SETUP' }),
  };
}

function makePrisma(membership) {
  let transactionCalled = false;
  const prisma = {
    event: {
      findUnique: async () => event,
    },
    organizationMembership: {
      findUnique: async ({ where }) => {
        const requested = where.organizationId_userId;
        if (
          requested.organizationId !== event.organizationId ||
          requested.userId !== 'user_1'
        ) {
          return null;
        }
        return membership;
      },
    },
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('não deveria abrir transação');
    },
  };
  return { prisma, transactionCalled: () => transactionCalled };
}

for (const status of ['SUSPENDED', 'REMOVED']) {
  test(`membership ${status} não consegue mutar seções da Divulgação`, async () => {
    const { prisma, transactionCalled } = makePrisma({
      role: 'OWNER',
      status,
      organization: { id: event.organizationId },
    });
    const authorization = new AuthorizationService(prisma);
    const service = new EventPublicationSectionsService(
      prisma,
      authorization,
      makeRepository(),
    );

    await assert.rejects(
      () =>
        service.create('user_1', event.id, {
          kind: 'TEXT',
          enabled: true,
          sortOrder: 0,
          content: { text: 'Não deve persistir' },
        }),
      /Organização não encontrada/,
    );
    assert.equal(transactionCalled(), false);
  });
}

test('usuário com membership em outra organização não obtém acesso ao evento por conhecer o eventId', async () => {
  let transactionCalled = false;
  const prisma = {
    event: {
      findUnique: async () => event,
    },
    organizationMembership: {
      findUnique: async ({ where }) => {
        assert.equal(
          where.organizationId_userId.organizationId,
          event.organizationId,
          'a autorização deve usar o organizationId canônico do evento',
        );
        return null;
      },
    },
    $transaction: async () => {
      transactionCalled = true;
      throw new Error('não deveria abrir transação');
    },
  };
  const authorization = new AuthorizationService(prisma);
  const service = new EventPublicationSectionsService(
    prisma,
    authorization,
    makeRepository(),
  );

  await assert.rejects(
    () =>
      service.create('user_de_outro_tenant', event.id, {
        kind: 'TEXT',
        enabled: true,
        sortOrder: 0,
        content: { text: 'Tentativa cross-tenant' },
      }),
    /Organização não encontrada/,
  );
  assert.equal(transactionCalled, false);
});
