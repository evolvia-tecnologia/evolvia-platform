import { createHash } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { JwtSignOptions, JwtVerifyOptions } from '@nestjs/jwt';

export const JWT_SIGN_OPTIONS: JwtSignOptions = { expiresIn: '7d', algorithm: 'HS256' };
export const JWT_VERIFY_OPTIONS: JwtVerifyOptions = { algorithms: ['HS256'] };

/**
 * Hash bcrypt de um segredo interno. Serve só para o login de e-mail inexistente
 * gastar o mesmo tempo de comparação que uma senha real.
 */
export const LOGIN_TIMING_HASH = '$2b$12$0yZhC8iEdai.CGj7wfDaA.sD.ub3//4YD.L89pzUCb/UoaziKSAUa';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 5_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type AccessShieldRequest = {
  headers?: { 'x-real-ip'?: string | string[] };
  socket?: { remoteAddress?: string };
};

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < 32 || /\s/u.test(secret)) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres e não pode conter espaço.');
  }
  return secret;
}

export function shieldDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function clientAddress(request: AccessShieldRequest): string {
  const remote = request.socket?.remoteAddress ?? '';
  const forwarded = request.headers?.['x-real-ip'];
  const realIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (isTrustedProxy(remote) && realIp && isSingleIp(realIp)) return realIp;
  return remote || 'unknown';
}

export function assertAccessRate(request: AccessShieldRequest, scope: string, limit: number): void {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const key = `${scope}:${shieldDigest(clientAddress(request))}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new HttpException({
      code: 'RATE_LIMITED',
      message: 'Muitas tentativas em seguida. Aguarde alguns minutos e tente de novo.',
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export function resetAccessShieldForTests(): void {
  buckets.clear();
}

function isTrustedProxy(remote: string): boolean {
  if (remote === '::1') return true;
  const ip = remote.startsWith('::ffff:') ? remote.slice('::ffff:'.length) : remote;
  if (ip === '127.0.0.1') return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(ip);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;
  if (first === 10 || (first === 192 && second === 168)) return true;
  return first === 172 && second >= 16 && second <= 31;
}

function isSingleIp(value: string): boolean {
  if (value.length > 45 || /[\s,]/.test(value)) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/u.test(value)) {
    return value.split('.').every((octet) => Number(octet) <= 255);
  }
  return /^[0-9a-f:.]{2,45}$/iu.test(value);
}
