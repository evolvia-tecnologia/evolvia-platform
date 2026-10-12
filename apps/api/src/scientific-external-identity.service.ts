import type { ScientificExternalActor } from './scientific-external-access.policy.js';
import {
  assertScientificExternalAuditMatchesEvidence,
  assertScientificExternalAuditPersistenceInput,
  assertScientificExternalCredentialPersistenceInput,
  assertScientificExternalCredentialStoredState,
  assertScientificExternalSessionMatchesCredential,
  assertScientificExternalSessionPersistenceInput,
  assertScientificExternalSessionStoredState,
  type ScientificExternalAuditPersistenceInput,
  type ScientificExternalCredentialPersistenceInput,
  type ScientificExternalCredentialStoredState,
  type ScientificExternalSessionPersistenceInput,
  type ScientificExternalSessionStoredState,
} from './scientific-external-persistence.policy.js';
import {
  assertScientificExternalTokenExchangeAllowed,
  buildScientificExternalSessionScope,
  generateScientificExternalOpaqueToken,
  hashScientificExternalToken,
  type ScientificExternalTokenRecord,
} from './scientific-external-token.policy.js';

export type ScientificExternalIdentityScope = {
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
};

export type IssueScientificExternalCredentialInput = ScientificExternalIdentityScope & {
  createdByUserId: string;
  expiresAt: Date;
  singleUse?: boolean;
};

export type ExchangeScientificExternalCredentialInput = {
  token: string;
  now?: Date;
  sessionTtlMs?: number;
};

export type AuthenticateScientificExternalSessionInput = {
  sessionToken: string;
  now?: Date;
};

export type ScientificExternalCredentialReceipt = ScientificExternalIdentityScope & {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
  singleUse: boolean;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
};

export type ScientificExternalSessionReceipt = ScientificExternalIdentityScope & {
  id: string;
  credentialId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
};

export type ScientificExternalIssuedCredential = {
  credential: ScientificExternalCredentialReceipt;
  token: string;
};

export type ScientificExternalEstablishedSession = {
  credential: ScientificExternalCredentialReceipt;
  session: ScientificExternalSessionReceipt;
  sessionToken: string;
};

export type ScientificExternalAuthenticatedSession = ScientificExternalIdentityScope & {
  sessionId: string;
  credentialId: string;
  expiresAt: Date;
};

export interface ScientificExternalIdentityTransaction {
  assertPersonEligibleForExternalActor(scope: ScientificExternalIdentityScope): Promise<void>;
  createCredential(input: ScientificExternalCredentialPersistenceInput): Promise<ScientificExternalCredentialStoredState>;
  findCredentialByTokenHashForUpdate(tokenHash: string): Promise<ScientificExternalCredentialStoredState | null>;
  markCredentialConsumed(id: string, consumedAt: Date): Promise<ScientificExternalCredentialStoredState>;
  createSession(input: ScientificExternalSessionPersistenceInput): Promise<ScientificExternalSessionStoredState>;
  createAudit(input: ScientificExternalAuditPersistenceInput): Promise<void>;
}

export interface ScientificExternalIdentityRepository {
  transaction<T>(work: (tx: ScientificExternalIdentityTransaction) => Promise<T>): Promise<T>;
  findSessionByHash(sessionHash: string): Promise<ScientificExternalSessionStoredState | null>;
}

export class ScientificExternalIdentityServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificExternalIdentityServiceError';
  }
}

function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ScientificExternalIdentityServiceError('Horário de referência inválido.');
  }
}

function assertIssueInput(input: IssueScientificExternalCredentialInput, now: Date): void {
  if (!input.createdByUserId) {
    throw new ScientificExternalIdentityServiceError('Usuário administrativo emissor é obrigatório.');
  }
  if (!input.organizationId || !input.eventId || !input.personId) {
    throw new ScientificExternalIdentityServiceError('Escopo científico externo incompleto.');
  }
  if (input.actor !== 'AUTHOR' && input.actor !== 'REVIEWER') {
    throw new ScientificExternalIdentityServiceError('Ator científico externo inválido.');
  }
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    throw new ScientificExternalIdentityServiceError('Expiração da credencial inválida.');
  }
  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new ScientificExternalIdentityServiceError('A credencial precisa expirar no futuro.');
  }
}

