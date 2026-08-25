import * as bcrypt from 'bcryptjs';
import { PASSWORD_POLICY_MESSAGE, isPasswordStrong } from '../password-policy';
import {
  hashPasswordResetToken,
  isPasswordResetTokenFormatValid,
} from './password-recovery';
import {
  PasswordRecoveryAudit,
  PasswordRecoveryDiagnostics,
} from './password-recovery-request.service';

export const PASSWORD_RESET_REJECTED_MESSAGE =
  'O link de redefinição é inválido, expirou ou já foi utilizado.';
export const PASSWORD_RESET_UNAVAILABLE_MESSAGE =
  'Não foi possível redefinir a senha agora. Tente novamente mais tarde.';

export class PasswordResetPasswordPolicyError extends Error {
  constructor() {
    super(PASSWORD_POLICY_MESSAGE);
    this.name = 'PasswordResetPasswordPolicyError';
  }
}

export class PasswordResetRejectedError extends Error {
  constructor() {
    super(PASSWORD_RESET_REJECTED_MESSAGE);
    this.name = 'PasswordResetRejectedError';
  }
}

export class PasswordResetUnavailableError extends Error {
  constructor() {
    super(PASSWORD_RESET_UNAVAILABLE_MESSAGE);
    this.name = 'PasswordResetUnavailableError';
  }
}

export class PasswordResetStoreRejection extends Error {
  constructor() {
    super('Token de redefinição não pode ser consumido.');
    this.name = 'PasswordResetStoreRejection';
  }
}

export interface PasswordResetStore {
  resetPassword(input: Readonly<{
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }>): Promise<void>;
}

export type PasswordResetDependencies = Readonly<{
  store: PasswordResetStore;
  audit: PasswordRecoveryAudit;
  diagnostics: PasswordRecoveryDiagnostics;
  hashPassword?: (password: string) => Promise<string>;
  now?: () => Date;
}>;

export class PasswordResetService {
  private readonly store: PasswordResetStore;
  private readonly audit: PasswordRecoveryAudit;
  private readonly diagnostics: PasswordRecoveryDiagnostics;
  private readonly hashPassword: (password: string) => Promise<string>;
  private readonly now: () => Date;

  constructor(dependencies: PasswordResetDependencies) {
    this.store = dependencies.store;
    this.audit = dependencies.audit;
    this.diagnostics = dependencies.diagnostics;
    this.hashPassword = dependencies.hashPassword ?? ((password) => bcrypt.hash(password, 12));
    this.now = dependencies.now ?? (() => new Date());
  }

  async reset(input: Readonly<{ token: string; newPassword: string }>): Promise<void> {
    if (!isPasswordStrong(input.newPassword)) {
      throw new PasswordResetPasswordPolicyError();
    }

    if (!isPasswordResetTokenFormatValid(input.token)) {
      await this.recordRejection();
      throw new PasswordResetRejectedError();
    }

    let passwordHash: string;
    try {
      passwordHash = await this.hashPassword(input.newPassword);
    } catch {
      await this.capture('PASSWORD_HASH');
      throw new PasswordResetUnavailableError();
    }

    try {
      await this.store.resetPassword({
        tokenHash: hashPasswordResetToken(input.token),
        passwordHash,
        now: this.now(),
      });
    } catch (reason) {
      if (reason instanceof PasswordResetStoreRejection) {
        await this.recordRejection();
        throw new PasswordResetRejectedError();
      }

      await this.capture('PERSISTENCE');
      throw new PasswordResetUnavailableError();
    }
  }

  private async recordRejection(): Promise<void> {
    try {
      await this.audit.record({
        action: 'password_recovery.reset',
        outcome: 'RESET_REJECTED',
      });
    } catch {
      await this.capture('AUDIT');
    }
  }

  private async capture(
    stage: 'PASSWORD_HASH' | 'PERSISTENCE' | 'AUDIT',
  ): Promise<void> {
    try {
      await this.diagnostics.capture({
        operation: 'password_recovery.reset',
        stage,
      });
    } catch {
      // Diagnóstico nunca substitui a resposta pública nem recebe token ou senha.
    }
  }
}
