import { BadRequestException, NotFoundException } from '@nestjs/common';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';
import { SCIENTIFIC_NUMERIC_RULE_DEFAULTS } from '../dist/scientific-submission-numeric-rules.js';
import { ScientificSubmissionsService } from '../dist/scientific-submissions.service.js';

const event = {
  id: 'event-c1',
  name: 'Congresso de Regras Essenciais',
  organizationId: 'org-c1',
  ownerId: 'owner-c1',
  profileCode: 'SCIENTIFIC_EVENT',
  status: 'SETUP',
};

function makeHarness({
  actorUserId = 'owner-c1',
  membership = { role: 'OWNER', status: 'ACTIVE', organization: { id: event.organizationId } },
  config = {
    id: 'cfg-c1',
    ...event,
    eventId: event.id,
    requireArea: false,
    requireSubarea: false,
    requireFile: false,
    ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
    maxAuthors: 3,
    requirePresenter: true,
    requireCorrespondingAuthor: true,
    requireAuthorInstitution: true,
    presentationFormats: null,
    reviewMode: 'SINGLE_BLIND',
    allowCorrections: true,
  },
} = {}) {
  const upserts = [];
  const audits = [];
  let transactionCalled = false;
  const stored = { current: config };

  const prisma = {
    event: {
      findUnique: async ({ where }) => (where.id === event.id ? event : null),
    },
    organizationMembership: {
      findUnique: async ({ where }) => {
        const requested = where.organizationId_userId;
        if (requested.organizationId !== event.organizationId || requested.userId !== actorUserId) {
          return null;
        }
        return membership;
      },
    },
    scientificSubmissionConfig: {
      findUnique: async () => stored.current,
    },
    scientificSubmissionModality: { findMany: async () => [] },
    scientificSubmission: { findMany: async () => [] },
    $transaction: async (fn) => {
      transactionCalled = true;
      return fn({
        scientificSubmissionConfig: {
          upsert: async (args) => {
            upserts.push(args);
            stored.current = { id: 'cfg-c1', ...stored.current, ...args.create, ...args.update };
            return stored.current;
          },
        },
        auditLog: {
          create: async (args) => {
            audits.push(args);
            return args;
          },
        },
      });
    },
  };

  const service = new ScientificSubmissionsService(
    prisma,
    new AuthorizationService(prisma),
    new EventMutationPolicy(),
  );

  return {
    service,
    upserts,
    audits,
    transactionOpened: () => transactionCalled,
  };
}

test('patch parcial incoerente de autores não abre transação nem persiste', async () => {
  const { service, upserts, transactionOpened } = makeHarness();

  await assert.rejects(
    () => service.configure('owner-c1', event.id, { minAuthors: 9 }),
    (error) => error instanceof BadRequestException
      && String(error.getResponse().message).includes('máximo de autores'),
  );
  assert.equal(transactionOpened(), false);
  assert.equal(upserts.length, 0);
});

test('limites seguros e par de palavras-chave são persistidos com auditoria sem PII', async () => {
  const { service, upserts, audits } = makeHarness();

  const payload = await service.configure('owner-c1', event.id, {
    maxSubmissionsPerAuthor: 2,
    minKeywords: 4,
    titleMaxLength: 180,
  });

  assert.equal(payload.config.maxSubmissionsPerAuthor, 2);
  assert.equal(payload.config.minKeywords, 4);
  assert.equal(payload.config.maxKeywords, 5);
  assert.equal(payload.config.titleMaxLength, 180);
  assert.equal(payload.config.maxAuthors, 3);
  assert.equal(payload.actorBoundary.authorActionsAvailableHere, false);
  assert.equal(upserts.length, 1);
  assert.deepEqual(audits[0].data.metadata, {
    changedFields: ['maxSubmissionsPerAuthor', 'minKeywords', 'titleMaxLength'],
  });
  assert.equal(JSON.stringify(audits[0]).includes('owner-c1@evolvia.local'), false);
  assert.equal(JSON.stringify(audits[0]).includes('Título científico confidencial'), false);
});

test('usuário de outro tenant não configura regras conhecendo o eventId', async () => {
  const { service, upserts, transactionOpened } = makeHarness({ actorUserId: 'owner-c1' });

  await assert.rejects(
    () => service.configure('user-de-outro-tenant', event.id, { titleMaxLength: 200 }),
    (error) => error instanceof NotFoundException,
  );
  assert.equal(transactionOpened(), false);
  assert.equal(upserts.length, 0);
});

test('papel sem permissão de edição permanece deny-by-default', async () => {
  const { service, upserts, transactionOpened } = makeHarness({
    membership: { role: 'VIEWER', status: 'ACTIVE', organization: { id: event.organizationId } },
  });

  await assert.rejects(
    () => service.configure('owner-c1', event.id, { maxSubmissionsPerAuthor: 3 }),
    /Organização não encontrada/,
  );
  assert.equal(transactionOpened(), false);
  assert.equal(upserts.length, 0);
});
