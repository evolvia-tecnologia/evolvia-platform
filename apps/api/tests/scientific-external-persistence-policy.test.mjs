import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertScientificExternalAuditPersistenceInput,
  assertScientificExternalCredentialPersistenceInput,
  assertScientificExternalCredentialStoredState,
  assertScientificExternalSessionMatchesCredential,
  assertScientificExternalSessionPersistenceInput,
  assertScientificExternalSessionStoredState,
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

function storedCredential(overrides = {}) {
  return {
    id: 'credential-1',
    revokedAt: null,
    consumedAt: null,
    ...credential(),
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

function storedSession(overrides = {}) {
  return {
    id: 'session-1',
    revokedAt: null,
    ...session(),
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

test('estado persistido de credencial valida revogação e consumo sem estados impossíveis', () => {
  assert.doesNotThrow(() => assertScientificExternalCredentialStoredState(storedCredential()));
  assert.doesNotThrow(() => assertScientificExternalCredentialStoredState(storedCredential({ consumedAt: new Date('2026-08-10T14:10:00.000Z') })));
  assert.throws(() => assertScientificExternalCredentialStoredState(storedCredential({ id: '' })), /id da credencial/i);
  assert.throws(() => assertScientificExternalCredentialStoredState(storedCredential({ singleUse: false, consumedAt: new Date('2026-08-10T14:10:00.000Z') })), /reutilizável/i);
  assert.throws(() => assertScientificExternalCredentialStoredState(storedCredential({ revokedAt: new Date('2026-08-10T13:59:59.000Z') })), /revokedAt/i);
  assert.throws(() => assertScientificExternalCredentialStoredState(storedCredential({ consumedAt: new Date('2026-08-10T13:59:59.000Z') })), /consumedAt/i);
});

test('estado persistido de sessão valida revogação sem permitir tempo impossível', () => {
  assert.doesNotThrow(() => assertScientificExternalSessionStoredState(storedSession()));
  assert.throws(() => assertScientificExternalSessionStoredState(storedSession({ id: '' })), /id da sessão/i);
  assert.throws(() => assertScientificExternalSessionStoredState(storedSession({ revokedAt: new Date('2026-08-10T14:04:59.000Z') })), /revokedAt/i);
});

test('sessão persistida não pode trocar ator, organização, evento ou pessoa da credencial', () => {
  const base = credential();

  assert.doesNotThrow(() => assertScientificExternalSessionMatchesCredential(base, session()));
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ actor: 'REVIEWER' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ organizationId: 'org-2' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ eventId: 'event-2' })), /ampliar|trocar o escopo/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(base, session({ personId: 'person-2' })), /ampliar|trocar o escopo/i);
});

test('sessão persistida respeita integralmente a janela temporal da credencial', () => {
  assert.throws(() => assertScientificExternalSessionMatchesCredential(
    credential(),
    session({ issuedAt: new Date('2026-08-10T13:59:59.000Z') }),
  ), /anteceder a emissão/i);
  assert.throws(() => assertScientificExternalSessionMatchesCredential(
    credential(),
    session({ expiresAt: new Date('2026-08-10T15:00:01.000Z') }),
  ), /ultrapassar a expiração/i);
});

test('auditoria externa exige escopo, referência e nunca aceita segredo/hash de autenticação', () => {
  const audit = {
    action: 'SCIENTIFIC_EXTERNAL_CREDENTIAL_EXCHANGED',
    actor: 'AUTHOR',
    organizationId: 'org-1',
    eventId: 'event-1',
    personId: 'person-1',
    credentialId: 'credential-1',
    sessionId: 'session-1',
    occurredAt: new Date('2026-08-10T14:05:00.000Z'),
    metadata: { source: 'portal-author' },
  };

  assert.doesNotThrow(() => assertScientificExternalAuditPersistenceInput(audit));
  assert.throws(() => assertScientificExternalAuditPersistenceInput({ ...audit, credentialId: null, sessionId: null }), /referenciar credencial ou sessão/i);
  assert.throws(() => assertScientificExternalAuditPersistenceInput({ ...audit, metadata: { tokenHash } }), /segredo|hash/i);
  assert.throws(() => assertScientificExternalAuditPersistenceInput({ ...audit, metadata: { sessionSecret: 'x' } }), /segredo|hash/i);
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
  assert.equal(profile.auditMayPersistAuthenticationSecrets, false);
  assert.equal(profile.sessionMayOutliveCredential, false);
  assert.equal(profile.sessionMayPredateCredential, false);
});
