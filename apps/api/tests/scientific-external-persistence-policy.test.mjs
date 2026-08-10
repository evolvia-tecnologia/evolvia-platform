import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertScientificExternalCredentialPersistenceInput,
  assertScientificExternalSessionMatchesCredential,
  assertScientificExternalSessionPersistenceInput,
  scientificExternalPersistenceProfile,
} from '../dist/scientific-external-persistence.policy.js';

const issuedAt = new Date('2026-08-10T14:00:00.000Z');
const expiresAt = new Date('2026-08-10T15:00:00.000Z');
const tokenHash = 'a'.repeat(64);
const sessionHash = 'b'.repeat(64);

function credential(overrides = {}) {
  return {
    actor: 'AUTHOR',
    organizationId: 'org-1',
    eventId: 'event-1',
    personId: 'person-1',
    tokenHash,
    issuedAt,
    expiresAt,
    singleUse: true,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    credentialId: 'credential-1',
    actor: 'AUTHOR',
    organizationId: 'org-1',
    eventId: 'event-1',
    personId: 'person-1',
    sessionHash,
    issuedAt: new Date('2026-08-10T14:05:00.000Z'),
    expiresAt: new Date('2026-08-10T14:35:00.000Z'),
    ...overrides,
  };
}

test('contrato de persistência exige escopo event-scoped e somente hashes SHA-256', () => {
  assert.doesNotThrow(() => assertScientificExternalCredentialPersistenceInput(credential()));
  assert.doesNotThrow(() => assertScientificExternalSessionPersistenceInput(session()));

  assert.throws(() => assertScientificExternalCredentialPersistenceInput(credential({ tokenHash: 'segredo-em-claro' })), /hash SHA-256/i);
  assert.throws(() => assertScientificExternalCredentialPersistenceInput(credential({ eventId: '' })), /escopo/i);
  assert.throws(() => assertScientificExternalSessionPersistenceInput(session({ credentialId: '' })), /credentialId/i);
  assert.throws(() => assertScientificExternalSessionPersistenceInput(session({ expiresAt: issuedAt })), /janela temporal/i);
});

test('sessão persistida não pode trocar ator, organização, evento ou pessoa da credencial', () => {
  const base = credential();

  assert.doesNotThrow(() => assertScientificExternalSessionMatchesCredential(base, session()));
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ actor: 'REVIEWER' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ organizationId: 'org-2' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ eventId: 'event-2' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ personId: 'person-2' })), /ampliar|trocar o escopo/i);
});

test('sessão persistida nunca pode sobreviver à credencial que a originou', () => {
  assert.throws(() => assertScientificExternalSessionMatchesCredential(
    credential(),
    session({ expiresAt: new Date('2026-08-10T15:00:01.000Z') }),
  ), /ultrapassar a expiração/i);
});

test('perfil de persistência proíbe identidade por e-mail e substituição por usuário administrativo', () => {
  const profile = scientificExternalPersistenceProfile();
  assert.equal(profile.credentialSecretStorage, 'SHA256_HASH_ONLY');
  assert.equal(profile.sessionSecretStorage, 'SHA256_HASH_ONLY');
  assert.equal(profile.emailMayGrantIdentity, false);
  assert.equal(profile.administrativeUserMaySubstituteExternalPerson, false);
  assert.equal(profile.revocationMustBePersisted, true);
  assert.equal(profile.consumptionMustBePersisted, true);
  assert.equal(profile.auditRequired, true);
});
