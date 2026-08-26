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
