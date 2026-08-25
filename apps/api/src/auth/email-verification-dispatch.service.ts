import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  EmailVerificationDelivery,
  EmailVerificationRateLimitExceededError,
  EmailVerificationService,
} from './email-verification.service';

export const EMAIL_VERIFICATION_DISPATCH_UNAVAILABLE_MESSAGE =
  'Não foi possível enviar o link de confirmação agora. Tente novamente mais tarde.';

export type EmailVerificationDispatchOutcome =
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'PERSISTENCE_FAILED'
  | 'RATE_LIMITED';

export type EmailVerificationDispatchStage =
  | 'PERSISTENCE'
  | 'DELIVERY'
  | 'REVOCATION'
  | 'AUDIT';

export interface EmailVerificationDispatchAudit {
  record(input: Readonly<{
    action: 'email_verification.request';
    outcome: EmailVerificationDispatchOutcome;
    subjectUserId: string;
  }>): Promise<void>;
}

export interface EmailVerificationDispatchDiagnostics {
  capture(input: Readonly<{
    operation: 'email_verification.request';
    stage: EmailVerificationDispatchStage;
  }>): Promise<void>;
}

export class EmailVerificationDispatchUnavailableError extends Error {
  constructor() {
    super(EMAIL_VERIFICATION_DISPATCH_UNAVAILABLE_MESSAGE);
    this.name = 'EmailVerificationDispatchUnavailableError';
  }
}

export class EmailVerificationDispatchRateLimitedError
extends EmailVerificationDispatchUnavailableError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super();
    this.name = 'EmailVerificationDispatchRateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

export type EmailVerificationDispatchDependencies = Readonly<{
  verification: EmailVerificationService;
  delivery: EmailVerificationDelivery;
  audit: EmailVerificationDispatchAudit;
  diagnostics: EmailVerificationDispatchDiagnostics;
}>;

export class EmailVerificationDispatchService {
  constructor(private readonly dependencies: EmailVerificationDispatchDependencies) {}

  async send(userId: string): Promise<void> {
    let issued: Awaited<ReturnType<EmailVerificationService['issue']>>;
    try {
      issued = await this.dependencies.verification.issue(userId);
    } catch (reason) {
      if (reason instanceof EmailVerificationRateLimitExceededError) {
        await this.audit('RATE_LIMITED', userId);
        throw new EmailVerificationDispatchRateLimitedError(reason.retryAfterMs);
      }
      await this.capture('PERSISTENCE');
      await this.audit('PERSISTENCE_FAILED', userId);
      throw new EmailVerificationDispatchUnavailableError();
    }

    try {
      await this.dependencies.delivery.send({
        recipient: issued.recipient,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch {
      await this.capture('DELIVERY');
      try {
        await this.dependencies.verification.revokeIssuedToken(issued.tokenId);
      } catch {
        await this.capture('REVOCATION');
      }
      await this.audit('DELIVERY_FAILED', userId);
      throw new EmailVerificationDispatchUnavailableError();
    }

    await this.audit('DELIVERED', userId);
  }

  private async audit(outcome: EmailVerificationDispatchOutcome, subjectUserId: string): Promise<void> {
    try {
      await this.dependencies.audit.record({
        action: 'email_verification.request',
        outcome,
        subjectUserId,
      });
    } catch {
      await this.capture('AUDIT');
    }
  }

  private async capture(stage: EmailVerificationDispatchStage): Promise<void> {
    try {
      await this.dependencies.diagnostics.capture({
        operation: 'email_verification.request',
        stage,
      });
    } catch {
      // Observabilidade nunca deve alterar o resultado público do fluxo.
    }
  }
}

@Injectable()
export class PrismaEmailVerificationDispatchAudit
implements EmailVerificationDispatchAudit {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: Parameters<EmailVerificationDispatchAudit['record']>[0]): Promise<void> {
    await this.prisma.passwordRecoveryAuditEvent.create({
      data: {
        action: input.action,
        outcome: input.outcome,
        subjectUserId: input.subjectUserId,
      },
      select: { id: true },
    });
  }
}

type OperationalLogger = Readonly<{
  warn(message: Readonly<{ event: string; stage: string }>): void;
}>;

export class EmailVerificationOperationalDiagnostics
implements EmailVerificationDispatchDiagnostics {
  private readonly logger: OperationalLogger;

  constructor(logger: OperationalLogger = new Logger(EmailVerificationOperationalDiagnostics.name)) {
    this.logger = logger;
  }

  async capture(input: Parameters<EmailVerificationDispatchDiagnostics['capture']>[0]): Promise<void> {
    this.logger.warn({
      event: 'email_verification.operation_failed',
      stage: input.stage,
    });
  }
}
