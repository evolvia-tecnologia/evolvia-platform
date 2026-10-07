export const KIT_EXPORT_ROW_LIMIT = 5000;
export const KIT_REPORT_DEFAULT_PAGE_SIZE = 25;
export const KIT_REPORT_MAX_PAGE_SIZE = 50;

export const KIT_SITUATIONS = ['ENTREGUE', 'PENDENTE', 'ESTORNADO'] as const;
export type KitSituation = (typeof KIT_SITUATIONS)[number];

export const KIT_SITUATION_LABEL: Record<KitSituation, string> = {
  ENTREGUE: 'Entregue',
  PENDENTE: 'Pendente',
  ESTORNADO: 'Estornado',
};

const QUERY_KEYS = new Set(['situation', 'sizeId', 'from', 'to', 'page', 'pageSize']);
const SIZE_ID = /^[a-z0-9]{10,40}$/u;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const FORMULA = /^[=+\-@\t\r]/u;

export class KitReportPolicyError extends Error {}

export type KitReportFilters = {
  situation?: KitSituation;
  sizeId?: string;
  from?: Date;
  toExclusive?: Date;
  page: number;
  pageSize: number;
};

export type KitReportItem = {
  protocol: string;
  name: string;
  requestedSizeLabel: string;
  deliveredSizeLabel: string;
  situation: KitSituation;
  at: string | null;
};

export function normalizeKitReportQuery(
  input: unknown,
  timeZone: string | null,
  options: { export?: boolean } = {},
): KitReportFilters {
  if (input == null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new KitReportPolicyError('Filtro inválido.');
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!QUERY_KEYS.has(key)) throw new KitReportPolicyError('Filtro inválido.');
  }
  const situationText = optionalText(raw.situation);
  const situation = situationText ? parseSituation(situationText) : undefined;
  const sizeText = optionalText(raw.sizeId);
  if (sizeText && !SIZE_ID.test(sizeText)) throw new KitReportPolicyError('Escolha um tamanho de camisa deste evento.');
  const fromDay = optionalText(raw.from);
  const toDay = optionalText(raw.to);
  const from = fromDay ? calendarDayStart(fromDay, timeZone) : undefined;
  const toExclusive = toDay ? nextCalendarDay(toDay, timeZone) : undefined;
  if (from && toExclusive && from.getTime() >= toExclusive.getTime()) throw new KitReportPolicyError('Período inválido.');
  if (options.export) {
    return { situation, sizeId: sizeText, from, toExclusive, page: 1, pageSize: KIT_EXPORT_ROW_LIMIT };
  }
  return {
    situation,
    sizeId: sizeText,
    from,
    toExclusive,
    page: positiveInteger(raw.page, 1, 100_000, 'Página'),
    pageSize: positiveInteger(raw.pageSize, KIT_REPORT_DEFAULT_PAGE_SIZE, KIT_REPORT_MAX_PAGE_SIZE, 'Quantidade da página'),
  };
}

export function kitExportLimitMessage(total: number): string {
  return `O relatório filtrado tem ${total} linhas. A exportação aceita até ${KIT_EXPORT_ROW_LIMIT}. Refine a situação, o tamanho ou o período.`;
}

export function displaySize(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text || 'Não informado';
}

export function kitReportItem(input: {
  protocol: string;
  name: string;
  requestedSizeLabel: string | null;
  deliveredSizeLabel: string | null;
  situation: KitSituation;
  at: Date | null;
}): KitReportItem {
  return {
    protocol: input.protocol,
    name: input.name,
    requestedSizeLabel: displaySize(input.requestedSizeLabel),
    deliveredSizeLabel: displaySize(input.deliveredSizeLabel),
    situation: input.situation,
    at: input.at ? input.at.toISOString() : null,
  };
}

export function kitCsv(items: readonly KitReportItem[]): string {
  const header = ['Protocolo', 'Nome', 'Tamanho solicitado', 'Tamanho entregue', 'Situação', 'Data/hora'];
  const lines = [
    header,
    ...items.map((item) => [
      item.protocol,
      item.name,
      item.requestedSizeLabel,
      item.deliveredSizeLabel,
      KIT_SITUATION_LABEL[item.situation],
      item.at ?? '',
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function calendarDayStart(day: string, timeZone: string | null): Date {
  const parts = dayParts(day);
  if (!timeZone) return new Date(Date.UTC(parts.year, parts.month - 1, parts.date));
  return zonedMidnight(parts.year, parts.month, parts.date, timeZone);
}

function nextCalendarDay(day: string, timeZone: string | null): Date {
  const parts = dayParts(day);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.date + 1));
  const nextDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return calendarDayStart(nextDay, timeZone);
}

function dayParts(day: string) {
  const match = DAY.exec(day);
  if (!match) throw new KitReportPolicyError('Período inválido.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) {
    throw new KitReportPolicyError('Período inválido.');
  }
  return { year, month, date };
}

function zonedMidnight(year: number, month: number, date: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, date);
  let instant = utcGuess;
  for (let pass = 0; pass < 3; pass += 1) instant = utcGuess - timeZoneOffset(new Date(instant), timeZone);
  const result = new Date(instant);
  if (Number.isNaN(result.getTime())) throw new KitReportPolicyError('Período inválido.');
  return result;
}

function timeZoneOffset(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const read = (type: string) => {
      const value = parts.find((part) => part.type === type)?.value;
      if (!value || Number.isNaN(Number(value))) throw new KitReportPolicyError('Período inválido.');
      return Number(value);
    };
    return Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second')) - date.getTime();
  } catch (error) {
    if (error instanceof KitReportPolicyError) throw error;
    throw new KitReportPolicyError('Período inválido.');
  }
}

function parseSituation(value: string): KitSituation {
  if ((KIT_SITUATIONS as readonly string[]).includes(value)) return value as KitSituation;
  throw new KitReportPolicyError('Situação inválida.');
}

function optionalText(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') throw new KitReportPolicyError('Filtro inválido.');
  const text = value.trim();
  return text || undefined;
}

function positiveInteger(value: unknown, fallback: number, max: number, label: string): number {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/u.test(value)) throw new KitReportPolicyError(`${label} inválida.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new KitReportPolicyError(`${label} inválida.`);
  return parsed;
}

function csvCell(value: string): string {
  const neutralized = FORMULA.test(value) ? `'${value}` : value;
  return `"${neutralized.replaceAll('"', '""')}"`;
}
