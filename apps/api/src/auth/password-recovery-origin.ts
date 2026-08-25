import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export type PasswordRecoveryOriginInput = Readonly<{
  socketAddress: string;
  forwardedFor?: string;
  trustedProxyAddresses: readonly string[];
  identifierPepper: string;
}>;

function normalizeIpAddress(value: string): string {
  const candidate = value.trim().replace(/^\[|\]$/gu, '');
  const withoutMappedPrefix = candidate.startsWith('::ffff:')
    ? candidate.slice('::ffff:'.length)
    : candidate;

  if (isIP(withoutMappedPrefix) === 0) {
    throw new Error('Endereço de origem inválido.');
  }

  return withoutMappedPrefix.toLowerCase();
}

function parseForwardedFor(value?: string): string[] {
  if (!value) return [];
  return value.split(',').map(normalizeIpAddress);
}

export function createPasswordRecoveryOriginKey(
  input: PasswordRecoveryOriginInput,
): string {
  if (input.identifierPepper.length < 32) {
    throw new Error('PASSWORD_RECOVERY_ORIGIN_PEPPER deve ter ao menos 32 caracteres.');
  }

  const socketAddress = normalizeIpAddress(input.socketAddress);
  const trustedProxies = new Set(input.trustedProxyAddresses.map(normalizeIpAddress));
  const forwarded = parseForwardedFor(input.forwardedFor);

  let clientAddress = socketAddress;
  if (forwarded.length > 0 && trustedProxies.has(socketAddress)) {
    const chain = [...forwarded, socketAddress];
    let cursor = chain.length - 1;

    while (cursor > 0 && trustedProxies.has(chain[cursor])) {
      cursor -= 1;
    }
    clientAddress = chain[cursor];
  }

  return createHmac('sha256', input.identifierPepper)
    .update(clientAddress, 'utf8')
    .digest('hex');
}
