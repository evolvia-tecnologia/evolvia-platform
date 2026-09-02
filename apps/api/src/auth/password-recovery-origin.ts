import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export const PASSWORD_RECOVERY_ORIGIN_MIN_PEPPER_LENGTH = 32;
export const PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_LENGTH = 512;
export const PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_HOPS = 8;

export type PasswordRecoveryOriginInput = Readonly<{
  socketAddress: string;
  forwardedFor?: string;
  trustedProxyAddresses: readonly string[];
  originPepper: string;
}>;

export function createPasswordRecoveryOriginKey(
  input: PasswordRecoveryOriginInput,
): string {
  if (input.originPepper.length < PASSWORD_RECOVERY_ORIGIN_MIN_PEPPER_LENGTH) {
    throw new Error('Pepper de origem deve ter ao menos 32 caracteres.');
  }

  const socketAddress = normalizeIpAddress(input.socketAddress);
  const trustedProxies = new Set(input.trustedProxyAddresses.map(normalizeIpAddress));
  const clientAddress = resolveClientAddress(
    socketAddress,
    trustedProxies,
    input.forwardedFor,
  );

  return createHmac('sha256', input.originPepper)
    .update(clientAddress, 'utf8')
    .digest('hex');
}

function resolveClientAddress(
  socketAddress: string,
  trustedProxies: ReadonlySet<string>,
  forwardedFor?: string,
): string {
  if (!trustedProxies.has(socketAddress) || forwardedFor === undefined) {
    return socketAddress;
  }

  const forwarded = parseForwardedChain(forwardedFor);
  const chain = [...forwarded, socketAddress];
  let cursor = chain.length - 1;

  while (cursor > 0 && trustedProxies.has(chain[cursor]!)) {
    cursor -= 1;
  }

  return chain[cursor]!;
}

function parseForwardedChain(value: string): string[] {
  if (value.length > PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_LENGTH) {
    throw invalidForwardedChain();
  }

  const hops = value.split(',');
  if (hops.length > PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_HOPS) {
    throw invalidForwardedChain();
  }

  return hops.map((hop) => {
    const normalized = tryNormalizeIpAddress(hop);
    if (normalized === null) {
      throw invalidForwardedChain();
    }
    return normalized;
  });
}

function normalizeIpAddress(value: string): string {
  const normalized = tryNormalizeIpAddress(value);
  if (normalized === null) {
    throw new Error('Endereço de origem inválido.');
  }
  return normalized;
}

function tryNormalizeIpAddress(value: string): string | null {
  const candidate = value.trim().replace(/^\[|\]$/gu, '').toLowerCase();
  if (candidate.length === 0) {
    return null;
  }

  if (candidate.startsWith('::ffff:')) {
    const mapped = candidate.slice('::ffff:'.length);
    if (isIP(mapped) === 4) {
      return mapped;
    }
  }

  if (isIP(candidate) === 0) {
    return null;
  }

  return candidate;
}

function invalidForwardedChain(): Error {
  return new Error('Cadeia de origem encaminhada inválida.');
}
