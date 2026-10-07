export class PresencePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresencePolicyError';
  }
}

export function eventCalendarDay(timeZone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const read = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = read('year');
    const month = read('month');
    const day = read('day');
    if (!year || !month || !day) throw new Error('dia');
    return `${year}-${month}-${day}`;
  } catch (error) {
    if (error instanceof PresencePolicyError) throw error;
    throw new PresencePolicyError('O fuso horário do evento não permite marcar o dia.');
  }
}

export function presenceDay(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new PresencePolicyError('Dia inválido.');
  return new Date(`${day}T00:00:00.000Z`);
}

export function presenceReversalReason(value: unknown): string {
  if (typeof value !== 'string') throw new PresencePolicyError('Informe o motivo do estorno.');
  const reason = value.trim().replace(/\s+/gu, ' ');
  if (reason.length < 3 || reason.length > 160) {
    throw new PresencePolicyError('O motivo precisa ter entre 3 e 160 caracteres.');
  }
  return reason;
}