function tokenRecordFromCredential(
  credential: ScientificExternalCredentialStoredState,
): ScientificExternalTokenRecord {
  return {
    actor: credential.actor,
    organizationId: credential.organizationId,
    eventId: credential.eventId,
    personId: credential.personId,
    tokenHash: credential.tokenHash,
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
    revokedAt: credential.revokedAt,
    consumedAt: credential.consumedAt,
    singleUse: credential.singleUse,
  };
}

function credentialReceipt(
  credential: ScientificExternalCredentialStoredState,
): ScientificExternalCredentialReceipt {
  return Object.freeze({
    id: credential.id,
    actor: credential.actor,
    organizationId: credential.organizationId,
    eventId: credential.eventId,
    personId: credential.personId,
    issuedAt: new Date(credential.issuedAt),
    expiresAt: new Date(credential.expiresAt),
    singleUse: credential.singleUse,
    consumedAt: credential.consumedAt ? new Date(credential.consumedAt) : null,
    revokedAt: credential.revokedAt ? new Date(credential.revokedAt) : null,
  });
}

function sessionReceipt(
  session: ScientificExternalSessionStoredState,
): ScientificExternalSessionReceipt {
  return Object.freeze({
    id: session.id,
    credentialId: session.credentialId,
    actor: session.actor,
    organizationId: session.organizationId,
    eventId: session.eventId,
    personId: session.personId,
    issuedAt: new Date(session.issuedAt),
    expiresAt: new Date(session.expiresAt),
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  });
}

function assertSessionActive(session: ScientificExternalSessionStoredState, now: Date): void {
  assertScientificExternalSessionStoredState(session);
  if (session.revokedAt) {
    throw new ScientificExternalIdentityServiceError('Sessão científica externa revogada.');
  }
  if (session.issuedAt.getTime() > now.getTime()) {
    throw new ScientificExternalIdentityServiceError('Sessão científica externa ainda não é válida.');
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new ScientificExternalIdentityServiceError('Sessão científica externa expirada.');
  }
}

function buildAudit(
  action: ScientificExternalAuditPersistenceInput['action'],
  scope: ScientificExternalIdentityScope,
  occurredAt: Date,
  evidence: { credentialId?: string | null; sessionId?: string | null },
  metadata?: Record<string, unknown>,
): ScientificExternalAuditPersistenceInput {
  const audit: ScientificExternalAuditPersistenceInput = {
    action,
    actor: scope.actor,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    personId: scope.personId,
    credentialId: evidence.credentialId ?? null,
    sessionId: evidence.sessionId ?? null,
    occurredAt,
    metadata: metadata ?? null,
  };
  assertScientificExternalAuditPersistenceInput(audit);
  return audit;
}

export class ScientificExternalIdentityService {
  constructor(private readonly repository: ScientificExternalIdentityRepository) {}

  async issueCredential(
    input: IssueScientificExternalCredentialInput,
    now = new Date(),
  ): Promise<ScientificExternalIssuedCredential> {
    assertValidNow(now);
    assertIssueInput(input, now);

    const token = generateScientificExternalOpaqueToken();
    const credentialInput: ScientificExternalCredentialPersistenceInput = {
      actor: input.actor,
      organizationId: input.organizationId,
      eventId: input.eventId,
      personId: input.personId,
      tokenHash: hashScientificExternalToken(token),
      issuedAt: new Date(now),
      expiresAt: new Date(input.expiresAt),
      singleUse: input.singleUse ?? true,
      createdByUserId: input.createdByUserId,
    };
    assertScientificExternalCredentialPersistenceInput(credentialInput);

    const credential = await this.repository.transaction(async (tx) => {
      await tx.assertPersonEligibleForExternalActor(input);
      const stored = await tx.createCredential(credentialInput);
      assertScientificExternalCredentialStoredState(stored);

      const audit = buildAudit(
        'SCIENTIFIC_EXTERNAL_CREDENTIAL_ISSUED',
        input,
        now,
        { credentialId: stored.id },
        { singleUse: stored.singleUse },
      );
      assertScientificExternalAuditMatchesEvidence(audit, { credential: stored });
      await tx.createAudit(audit);
      return stored;
    });

    return Object.freeze({ credential: credentialReceipt(credential), token });
  }

