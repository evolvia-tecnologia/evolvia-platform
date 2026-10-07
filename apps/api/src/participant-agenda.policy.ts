import { createHash, timingSafeEqual } from 'node:crypto';

export type AgendaSlot = {
  id: string;
  title: string;
  activityType: string;
  startAt: string;
  endAt: string;
  spaceName: string | null;
};

export type SpeakingSlot = AgendaSlot & { participationType: string; customRoleLabel: string | null };

export type OpenSlot = AgendaSlot & { remaining: number; reason: string | null };

type Block = { id: string; startAt: Date; endAt: Date };

export function emailMatchesHash(email: string | null | undefined, emailHash: string): boolean {
  const normalized = email?.trim().toLowerCase() ?? '';
  if (!normalized || !/^[a-f0-9]{64}$/u.test(emailHash)) return false;
  const hash = createHash('sha256').update(normalized).digest();
  return timingSafeEqual(hash, Buffer.from(emailHash, 'hex'));
}

export function agendaOverlaps(startAt: Date, endAt: Date, blocks: Block[], ignoreId?: string): boolean {
  return blocks.some((block) => block.id !== ignoreId && startAt < block.endAt && block.startAt < endAt);
}

export function remainingSeats(capacity: number, speakers: number, enrolled: number): number {
  return Math.max(0, capacity - speakers - enrolled);
}

export function enrollmentBlockReason(input: {
  capacity: number | null;
  speakers: number;
  enrolled: number;
  startAt: Date;
  endAt: Date;
  blocks: Block[];
  activityId: string;
}): string | null {
  if (input.capacity == null || input.capacity < 1) return 'Esta atividade não tem vagas abertas.';
  if (!(input.startAt < input.endAt)) return 'O horário desta atividade não está válido.';
  if (agendaOverlaps(input.startAt, input.endAt, input.blocks, input.activityId)) {
    return 'Este horário cruza com outra atividade da sua agenda.';
  }
  if (remainingSeats(input.capacity, input.speakers, input.enrolled) < 1) return 'Não há vaga restante nesta atividade.';
  return null;
}

export function classifyAgenda(input: {
  speaking: SpeakingSlot[];
  enrolled: AgendaSlot[];
  catalog: Array<AgendaSlot & { capacity: number | null; speakers: number; enrolledCount: number }>;
}): { speaking: SpeakingSlot[]; enrolled: AgendaSlot[]; open: OpenSlot[] } {
  const mine = new Set([...input.speaking, ...input.enrolled].map((item) => item.id));
  const blocks = [...input.speaking, ...input.enrolled].map((item) => ({
    id: item.id,
    startAt: new Date(item.startAt),
    endAt: new Date(item.endAt),
  }));
  const open = input.catalog.filter((item) => !mine.has(item.id)).map((item) => {
    const reason = enrollmentBlockReason({
      capacity: item.capacity,
      speakers: item.speakers,
      enrolled: item.enrolledCount,
      startAt: new Date(item.startAt),
      endAt: new Date(item.endAt),
      blocks,
      activityId: item.id,
    });
    return {
      id: item.id,
      title: item.title,
      activityType: item.activityType,
      startAt: item.startAt,
      endAt: item.endAt,
      spaceName: item.spaceName,
      remaining: item.capacity == null ? 0 : remainingSeats(item.capacity, item.speakers, item.enrolledCount),
      reason,
    };
  });
  return { speaking: input.speaking, enrolled: input.enrolled, open };
}
