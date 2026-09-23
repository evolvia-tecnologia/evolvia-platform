import { createHash, timingSafeEqual } from 'node:crypto';

export type ParticipantAccessInput = { protocol?: unknown; identityDocument?: unknown };

export class ParticipantAreaPolicyError extends Error {}

const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;
const TOKEN = /^[a-f0-9]{64}$/u;

export function normalizeParticipantAccess(input: ParticipantAccessInput): { protocol: string; identityDocument: string } {
  const protocol = typeof input?.protocol === 'string' ? input.protocol.trim().toUpperCase() : '';
  const identityDocument = typeof input?.identityDocument === 'string'
    ? input.identityDocument.replace(/[^A-Za-z0-9]/gu, '').toUpperCase()
    : '';
  if (!PROTOCOL.test(protocol) || identityDocument.length < 5 || identityDocument.length > 40) {
    throw new ParticipantAreaPolicyError('Não foi possível validar os dados de acesso.');
  }
  return { protocol, identityDocument };
}

export function normalizeParticipantToken(authorization: string | undefined): string {
  const match = /^Bearer ([a-f0-9]{64})$/u.exec(authorization?.trim() ?? '');
  if (!match || !TOKEN.test(match[1])) throw new ParticipantAreaPolicyError('Sessão inválida ou expirada.');
  return match[1];
}

export function participantHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function secureHashMatches(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
