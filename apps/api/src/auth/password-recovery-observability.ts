import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  PasswordRecoveryAudit,
  PasswordRecoveryDiagnostics,
} from './password-recovery-request.service';

type OperationalLogger = Readonly<{
  warn(message: Readonly<{ event: string; stage: string }>): void;
}>;

@Injectable()
export class PrismaPasswordRecoveryAudit implements PasswordRecoveryAudit {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: Parameters<PasswordRecoveryAudit['record']>[0]): Promise<void> {
    await this.prisma.passwordRecoveryAuditEvent.create({
      data: {
        action: input.action,
        outcome: input.outcome,
        subjectUserId: input.subjectUserId ?? null,
      },
      select: { id: true },
    });
  }
}

export class PasswordRecoveryOperationalDiagnostics implements PasswordRecoveryDiagnostics {
  private readonly logger: OperationalLogger;

  constructor(logger: OperationalLogger = new Logger(PasswordRecoveryOperationalDiagnostics.name)) {
    this.logger = logger;
  }

  async capture(
    input: Parameters<PasswordRecoveryDiagnostics['capture']>[0],
  ): Promise<void> {
    this.logger.warn({
      event: 'password_recovery.operation_failed',
      stage: input.stage,
    });
  }
}
