import type { ScientificExternalActor } from './scientific-external-access.policy.js';

export type ScientificExternalCredentialPersistenceInput = {
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  singleUse: boolean;
  createdByUserId?: string | null;
};

export type ScientificExternalCredentialStoredState = ScientificExternalCredentialPersistenceInput & {
  id: string;
  revokedAt?: Date | null;
  consumedAt?: Date | null;
};

export type ScientificExternalSessionPersistenceInput = {
  credentialId: string;
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  sessionHash: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type ScientificExternalSessionStoredState = ScientificExternalSessionPersistenceInput & {
  id: string;
  revokedAt?: Date | null;
};

export type ScientificExternalAuditAction =
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_ISSUED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_EXCHANGED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_REVOKED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_CONSUMED'
  | 'SCIENTIFIC_EXTERNAL_SESSION_REVOKED';

export type ScientificExternalAuditPersistenceInput = {
  action: ScientificExternalAuditAction;
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  credentialId?: string | null;
  sessionId?: string | null;
  occurredAt: Date;
  metadata?: Record<string, unknown> | null;
};

export class ScientificExternalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificExternalPersistenceError';
  }
}

function assertOpaqueHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new ScientificExternalPersistenceError(`${label} deve conter somente hash SHA-256.`);
  }
}

function assertScope(actor: ScientificExternalActor, organizationId: string, eventId: string, personId: string): void {
  if (actor !== 'AUTHOR' && actor !== 'REVIEWER') {
    throw new ScientificExternalPersistenceError('Ator científico externo inválido.');
  }
  if (!organizationId || !eventId || !personId) {
    throw new ScientificExternalPersistenceError('Escopo científico externo incompleto.');
  }
}

function assertSameScope(
  expected: Pick<ScientificExternalAuditPersistenceInput, 'actor' | 'organizationId' | 'eventId' | 'personId'>,
  actual: Pick<ScientificExternalCredentialPersistenceInput, 'actor' | 'organizationId' | 'eventId' | 'personId'>,
  label: string,
): void {
  if (
    expected.actor !== actual.actor ||
    expected.organizationId !== actual.organizationId ||
    expected.eventId !== actual.eventId ||
    expected.personId !== actual.personId
  ) {
    throw new ScientificExternalPersistenceError(`${label} não pertence ao mesmo escopo da auditoria científica externa.`);
  }
}

function assertValidDate(value: Date | null | undefined, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ScientificExternalPersistenceError(`${label} inválido.`);
  }
}

function assertOptionalValidDate(value: Date | null | undefined, label: string): void {
  if (value == null) return;
  assertValidDate(value, label);
}

function assertWindow(issuedAt: Date, expiresAt: Date): void {
  assertValidDate(issuedAt, 'issuedAt');
  assertValidDate(expiresAt, 'expiresAt');
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new ScientificExternalPersistenceError('Janela temporal científica externa inválida.');
  }
}

export function assertScientificExternalCredentialPersistenceInput(
  input: ScientificExternalCredentialPersistenceInput,
): void {
  assertScope(input.actor, input.organizationId, input.eventId, input.personId);
  assertOpaqueHash(input.tokenHash, 'tokenHash');
  assertWindow(input.issuedAt, input.expiresAt);
}

export function assertScientificExternalCredentialStoredState(
  input: ScientificExternalCredentialStoredState,
): void {
  if (!input.id) {
    throw new ScientificExternalPersistenceError('id da credencial obrigatório.');
  }
  assertScientificExternalCredentialPersistenceInput(input);
  assertOptionalValidDate(input.revokedAt, 'revokedAt');
  assertOptionalValidDate(input.consumedAt, 'consumedAt');
  if (!input.singleUse && input.consumedAt) {
    throw new ScientificExternalPersistenceError('Credencial reutilizável não pode ser marcada como consumida.');
  }
  if (input.revokedAt && input.revokedAt.getTime() < input.issuedAt.getTime()) {
    throw new ScientificExternalPersistenceError('revokedAt não pode anteceder issuedAt.');
  }
  if (input.consumedAt && input.consumedAt.getTime() < input.issuedAt.getTime()) {
    throw new ScientificExternalPersistenceError('consumedAt não pode anteceder issuedAt.');
  }
}

