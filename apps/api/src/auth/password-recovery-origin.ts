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
  const unbracketed = unwrapCompleteBrackets(value);
  if (unbracketed === null) {
    return null;
  }

  const candidate = unbracketed.trim().toLowerCase();
  if (candidate.length === 0) {
    return null;
  }

  if (isIP(candidate) === 4) {
    return candidate;
  }

  const zoneSeparator = candidate.indexOf('%');
  const withoutZone = zoneSeparator === -1
    ? candidate
    : candidate.slice(0, zoneSeparator).trim();
  if (withoutZone.length === 0 || isIP(withoutZone) === 4) {
    return null;
  }

  const hextets = parseIPv6Hextets(withoutZone);
  if (hextets === null) {
    return null;
  }

  if (isIPv4MappedAddress(hextets)) {
    return formatIPv4FromHextets(hextets[6]!, hextets[7]!);
  }

  return formatCanonicalIPv6(hextets);
}

function unwrapCompleteBrackets(value: string): string | null {
  const trimmed = value.trim();
  const starts = trimmed.startsWith('[');
  const ends = trimmed.endsWith(']');

  if (starts !== ends) {
    return null;
  }

  if (starts && ends) {
    const inner = trimmed.slice(1, -1);
    if (inner.includes('[') || inner.includes(']')) {
      return null;
    }
    return inner;
  }

  if (trimmed.includes('[') || trimmed.includes(']')) {
    return null;
  }

  return trimmed;
}

function parseIPv6Hextets(input: string): number[] | null {
  const withHexTail = replaceDottedIPv4Tail(input);
  if (withHexTail === null) {
    return null;
  }

  if ((withHexTail.match(/::/gu) ?? []).length > 1) {
    return null;
  }

  const segments = withHexTail.split('::');
  if (segments.length === 1) {
    const groups = parseHextetGroup(segments[0]!);
    return groups?.length === 8 ? groups : null;
  }

  const left = parseHextetGroup(segments[0]!);
  const right = parseHextetGroup(segments[1]!);
  if (left === null || right === null) {
    return null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 1) {
    return null;
  }

  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function replaceDottedIPv4Tail(input: string): string | null {
  const separator = input.lastIndexOf(':');
  if (separator === -1) {
    return input.includes('.') ? null : input;
  }

  const tail = input.slice(separator + 1);
  if (!tail.includes('.')) {
    return input.includes('.') ? null : input;
  }

  if (isIP(tail) !== 4) {
    return null;
  }

  const octets = tail.split('.').map((part) => Number.parseInt(part, 10));
  const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
  const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
  return `${input.slice(0, separator + 1)}${hi}:${lo}`;
}

function parseHextetGroup(value: string): number[] | null {
  if (value.length === 0) {
    return [];
  }

  const groups = value.split(':');
  const hextets: number[] = [];

  for (const group of groups) {
    if (group.length === 0 || group.length > 4 || !/^[0-9a-f]+$/u.test(group)) {
      return null;
    }

    const parsed = Number.parseInt(group, 16);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
      return null;
    }

    hextets.push(parsed);
  }

  return hextets;
}

function isIPv4MappedAddress(hextets: readonly number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  );
}

function formatIPv4FromHextets(high: number, low: number): string {
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function formatCanonicalIPv6(hextets: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let index = 0;

  while (index < hextets.length) {
    if (hextets[index] !== 0) {
      index += 1;
      continue;
    }

    let end = index;
    while (end < hextets.length && hextets[end] === 0) {
      end += 1;
    }

    const length = end - index;
    if (length > bestLength) {
      bestStart = index;
      bestLength = length;
    }

    index = end;
  }

  const hex = hextets.map((value) => value.toString(16));
  if (bestLength < 2) {
    return hex.join(':');
  }

  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

function invalidForwardedChain(): Error {
  return new Error('Cadeia de origem encaminhada inválida.');
}
