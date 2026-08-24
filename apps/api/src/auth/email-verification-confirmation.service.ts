import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  EmailVerificationRejectedError,
  EmailVerificationService,
  EmailVerificationUnavailableError,
} from './email-verification.service';

export type EmailVerificationConfirmationOutcome =
  | 'VERIFICATION_COMPLETED'
  | 'VERIFICATION_REJECTED'
  | 'PERSISTENCE_FAILED';

export type EmailVerificationConfirmationStage =
  | 'PERSISTENCE'
  | 'AUDIT';

export interface EmailVerificationConfirmationAudit {
  record(input: Readonly<{
    action: 'email_verification.confirm';
    outcome: EmailVerificationConfirmationOutcome;
  }>): Promise<void>;
}

export interface EmailVerificationConfirmationDiagnostics {
  capture(input: Readonly<{
    operation: 'email_verification.confirm';
    stage: EmailVerificationConfirmationStage;
  }>): Promise<void>;
}

export type EmailVerificationConfirmationDependencies = Readonly<{
  verification: Pick<EmailVerificationService, 'confirm'>;
  audit: EmailVerificationConfirmationAudit;
  diagnostics: EmailVerificationConfirmationDiagnostics;
}>;

export class EmailVerificationConfirmationService {
  constructor(
    private readonly dependencies: EmailVerificationConfirmationDependencies,
  ) {}

  async confirm(token: string): Promise<Readonly<{ verifiedAt: Date }>> {
    try {
      const result = await this.dependencies.verification.confirm(token);
      await this.audit('VERIFICATION_COMPLETED');
      return result;
    } catch (reason) {
      if (reason instanceof EmailVerificationRejectedError) {
        await this.audit('VERIFICATION_REJECTED');
        throw reason;
      }

      await this.capture('PERSISTENCE');
      await this.audit('PERSISTENCE_FAILED');

      if (reason instanceof EmailVerificationUnavailableError) {
        throw reason;
      }
      throw new EmailVerificationUnavailableError();
    }
  }

  private async audit(outcome: EmailVerificationConfirmationOutcome): Promise<void> {
    try {
      await this.dependencies.audit.record({
        action: 'email_verification.confirm',
        outcome,
      });
    } catch {
      await this.capture('AUDIT');
    }
  }

  private async capture(stage: EmailVerificationConfirmationStage): Promise<void> {
    try {
      await this.dependencies.diagnostics.capture({
        operation: 'email_verification.confirm',
        stage,
      });
    } catch {
      // Observabilidade não substitui a resposta pública da confirmação.
    }
  }
}

@Injectable()
export class PrismaEmailVerificationConfirmationAudit
implements EmailVerificationConfirmationAudit {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: Parameters<EmailVerificationConfirmationAudit['record']>[0],
  ): Promise<void> {
    await this.prisma.passwordRecoveryAuditEvent.create({
      data: {
        action: input.action,
        outcome: input.outcome,
      },
      select: { id: true },
    });
  }
}

type OperationalLogger = Readonly<{
  warn(message: Readonly<{ event: string; stage: string }>): void;
}>;

@Injectable()
export class EmailVerificationConfirmationOperationalDiagnostics
implements EmailVerificationConfirmationDiagnostics {
  private readonly logger: OperationalLogger;

  constructor(
    logger: OperationalLogger = new Logger(
      EmailVerificationConfirmationOperationalDiagnostics.name,
    ),
  ) {
    this.logger = logger;
  }

  async capture(
    input: Parameters<EmailVerificationConfirmationDiagnostics['capture']>[0],
  ): Promise<void> {
    this.logger.warn({
      event: 'email_verification.confirm_failed',
      stage: input.stage,
    });
  }
}