export function assertScientificExternalSessionPersistenceInput(
  input: ScientificExternalSessionPersistenceInput,
): void {
  if (!input.credentialId) {
    throw new ScientificExternalPersistenceError('credentialId obrigatório.');
  }
  assertScope(input.actor, input.organizationId, input.eventId, input.personId);
  assertOpaqueHash(input.sessionHash, 'sessionHash');
  assertWindow(input.issuedAt, input.expiresAt);
}

export function assertScientificExternalSessionStoredState(
  input: ScientificExternalSessionStoredState,
): void {
  if (!input.id) {
    throw new ScientificExternalPersistenceError('id da sessão obrigatório.');
  }
  assertScientificExternalSessionPersistenceInput(input);
  assertOptionalValidDate(input.revokedAt, 'revokedAt');
  if (input.revokedAt && input.revokedAt.getTime() < input.issuedAt.getTime()) {
    throw new ScientificExternalPersistenceError('revokedAt não pode anteceder issuedAt.');
  }
}

export function assertScientificExternalSessionMatchesCredential(
  credential: ScientificExternalCredentialPersistenceInput,
  session: ScientificExternalSessionPersistenceInput,
): void {
  assertScientificExternalCredentialPersistenceInput(credential);
  assertScientificExternalSessionPersistenceInput(session);

  if (
    credential.actor !== session.actor ||
    credential.organizationId !== session.organizationId ||
    credential.eventId !== session.eventId ||
    credential.personId !== session.personId
  ) {
    throw new ScientificExternalPersistenceError('Sessão não pode ampliar ou trocar o escopo da credencial.');
  }
  if (session.issuedAt.getTime() < credential.issuedAt.getTime()) {
    throw new ScientificExternalPersistenceError('Sessão não pode anteceder a emissão da credencial.');
  }
  if (session.expiresAt.getTime() > credential.expiresAt.getTime()) {
    throw new ScientificExternalPersistenceError('Sessão não pode ultrapassar a expiração da credencial.');
  }
}

export function assertScientificExternalAuditPersistenceInput(
  input: ScientificExternalAuditPersistenceInput,
): void {
  assertScope(input.actor, input.organizationId, input.eventId, input.personId);
  assertValidDate(input.occurredAt, 'occurredAt');

  if (!input.credentialId && !input.sessionId) {
    throw new ScientificExternalPersistenceError('Auditoria científica externa deve referenciar credencial ou sessão.');
  }

  const metadata = input.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    if (/token|session.*secret|secret|hash/i.test(key)) {
      throw new ScientificExternalPersistenceError('Auditoria científica externa não pode persistir segredo ou hash de autenticação.');
    }
  }
}

export function assertScientificExternalAuditMatchesEvidence(
  audit: ScientificExternalAuditPersistenceInput,
  evidence: {
    credential?: ScientificExternalCredentialStoredState | null;
    session?: ScientificExternalSessionStoredState | null;
  },
): void {
  assertScientificExternalAuditPersistenceInput(audit);

  const credential = evidence.credential ?? null;
  const session = evidence.session ?? null;

  if (audit.credentialId) {
    if (!credential || credential.id !== audit.credentialId) {
      throw new ScientificExternalPersistenceError('Credencial referenciada pela auditoria científica externa não foi comprovada.');
    }
    assertScientificExternalCredentialStoredState(credential);
    assertSameScope(audit, credential, 'Credencial');
  }

  if (audit.sessionId) {
    if (!session || session.id !== audit.sessionId) {
      throw new ScientificExternalPersistenceError('Sessão referenciada pela auditoria científica externa não foi comprovada.');
    }
    assertScientificExternalSessionStoredState(session);
    assertSameScope(audit, session, 'Sessão');

    if (audit.credentialId && session.credentialId !== audit.credentialId) {
      throw new ScientificExternalPersistenceError('Sessão da auditoria não pertence à credencial referenciada.');
    }
  }
}

export function scientificExternalPersistenceProfile() {
  return {
    credentialSecretStorage: 'SHA256_HASH_ONLY',
    sessionSecretStorage: 'SHA256_HASH_ONLY',
    requiredScope: ['actor', 'organizationId', 'eventId', 'personId'],
    emailMayGrantIdentity: false,
    administrativeUserMaySubstituteExternalPerson: false,
    revocationMustBePersisted: true,
    consumptionMustBePersisted: true,
    auditRequired: true,
    auditMayPersistAuthenticationSecrets: false,
    auditReferencesMustMatchScope: true,
    sessionMayOutliveCredential: false,
    sessionMayPredateCredential: false,
  } as const;
}
