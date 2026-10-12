import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthorOwnsSubmission,
  assertReviewerOwnsAssignment,
  assertScientificExternalCredentialActive,
  scientificExternalActorBoundary,
} from '../dist/scientific-external-access.policy.js';

const future = new Date(Date.now() + 60_000);
const base = {
  organizationId: 'org-1',
  eventId: 'event-1',
  issuedAt: new Date(),
  expiresAt: future,
};

test('identidade externa é deny-by-default e não aceita atalho administrativo/e-mail', () => {
  const boundary = scientificExternalActorBoundary();
  assert.equal(boundary.denyByDefault, true);
  assert.equal(boundary.administrativeIdentityAccepted, false);
  assert.equal(boundary.emailLookupGrantsAccess, false);
});

test('autor acessa somente trabalho em que possui vínculo no mesmo evento/organização', () => {
  const credential = { ...base, actor: 'AUTHOR', personId: 'author-1' };
  assert.doesNotThrow(() => assertAuthorOwnsSubmission(credential, {
    organizationId: 'org-1',
    eventId: 'event-1',
    authorPersonIds: ['author-1', 'author-2'],
  }));

  assert.throws(() => assertAuthorOwnsSubmission(credential, {
    organizationId: 'org-1',
    eventId: 'event-1',
    authorPersonIds: ['author-2'],
  }), /não possui vínculo/i);

  assert.throws(() => assertAuthorOwnsSubmission(credential, {
    organizationId: 'org-1',
    eventId: 'event-2',
    authorPersonIds: ['author-1'],
  }), /acesso cruzado/i);
});

test('avaliador acessa somente assignment explícito próprio', () => {
  const credential = { ...base, actor: 'REVIEWER', personId: 'reviewer-1' };
  assert.doesNotThrow(() => assertReviewerOwnsAssignment(credential, {
    organizationId: 'org-1',
    eventId: 'event-1',
    reviewerPersonId: 'reviewer-1',
  }));

  assert.throws(() => assertReviewerOwnsAssignment(credential, {
    organizationId: 'org-1',
    eventId: 'event-1',
    reviewerPersonId: 'reviewer-2',
  }), /não possui atribuição/i);
});

test('credencial expirada, revogada ou de uso único consumida é negada', () => {
  assert.throws(() => assertScientificExternalCredentialActive({
    ...base,
    actor: 'AUTHOR',
    personId: 'author-1',
    expiresAt: new Date(Date.now() - 1),
  }), /expirada/i);

  assert.throws(() => assertScientificExternalCredentialActive({
    ...base,
    actor: 'AUTHOR',
    personId: 'author-1',
    revokedAt: new Date(),
  }), /revogada/i);

  assert.throws(() => assertScientificExternalCredentialActive({
    ...base,
    actor: 'AUTHOR',
    personId: 'author-1',
    singleUse: true,
    consumedAt: new Date(),
  }), /uso único/i);
});
