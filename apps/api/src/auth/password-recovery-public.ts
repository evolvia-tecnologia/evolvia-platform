import { createPasswordRecoveryOriginKey } from './password-recovery-origin';

const MINIMUM_PEPPER_LENGTH = 32;

export type PasswordRecoveryPublicRequest = Readonly<{
  socket?: Readonly<{ remoteAddress?: string }>;
  headers?: Readonly<Record<string, string | string[] | undefined>>;
}>;

export function requirePasswordRecoveryPepper(
  value: string | undefined,
  variableName: string,
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length < MINIMUM_PEPPER_LENGTH) {
    throw new Error(`${variableName} deve ter ao menos 32 caracteres.`);
  }
  return normalized;
}

export function passwordRecoveryTrustedProxyAddresses(
  value: string | undefined,
): readonly string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

export class PasswordRecoveryOriginService {
  private readonly originPepper: string;
  private readonly trustedProxyAddresses: readonly string[];

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.originPepper = requirePasswordRecoveryPepper(
      environment.PASSWORD_RECOVERY_ORIGIN_PEPPER,
      'PASSWORD_RECOVERY_ORIGIN_PEPPER',
    );
    this.trustedProxyAddresses = passwordRecoveryTrustedProxyAddresses(
      environment.EVOLVIA_TRUSTED_PROXY_ADDRESSES,
    );
  }

  createKey(request: PasswordRecoveryPublicRequest): string {
    const forwardedHeader = request.headers?.['x-forwarded-for'];
    const forwardedFor = typeof forwardedHeader === 'string'
      ? forwardedHeader
      : undefined;

    return createPasswordRecoveryOriginKey({
      socketAddress: request.socket?.remoteAddress ?? '',
      forwardedFor,
      trustedProxyAddresses: this.trustedProxyAddresses,
      identifierPepper: this.originPepper,
    });
  }
}
