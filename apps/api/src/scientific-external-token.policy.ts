import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ScientificExternalActor } from './scientific-external-access.policy.js';

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = 'evx_scientific_';

export type ScientificExternalTokenRecord = {
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  consumedAt?: Date | null;
  singleUse?: boolean;
};

export type ScientificExternalSessionScope = {
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  issuedAt: Date;
  expiresAt: Date;
};

export class ScientificExternalTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificExternalTokenError';
  }
}

export function generateScientificExternalOpaqueToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

export function hashScientificExternalToken(token: string): string {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    throw new ScientificExternalTokenError('Token científico externo inválido.');
  }

  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function scientificExternalTokenMatches(providedToken: string, expectedHash: string): boolean {
  let actualHash: string;
  try {
    actualHash = hashScientificExternalToken(providedToken);
  } catch {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;

  return timingSafeEqual(
    Buffer.from(actualHash, 'hex'),
    Buffer.from(expectedHash, 'hex'),
  );
}

function assertScientificExternalTokenRecordActive(
  token: ScientificExternalTokenRecord,
  now: Date,
): void {
  if (token.revokedAt) {
    throw new ScientificExternalTokenError('Credencial científica externa revogada.');
  }
  if (token.singleUse && token.consumedAt) {
    throw new ScientificExternalTokenError('Credencial científica externa já consumida.');
  }
  if (token.issuedAt.getTime() > now.getTime()) {
    throw new ScientificExternalTokenError('Credencial científica externa ainda não é válida.');
  }
  if (token.expiresAt.getTime() <= token.issuedAt.getTime()) {
    throw new ScientificExternalTokenError('Janela temporal da credencial científica externa inválida.');
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    throw new ScientificExternalTokenError('Credencial científica externa expirada.');
  }
}

export function assertScientificExternalTokenExchangeAllowed(
  token: ScientificExternalTokenRecord,
  providedToken: string,
  now = new Date(),
): void {
  assertScientificExternalTokenRecordActive(token, now);
  if (!scientificExternalTokenMatches(providedToken, token.tokenHash)) {
    throw new ScientificExternalTokenError('Credencial científica externa inválida.');
  }
}

export function buildScientificExternalSessionScope(
  token: ScientificExternalTokenRecord,
  now = new Date(),
  requestedTtlMs = 30 * 60 * 1000,
): ScientificExternalSessionScope {
  if (!Number.isFinite(requestedTtlMs) || requestedTtlMs <= 0) {
    throw new ScientificExternalTokenError('TTL de sessão inválido.');
  }

  // Defesa em profundidade: construir uma sessão é uma fronteira de autorização.
  // Não depender de o caller ter validado previamente revogação/consumo/tempo.
  assertScientificExternalTokenRecordActive(token, now);

  const expiresAt = new Date(Math.min(
    token.expiresAt.getTime(),
    now.getTime() + requestedTtlMs,
  ));

  return Object.freeze({
    actor: token.actor,
    organizationId: token.organizationId,
    eventId: token.eventId,
    personId: token.personId,
    issuedAt: new Date(now),
    expiresAt,
  });
}

export function scientificExternalTokenSecurityProfile() {
  return {
    opaqueRandomBytes: TOKEN_BYTES,
    persistedSecret: 'SHA256_HASH_ONLY',
    tokenMayBeLogged: false,
    tokenMayBePersistedPlaintext: false,
    exchangeIsDenyByDefault: true,
    singleUseSupported: true,
    revocationSupported: true,
    sessionScopeMayNotEscalate: true,
  } as const;
}
