import { createHmac } from 'node:crypto';
import {
  PASSWORD_RECOVERY_PUBLIC_MESSAGE,
  generatePasswordResetToken,
  getPasswordResetExpiration,
  hashPasswordResetToken,
  normalizePasswordRecoveryEmail,
} from './password-recovery';
import type {
  PasswordRecoveryIdentity,
  PasswordRecoveryRequestStore,
} from './password-recovery-prisma.store';
import type { PasswordRecoveryRateLimiter } from './password-recovery-rate-limiter';

export type {
  PasswordRecoveryIdentity,
  PasswordRecoveryRequestStore,
} from './password-recovery-prisma.store';
export type { PasswordRecoveryRateLimiter } from './password-recovery-rate-limiter';

export type PasswordRecoveryRequestInput = Readonly<{
  email: string;
  originKey: string;
}>;

export type PasswordRecoveryPublicResponse = Readonly<{ message: string }>;

export type PasswordRecoveryOperation =
  | 'password_recovery.request'
  | 'password_recovery.reset';

export type PasswordRecoveryAuditOutcome =
  | 'IGNORED'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'PERSISTENCE_FAILED'
  | 'RESET_COMPLETED'
  | 'RESET_REJECTED';

export type PasswordRecoveryOperationalStage =
  | 'LOOKUP'
  | 'PERSISTENCE'
  | 'DELIVERY'
  | 'REVOCATION'
  | 'PASSWORD_HASH'
  | 'AUDIT';

export interface PasswordRecoveryDelivery {
  send(input: Readonly<{
    recipient: string;
    token: string;
    expiresAt: Date;
  }>): Promise<void>;
}

export interface PasswordRecoveryAudit {
  record(input: Readonly<{
    action: PasswordRecoveryOperation;
    outcome: PasswordRecoveryAuditOutcome;
    subjectUserId?: string;
  }>): Promise<void>;
}

export interface PasswordRecoveryDiagnostics {
  capture(input: Readonly<{
    operation: PasswordRecoveryOperation;
    stage: PasswordRecoveryOperationalStage;
  }>): Promise<void>;
}

export type PasswordRecoveryRequestDependencies = Readonly<{
  store: PasswordRecoveryRequestStore;
  rateLimiter: PasswordRecoveryRateLimiter;
  delivery: PasswordRecoveryDelivery;
  audit: PasswordRecoveryAudit;
  diagnostics: PasswordRecoveryDiagnostics;
  identifierPepper: string;
  minimumResponseDurationMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}>;

export const PASSWORD_RECOVERY_MINIMUM_RESPONSE_DURATION_MS = 500;

const PUBLIC_RESPONSE: PasswordRecoveryPublicResponse = Object.freeze({
  message: PASSWORD_RECOVERY_PUBLIC_MESSAGE,
});

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function hashPasswordRecoveryIdentifier(email: string, pepper: string): string {
  if (pepper.length < 32) {
    throw new Error('PASSWORD_RECOVERY_IDENTIFIER_PEPPER deve ter ao menos 32 caracteres.');
  }

  return createHmac('sha256', pepper)
    .update(normalizePasswordRecoveryEmail(email), 'utf8')
    .digest('hex');
}

export class PasswordRecoveryRequestService {
  private readonly dependencies: PasswordRecoveryRequestDependencies;
  private readonly minimumResponseDurationMs: number;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(dependencies: PasswordRecoveryRequestDependencies) {
    if (dependencies.identifierPepper.length < 32) {
      throw new Error('PASSWORD_RECOVERY_IDENTIFIER_PEPPER deve ter ao menos 32 caracteres.');
    }

    this.dependencies = dependencies;
    this.minimumResponseDurationMs =
      dependencies.minimumResponseDurationMs
      ?? PASSWORD_RECOVERY_MINIMUM_RESPONSE_DURATION_MS;
    if (
      !Number.isInteger(this.minimumResponseDurationMs)
      || this.minimumResponseDurationMs < 0
    ) {
      throw new Error('A duração mínima da resposta deve ser um inteiro não negativo.');
    }
    this.now = dependencies.now ?? Date.now;
    this.wait = dependencies.wait ?? wait;
  }

  async request(input: PasswordRecoveryRequestInput): Promise<PasswordRecoveryPublicResponse> {
    const email = normalizePasswordRecoveryEmail(input.email);
    const identityKey = hashPasswordRecoveryIdentifier(
      email,
      this.dependencies.identifierPepper,
    );

    await this.dependencies.rateLimiter.assertAllowed({
      originKey: input.originKey,
      identityKey,
    });

    const startedAt = this.now();
    try {
      return await this.processEligibleRequest(email);
    } finally {
      await this.preserveMinimumResponseDuration(startedAt);
    }
  }

  private async processEligibleRequest(
    email: string,
  ): Promise<PasswordRecoveryPublicResponse> {
    let identity: PasswordRecoveryIdentity | null;
    try {
      identity = await this.dependencies.store.findEligibleIdentityByEmail(email);
    } catch {
      await this.capture('LOOKUP');
      return PUBLIC_RESPONSE;
    }

    if (!identity) {
      await this.recordAudit({ outcome: 'IGNORED' });
      return PUBLIC_RESPONSE;
    }

    const token = generatePasswordResetToken();
    const expiresAt = getPasswordResetExpiration();
    let persistedToken: Readonly<{ id: string }>;

    try {
      persistedToken = await this.dependencies.store.replaceActiveToken({
        identityId: identity.id,
        tokenHash: hashPasswordResetToken(token),
        expiresAt,
      });
    } catch {
      await this.capture('PERSISTENCE');
      await this.recordAudit({
        outcome: 'PERSISTENCE_FAILED',
        subjectUserId: identity.id,
      });
      return PUBLIC_RESPONSE;
    }

    try {
      await this.dependencies.delivery.send({
        recipient: identity.verifiedEmail,
        token,
        expiresAt,
      });
    } catch {
      await this.capture('DELIVERY');
      try {
        await this.dependencies.store.revokeToken(persistedToken.id);
      } catch {
        await this.capture('REVOCATION');
      }
      await this.recordAudit({
        outcome: 'DELIVERY_FAILED',
        subjectUserId: identity.id,
      });
      return PUBLIC_RESPONSE;
    }

    await this.recordAudit({
      outcome: 'DELIVERED',
      subjectUserId: identity.id,
    });
    return PUBLIC_RESPONSE;
  }

  private async preserveMinimumResponseDuration(startedAt: number): Promise<void> {
    const remaining = this.minimumResponseDurationMs - (this.now() - startedAt);
    if (remaining <= 0) return;

    try {
      await this.wait(remaining);
    } catch {
      // O amortecimento temporal nunca altera a resposta pública.
    }
  }

  private async recordAudit(input: Readonly<{
    outcome: PasswordRecoveryAuditOutcome;
    subjectUserId?: string;
  }>): Promise<void> {
    try {
      await this.dependencies.audit.record({
        action: 'password_recovery.request',
        ...input,
      });
    } catch {
      await this.capture('AUDIT');
    }
  }

  private async capture(stage: PasswordRecoveryOperationalStage): Promise<void> {
    try {
      await this.dependencies.diagnostics.capture({
        operation: 'password_recovery.request',
        stage,
      });
    } catch {
      // Diagnóstico nunca altera a resposta pública nem expõe existência de conta.
    }
  }
}
