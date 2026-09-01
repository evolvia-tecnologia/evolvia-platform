export const PUBLIC_EVENT_PROFILES = [
  { value: 'SCIENTIFIC_EVENT', label: 'Científico ou acadêmico' },
  { value: 'CORPORATE_TRAINING', label: 'Corporativo ou capacitação' },
  { value: 'FAIR_EXHIBITION', label: 'Feira ou exposição' },
  { value: 'ENTERTAINMENT', label: 'Entretenimento' },
  { value: 'SOCIAL_COMMUNITY', label: 'Social, comunitário ou esportivo' },
  { value: 'OTHER', label: 'Outro perfil' },
] as const;

export type PublicEventProfileCode = (typeof PUBLIC_EVENT_PROFILES)[number]['value'];

export function isPublicEventProfile(value: string): value is PublicEventProfileCode {
  return PUBLIC_EVENT_PROFILES.some((profile) => profile.value === value);
}

export function publicEventProfileLabel(profileCode: PublicEventProfileCode | null): string {
  return PUBLIC_EVENT_PROFILES.find((profile) => profile.value === profileCode)?.label ?? 'Perfil não informado';
}

export function publicEventTypeLabel(
  eventType: string | null | undefined,
  profileCode: PublicEventProfileCode | null,
): string {
  return eventType?.trim() || publicEventProfileLabel(profileCode);
}

export function formatEstimatedAudience(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) return null;
  return new Intl.NumberFormat('pt-BR').format(value);
}
