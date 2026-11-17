import {
  generateEmailVerificationToken,
  getEmailVerificationExpiration,
  hashEmailVerificationToken,
  isEmailVerificationTokenFormatValid,
} from './email-verification';
import {
  EmailVerificationRateLimitExceededError,
  EmailVerificationStoreRejection,
  type EmailVerificationStore,
} from './email-verification-prisma.store';

export {
  EmailVerificationRateLimitExceededError,
  EmailVerificationStoreRejection,
} from './email-verification-prisma.store';
export type { EmailVerificationStore } from './email-verification-prisma.store';

export const EMAIL_VERIFICATION_REJECTED_MESSAGE =
  'O link de confirmação é inválido, expirou ou já foi utilizado.';
export const EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE =
  'Não foi possível confirmar o e-mail agora. Tente novamente mais tarde.';

export class EmailVerificationRejectedError extends Error {
  constructor() {
    super(EMAIL_VERIFICATION_REJECTED_MESSAGE);
    this.name = 'EmailVerificationRejectedError';
  }
}

export class EmailVerificationUnavailableError extends Error {
  constructor() {
    super(EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE);
    this.name = 'EmailVerificationUnavailableError';
  }
}

export interface EmailVerificationDelivery {
  send(input: Readonly<{
    recipient: string;
    token: string;
    expiresAt: Date;
  }>): Promise<void>;
}

export type EmailVerificationServiceDependencies = Readonly<{
  store: EmailVerificationStore;
  now?: () => Date;
  generateToken?: () => string;
}>;

export class EmailVerificationService {
  private readonly store: EmailVerificationStore;
  private readonly now: () => Date;
  private readonly generateToken: () => string;

  constructor(dependencies: EmailVerificationServiceDependencies) {
    this.store = dependencies.store;
    this.now = dependencies.now ?? (() => new Date());
    this.generateToken = dependencies.generateToken ?? generateEmailVerificationToken;
  }

  async issue(userId: string): Promise<Readonly<{
    tokenId: string;
    recipient: string;
    token: string;
    expiresAt: Date;
  }>> {
    const now = this.now();
    const token = this.generateToken();
    const expiresAt = getEmailVerificationExpiration(now);

    const issued = await this.store.replaceActiveToken({
      userId,
      tokenHash: hashEmailVerificationToken(token),
      expiresAt,
      now,
    });

    return { tokenId: issued.id, recipient: issued.recipient, token, expiresAt };
  }

  async revokeIssuedToken(tokenId: string): Promise<void> {
    await this.store.revokeToken({ tokenId, now: this.now() });
  }

  async confirm(token: string): Promise<Readonly<{ verifiedAt: Date }>> {
    if (!isEmailVerificationTokenFormatValid(token)) {
      throw new EmailVerificationRejectedError();
    }

    try {
      return await this.store.confirmToken({
        tokenHash: hashEmailVerificationToken(token),
        now: this.now(),
      });
    } catch (reason) {
      if (reason instanceof EmailVerificationRateLimitExceededError) {
        throw reason;
      }
      if (reason instanceof EmailVerificationStoreRejection) {
        throw new EmailVerificationRejectedError();
      }
      throw new EmailVerificationUnavailableError();
    }
  }
}
