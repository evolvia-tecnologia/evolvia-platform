import { enrollmentBlockReason } from './participant-agenda.policy';

export class ActivityWaitlistPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityWaitlistPolicyError';
  }
}

export const ACTIVITY_FULL_REASON = 'Não há vaga restante nesta atividade.';
export const ACTIVITY_HAS_SEAT_REASON = 'Ainda há vaga nesta atividade. Entre pela agenda.';
export const ACTIVITY_ALREADY_ENROLLED = 'Você já está nesta atividade.';
export const ACTIVITY_ALREADY_SPEAKING = 'Você já participa desta atividade.';
export const ACTIVITY_NOT_WAITING = 'Você não está na fila desta atividade.';
export const ACTIVITY_NOT_IN_QUEUE = 'Esta pessoa não está na fila.';
export const ACTIVITY_WAITLIST_RETRY = 'Não foi possível atualizar a fila. Tente de novo.';

const ID = /^[A-Za-z0-9_-]{8,80}$/u;

export function normalizeActivityWaitlistId(value: string, label: 'atividade' | 'fila'): string {
  const id = value?.trim() ?? '';
  if (!ID.test(id)) {
    throw new ActivityWaitlistPolicyError(label === 'atividade' ? 'Atividade inválida.' : 'Item da fila inválido.');
  }
  return id;
}

export function classifyWaitlistJoin(reason: string | null): 'join' | 'has-seat' | 'blocked' {
  if (reason === null) return 'has-seat';
  if (reason === ACTIVITY_FULL_REASON) return 'join';
  return 'blocked';
}

export function waitlistFullReasonMatchesAgenda(): boolean {
  const reason = enrollmentBlockReason({
    capacity: 1,
    speakers: 0,
    enrolled: 1,
    startAt: new Date('2026-11-01T15:00:00Z'),
    endAt: new Date('2026-11-01T16:00:00Z'),
    blocks: [],
    activityId: 'atividade1',
  });
  return reason === ACTIVITY_FULL_REASON;
}

export function waitlistParticipantName(registrationData: unknown): string {
  if (!registrationData || typeof registrationData !== 'object' || Array.isArray(registrationData)) {
    return 'Inscrição sem nome';
  }
  const record = registrationData as Record<string, unknown>;
  for (const key of ['full_name', 'nome'] as const) {
    const name = readPersonName(record[key]);
    if (name) return name;
  }
  return 'Inscrição sem nome';
}

function readPersonName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/gu, ' ').trim();
  if (!trimmed || trimmed.includes('@') || trimmed.length < 2) return null;
  return [...trimmed].slice(0, 80).join('');
}
