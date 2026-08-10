import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertScientificExternalTokenExchangeAllowed,
  buildScientificExternalSessionScope,
  generateScientificExternalOpaqueToken,
  hashScientificExternalToken,
  scientificExternalTokenMatches,
  scientificExternalTokenSecurityProfile,
} from '../dist/scientific-external-token.policy.js';

const now = new Date('2026-08-10T08:00:00.000Z');

function recordFor(rawToken, overrides = {}) {
  return {
    actor: 'AUTHOR',
    organizationId: 'org-1',
    eventId: 'event-1',
    personId: 'person-1',
    tokenHash: hashScientificExternalToken(rawToken),
    issuedAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    singleUse: true,
    ...overrides,
  };
}

test('token externo é opaco, aleatório e persistido somente por hash', () => {
  const tokenA = generateScientificExternalOpaqueToken();
  const tokenB = generateScientificExternalOpaqueToken();

  assert.match(tokenA, /^evx_scientific_[A-Za-z0-9_-]+$/);
  assert.notEqual(tokenA, tokenB);
  assert.match(hashScientificExternalToken(tokenA), /^[a-f0-9]{64}$/);
  assert.equal(scientificExternalTokenMatches(tokenA, hashScientificExternalToken(tokenA)), true);
  assert.equal(scientificExternalTokenMatches(tokenB, hashScientificExternalToken(tokenA)), false);

  const profile = scientificExternalTokenSecurityProfile();
  assert.equal(profile.tokenMayBeLogged, false);
  assert.equal(profile.tokenMayBePersistedPlaintext, false);
  assert.equal(profile.persistedSecret, 'SHA256_HASH_ONLY');
});

test('troca de token nega credencial inválida, expirada, revogada ou já consumida', () => {
  const token = generateScientificExternalOpaqueToken();
  const active = recordFor(token);

  assert.doesNotThrow(() => assertScientificExternalTokenExchangeAllowed(active, token, now));
  assert.throws(() => assertScientificExternalTokenExchangeAllowed(active, generateScientificExternalOpaqueToken(), now), /inválida/i);
  assert.throws(() => assertScientificExternalTokenExchangeAllowed(recordFor(token, {
    expiresAt: new Date(now.getTime() - 1),
  }), token, now), /expirada/i);
  assert.throws(() => assertScientificExternalTokenExchangeAllowed(recordFor(token, {
    revokedAt: new Date(now.getTime() - 1),
  }), token, now), /revogada/i);
  assert.throws(() => assertScientificExternalTokenExchangeAllowed(recordFor(token, {
    consumedAt: new Date(now.getTime() - 1),
  }), token, now), /consumida/i);
});

test('sessão herda ator e escopo imutável e nunca ultrapassa expiração da credencial', () => {
  const token = generateScientificExternalOpaqueToken();
  const record = recordFor(token, {
    actor: 'REVIEWER',
    organizationId: 'org-7',
    eventId: 'event-9',
    personId: 'reviewer-3',
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });

  const session = buildScientificExternalSessionScope(record, now, 30 * 60 * 1000);
  assert.deepEqual(session, {
    actor: 'REVIEWER',
    organizationId: 'org-7',
    eventId: 'event-9',
    personId: 'reviewer-3',
    issuedAt: now,
    expiresAt: record.expiresAt,
  });
  assert.equal(Object.isFrozen(session), true);
});
