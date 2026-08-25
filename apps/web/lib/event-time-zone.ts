export const LEGACY_EVENT_TIME_ZONE = 'UTC';

export function formatEventDate(
  value: string | null,
  timeZone: string | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'long' },
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      ...options,
      timeZone: timeZone || LEGACY_EVENT_TIME_ZONE,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      ...options,
      timeZone: LEGACY_EVENT_TIME_ZONE,
    }).format(date);
  }
}
