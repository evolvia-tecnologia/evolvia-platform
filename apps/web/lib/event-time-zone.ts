export const LEGACY_EVENT_TIME_ZONE = 'UTC';
export const DISCOVERY_CALENDAR_TIME_ZONE = 'America/Sao_Paulo';

function formatterWithFallback(
  locale: string,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: timeZone || LEGACY_EVENT_TIME_ZONE,
    });
  } catch {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: LEGACY_EVENT_TIME_ZONE,
    });
  }
}

export function formatEventDate(
  value: string | null,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long' },
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatterWithFallback('pt-BR', timeZone, options).format(date);
}

export function formatPublicEventWhen(value: string | null, timeZone: string | null): string | null {
  if (!value) return null;
  const weekday = formatEventDate(value, timeZone, { weekday: 'long' });
  const dayMonth = formatEventDate(value, timeZone, { day: 'numeric', month: 'short' });
  const time = formatEventDate(value, timeZone, { hour: '2-digit', minute: '2-digit' });
  if (!weekday || !dayMonth || !time) return null;
  return `${weekday}, ${dayMonth} às ${time}`;
}

export function formatPublicEventSchedule(
  startDate: string | null,
  endDate: string | null,
  timeZone: string | null,
): string | null {
  const startDay = startDate ? formatCalendarDateKey(startDate, timeZone) : null;
  const endDay = endDate ? formatCalendarDateKey(endDate, timeZone) : null;
  if (startDay && endDay && startDay !== endDay) {
    const start = formatEventDate(startDate, timeZone, { dateStyle: 'medium' });
    const end = formatEventDate(endDate, timeZone, { dateStyle: 'medium' });
    return start && end ? `${start} a ${end}` : start;
  }
  return formatPublicEventWhen(startDate, timeZone);
}

export function formatCalendarDateKey(
  value: Date | string,
  timeZone: string | null,
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = formatterWithFallback('en-CA', timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value ?? '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

const CALENDAR_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Converte a data civil escolhida no Wizard em um instante canônico.
 *
 * O meio-dia UTC preserva o dia em todos os fusos atualmente habilitados pelo
 * produto e, principalmente, elimina a dependência do fuso do navegador.
 * A política de timezone do evento continua responsável apenas pela apresentação.
 */
export function canonicalEventDateInstant(value: string): string | null {
  const normalized = value.trim();
  if (!CALENDAR_DATE_KEY.test(normalized)) return null;

  const instant = new Date(`${normalized}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== normalized) {
    return null;
  }
  return instant.toISOString();
}

export function localDateTimeInputValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

