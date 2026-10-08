export const REFUND_WINDOWS = ['NONE', 'DAYS_30', 'DAYS_7', 'DAYS_1', 'ANYTIME'] as const;
export type RefundWindow = (typeof REFUND_WINDOWS)[number];

export const REFUND_WINDOW_LABEL: Record<RefundWindow, string> = {
  NONE: 'Em nenhum momento',
  DAYS_30: 'Até 30 dias antes do início',
  DAYS_7: 'Até 7 dias antes do início',
  DAYS_1: 'Até 1 dia antes do início',
  ANYTIME: 'A qualquer momento',
};

export const REFUND_REQUEST_LABEL = {
  REQUESTED: 'Em análise',
  APPROVED: 'Aprovado, aguardando processamento',
  REJECTED: 'Recusado',
} as const;

export type RefundRequestStatus = keyof typeof REFUND_REQUEST_LABEL;
export type RefundPending = 'POLICY' | 'START_DATE' | 'TIME_ZONE' | 'UNRECORDED';

export class RegistrationRefundPolicyError extends Error {}

export type RefundEligibility = {
  window: RefundWindow | null;
  published: boolean;
  eligible: boolean | null;
  pending: RefundPending | null;
  deadline: string | null;
  message: string;
};

const DAY_WINDOWS: Record<string, number> = { DAYS_30: 30, DAYS_7: 7, DAYS_1: 1 };

export function normalizeRefundWindow(value: unknown): RefundWindow {
  if (typeof value !== 'string' || !(REFUND_WINDOWS as readonly string[]).includes(value)) {
    throw new RegistrationRefundPolicyError('Escolha uma janela de reembolso.');
  }
  return value as RefundWindow;
}

export function normalizeRefundText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new RegistrationRefundPolicyError(`Informe ${label}.`);
  const text = value.trim().replace(/\s+/gu, ' ');
  if (text.length < 10 || text.length > 500) {
    throw new RegistrationRefundPolicyError(`${label} precisa ter entre 10 e 500 caracteres.`);
  }
  return text;
}

export function describeRefundPolicy(input: {
  window: RefundWindow | null;
  startDate: Date | null;
  timeZone: string | null;
  now: Date;
}): RefundEligibility {
  if (!input.window) {
    return {
      window: null,
      published: false,
      eligible: null,
      pending: 'POLICY',
      deadline: null,
      message: 'A organização ainda não publicou a regra de reembolso.',
    };
  }
  if (input.window === 'NONE') {
    return {
      window: input.window,
      published: true,
      eligible: false,
      pending: null,
      deadline: null,
      message: 'Este evento não oferece reembolso em nenhum momento.',
    };
  }
  if (input.window === 'ANYTIME') {
    return {
      window: input.window,
      published: true,
      eligible: true,
      pending: null,
      deadline: null,
      message: 'O reembolso pode ser solicitado a qualquer momento depois do pagamento.',
    };
  }
  const days = DAY_WINDOWS[input.window];
  if (!input.startDate) {
    return {
      window: input.window,
      published: true,
      eligible: null,
      pending: 'START_DATE',
      deadline: null,
      message: 'A data de início do evento ainda não foi definida. A elegibilidade do reembolso não pode ser calculada.',
    };
  }
  if (!validTimeZone(input.timeZone)) {
    return {
      window: input.window,
      published: true,
      eligible: null,
      pending: 'TIME_ZONE',
      deadline: null,
      message: 'O fuso horário do evento ainda não foi definido. A elegibilidade do reembolso não pode ser calculada.',
    };
  }
  const deadline = subtractCalendarDays(input.startDate, days, input.timeZone!);
  const eligible = input.now.getTime() <= deadline.getTime();
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: input.timeZone!,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(deadline);
  return {
    window: input.window,
    published: true,
    eligible,
    pending: null,
    deadline: deadline.toISOString(),
    message: eligible
      ? `O reembolso pode ser solicitado até ${when} (${input.timeZone}), ${days} dia(s) antes do início.`
      : `O prazo de reembolso terminou em ${when} (${input.timeZone}).`,
  };
}

export function describeAcceptedRefund(input: {
  window: RefundWindow;
  deadlineAt: Date | null;
  pendingCode: string | null;
  now: Date;
  timeZone: string | null;
}): RefundEligibility {
  if (input.pendingCode === 'START_DATE' || input.pendingCode === 'TIME_ZONE') {
    return {
      window: input.window,
      published: true,
      eligible: null,
      pending: input.pendingCode,
      deadline: null,
      message: input.pendingCode === 'START_DATE'
        ? 'Na compra, a data de início ainda não estava definida. A elegibilidade desta inscrição não pode ser calculada.'
        : 'Na compra, o fuso horário ainda não estava definido. A elegibilidade desta inscrição não pode ser calculada.',
    };
  }
  if (input.window === 'NONE') {
    return describeRefundPolicy({ window: 'NONE', startDate: null, timeZone: null, now: input.now });
  }
  if (input.window === 'ANYTIME') {
    return describeRefundPolicy({ window: 'ANYTIME', startDate: null, timeZone: null, now: input.now });
  }
  if (!input.deadlineAt) {
    return {
      window: input.window,
      published: true,
      eligible: null,
      pending: 'UNRECORDED',
      deadline: null,
      message: 'A regra aceita nesta compra não tem prazo calculado. A elegibilidade não pode ser inventada.',
    };
  }
  const eligible = input.now.getTime() <= input.deadlineAt.getTime();
  const zone = validTimeZone(input.timeZone) ? input.timeZone! : 'UTC';
  const when = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(input.deadlineAt);
  return {
    window: input.window,
    published: true,
    eligible,
    pending: null,
    deadline: input.deadlineAt.toISOString(),
    message: eligible
      ? `A regra aceita nesta compra permite solicitar reembolso até ${when} (${zone}).`
      : `A regra aceita nesta compra encerrou o prazo em ${when} (${zone}).`,
  };
}

export function subtractCalendarDays(instant: Date, days: number, timeZone: string): Date {
  const parts = zonedParts(instant, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - days, parts.hour, parts.minute, parts.second, parts.millisecond));
  return zonedDateTime(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds(),
    shifted.getUTCMilliseconds(),
    timeZone,
  );
}

export function validTimeZone(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).formatToParts(instant);
  const read = (type: string) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value || Number.isNaN(Number(value))) throw new RegistrationRefundPolicyError('Não foi possível ler a data no fuso do evento.');
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
    millisecond: read('fractionalSecond'),
  };
}

function zonedDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = utcGuess;
  for (let pass = 0; pass < 3; pass += 1) instant = utcGuess - timeZoneOffset(new Date(instant), timeZone);
  const result = new Date(instant);
  if (Number.isNaN(result.getTime())) throw new RegistrationRefundPolicyError('Não foi possível calcular o prazo de reembolso.');
  return result;
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond) - date.getTime();
}
