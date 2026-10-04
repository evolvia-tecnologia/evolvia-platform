const CALLABLE_PHONE = /^\+?[0-9]{8,15}$/u;

export function publicPhoneHref(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[^\d+]/gu, '');
  if (!CALLABLE_PHONE.test(compact)) return null;
  return `tel:${compact}`;
}
