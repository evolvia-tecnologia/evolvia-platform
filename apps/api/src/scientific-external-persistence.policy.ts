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

export type ScientificExternalAuditAction =
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_ISSUED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_EXCHANGED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_REVOKED'
  | 'SCIENTIFIC_EXTERNAL_CREDENTIAL_CONSUMED'
  | 'SCIENTIFIC_EXTERNAL_SESSION_REVOKED';

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

function assertWindow(issuedAt: Date, expiresAt: Date): void {
  if (!(issuedAt instanceof Date) || Number.isNaN(issuedAt.getTime())) {
    throw new ScientificExternalPersistenceError('issuedAt inválido.');
  }
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new ScientificExternalPersistenceError('expiresAt inválido.');
  }
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
  if (session.expiresAt.getTime() > credential.expiresAt.getTime()) {
    throw new ScientificExternalPersistenceError('Sessão não pode ultrapassar a expiração da credencial.');
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
    sessionMayOutliveCredential: false,
  } as const;
}
