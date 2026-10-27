const EMAIL_PATTERN = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
const PHONE_PATTERN = /^\+?[0-9()\-.\s]{8,40}$/u;

export type OrganizerSupport = {
  email: string | null;
  whatsapp: { number: string; label: string } | null;
};

// Characters outside the allowlist (`?`, `&`, `%`, `#`, `/`) would turn the
// mailto link into extra headers or a different target, so they are rejected.
export function organizerSupportEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length > 160 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

// Numbers without a country code are treated as Brazilian (DDD + number).
export function organizerSupportWhatsapp(value: unknown): OrganizerSupport['whatsapp'] {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  if (!PHONE_PATTERN.test(label)) return null;
  const raw = label.replace(/\D/gu, '');
  let digits: string | null = null;
  if (label.startsWith('+')) digits = raw;
  else if (raw.startsWith('00')) digits = raw.slice(2);
  else if ((raw.length === 10 || raw.length === 11) && !raw.startsWith('0')) digits = `55${raw}`;
  else if ((raw.length === 12 || raw.length === 13) && raw.startsWith('55')) digits = raw;
  if (!digits || !/^[1-9][0-9]{7,14}$/u.test(digits)) return null;
  return { number: digits, label };
}

export function organizerSupport(publication: { publicContactEmail: string | null; publicContactPhone: string | null } | null): OrganizerSupport {
  return {
    email: organizerSupportEmail(publication?.publicContactEmail),
    whatsapp: organizerSupportWhatsapp(publication?.publicContactPhone),
  };
}
