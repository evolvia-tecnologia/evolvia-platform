const MAX_TIME_ZONE_LENGTH = 64;

export function normalizeEventTimeZone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_TIME_ZONE_LENGTH) return undefined;
  if (/^[+-]\d{2}:?\d{2}$/u.test(candidate) || /^Etc\/GMT[+-]/u.test(candidate)) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
