export const PUBLIC_REGISTRATION_MODES = ['FREE', 'PAID', 'INVITATION'] as const;

/** Tipos da família Entretenimento em event-profile-catalog.ts. */
const TICKET_EVENT_TYPES = ['Show ou entretenimento', 'Festival'] as const;

export type PublicRegistrationMode = (typeof PUBLIC_REGISTRATION_MODES)[number];

export function parsePublicRegistrationMode(payload: unknown): PublicRegistrationMode {
  if (!payload || typeof payload !== 'object') return 'FREE';
  const mode = (payload as { event?: { registrationMode?: unknown } }).event?.registrationMode;
  if (mode === 'PAID' || mode === 'INVITATION' || mode === 'FREE') return mode;
  return 'FREE';
}

export function isPublicTicketEvent(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): boolean {
  if (profileCode === 'ENTERTAINMENT') return true;
  return TICKET_EVENT_TYPES.some((type) => type === eventType);
}

export function publicRegistrationCtaLabel(
  mode: PublicRegistrationMode,
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  if (mode === 'INVITATION') return 'Tenho um convite';
  if (mode === 'PAID') {
    return isPublicTicketEvent(profileCode, eventType) ? 'Comprar ingresso' : 'Comprar inscrição';
  }
  return 'Quero me inscrever';
}

export function publicParticipantCtaLabel(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'Já tenho ingresso · acessar área do participante'
    : 'Já me inscrevi · acessar área do participante';
}