  async exchangeCredential(
    input: ExchangeScientificExternalCredentialInput,
  ): Promise<ScientificExternalEstablishedSession> {
    const now = input.now ?? new Date();
    assertValidNow(now);
    const tokenHash = hashScientificExternalToken(input.token);

    return this.repository.transaction(async (tx) => {
      const found = await tx.findCredentialByTokenHashForUpdate(tokenHash);
      if (!found) {
        throw new ScientificExternalIdentityServiceError('Credencial científica externa inválida.');
      }
      assertScientificExternalCredentialStoredState(found);
      assertScientificExternalTokenExchangeAllowed(tokenRecordFromCredential(found), input.token, now);

      const scope = buildScientificExternalSessionScope(
        tokenRecordFromCredential(found),
        now,
        input.sessionTtlMs,
      );
      const sessionToken = generateScientificExternalOpaqueToken();
      const sessionInput: ScientificExternalSessionPersistenceInput = {
        credentialId: found.id,
        actor: scope.actor,
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        personId: scope.personId,
        sessionHash: hashScientificExternalToken(sessionToken),
        issuedAt: scope.issuedAt,
        expiresAt: scope.expiresAt,
      };
      assertScientificExternalSessionPersistenceInput(sessionInput);
      assertScientificExternalSessionMatchesCredential(found, sessionInput);

      const credential = found.singleUse
        ? await tx.markCredentialConsumed(found.id, now)
        : found;
      assertScientificExternalCredentialStoredState(credential);

      const session = await tx.createSession(sessionInput);
      assertScientificExternalSessionStoredState(session);
      assertScientificExternalSessionMatchesCredential(credential, session);

      const exchangedAudit = buildAudit(
        'SCIENTIFIC_EXTERNAL_CREDENTIAL_EXCHANGED',
        credential,
        now,
        { credentialId: credential.id, sessionId: session.id },
      );
      assertScientificExternalAuditMatchesEvidence(exchangedAudit, { credential, session });
      await tx.createAudit(exchangedAudit);

      if (found.singleUse) {
        const consumedAudit = buildAudit(
          'SCIENTIFIC_EXTERNAL_CREDENTIAL_CONSUMED',
          credential,
          now,
          { credentialId: credential.id },
        );
        assertScientificExternalAuditMatchesEvidence(consumedAudit, { credential });
        await tx.createAudit(consumedAudit);
      }

      return Object.freeze({
        credential: credentialReceipt(credential),
        session: sessionReceipt(session),
        sessionToken,
      });
    });
  }

  async authenticateSession(
    input: AuthenticateScientificExternalSessionInput,
  ): Promise<ScientificExternalAuthenticatedSession> {
    const now = input.now ?? new Date();
    assertValidNow(now);
    const sessionHash = hashScientificExternalToken(input.sessionToken);
    const session = await this.repository.findSessionByHash(sessionHash);
    if (!session) {
      throw new ScientificExternalIdentityServiceError('Sessão científica externa inválida.');
    }
    assertSessionActive(session, now);

    return Object.freeze({
      actor: session.actor,
      organizationId: session.organizationId,
      eventId: session.eventId,
      personId: session.personId,
      sessionId: session.id,
      credentialId: session.credentialId,
      expiresAt: new Date(session.expiresAt),
    });
  }
}
