import { createHash, timingSafeEqual } from 'node:crypto';

export type ParticipantAccessInput = { protocol?: unknown; identityDocument?: unknown };

export class ParticipantAreaPolicyError extends Error {}

const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;
const TOKEN = /^[a-f0-9]{64}$/u;

export function normalizeIdentityDocument(value: unknown): string {
  if (typeof value !== 'string') throw new ParticipantAreaPolicyError('Informe um documento válido.');
  const raw = value.trim();
  // Rejeitar caracteres inesperados antes de normalizar evita aceitar entradas malformadas.
  if (!/^[A-Za-z0-9 .\/-]{5,50}$/u.test(raw)) throw new ParticipantAreaPolicyError('Informe um documento válido.');
  const normalized = raw.replace(/[ .\/-]/gu, '').toUpperCase();
  if (normalized.length < 5 || normalized.length > 40) throw new ParticipantAreaPolicyError('Informe um documento válido.');
  if (/^[0-9]{11}$/u.test(normalized)) {
    if (/^(\d)\1{10}$/u.test(normalized)) throw new ParticipantAreaPolicyError('CPF inválido.');
    for (const size of [9, 10]) {
      const sum = Array.from(normalized.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
      const remainder = (sum * 10) % 11;
      if (Number(normalized[size]) !== (remainder === 10 ? 0 : remainder)) {
        throw new ParticipantAreaPolicyError('CPF inválido.');
      }
    }
  }
  return normalized;
}

export function normalizeParticipantAccess(input: ParticipantAccessInput): { protocol: string; identityDocument: string } {
  const protocol = typeof input?.protocol === 'string' ? input.protocol.trim().toUpperCase() : '';
  const identityDocument = normalizeIdentityDocument(input?.identityDocument);
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
