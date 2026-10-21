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

export type PublicRegistrationCategory = {
  id: string;
  name: string;
  description: string | null;
  priceLabel: string;
};

export type PublicRegistrationOffer = {
  mode: PublicRegistrationMode;
  categories: PublicRegistrationCategory[];
};

const CATEGORY_ID = /^[a-z0-9]{10,40}$/u;

export function formatPublicPrice(cents: number): string {
  const whole = Math.trunc(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0');
  return `R$ ${whole},${fraction}`;
}

function priceLabel(mode: PublicRegistrationMode, prices: number[]): string {
  if (mode === 'INVITATION') return 'Com convite';
  if (prices.length === 0) return mode === 'PAID' ? 'Valor na ficha de inscrição' : 'Gratuita';
  if (mode === 'FREE' || prices.every((price) => price === 0)) return 'Gratuita';
  const payable = prices.filter((price) => price > 0);
  const lowest = Math.min(...payable);
  return new Set(payable).size > 1 ? `A partir de ${formatPublicPrice(lowest)}` : formatPublicPrice(lowest);
}

function readCategory(value: unknown, mode: PublicRegistrationMode): PublicRegistrationCategory | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !CATEGORY_ID.test(record.id)) return null;
  if (typeof record.name !== 'string') return null;
  const name = record.name.trim();
  if (name.length < 1 || name.length > 120) return null;
  const description = typeof record.description === 'string' ? record.description.replace(/\u0000/gu, '').trim().slice(0, 400) : '';
  const lots = Array.isArray(record.lots) ? record.lots : [];
  const prices = lots.flatMap((lot) => {
    if (!lot || typeof lot !== 'object') return [];
    const cents = (lot as { priceCents?: unknown }).priceCents;
    return typeof cents === 'number' && Number.isInteger(cents) && cents >= 0 && cents <= 10_000_000 ? [cents] : [];
  });
  return {
    id: record.id,
    name,
    description: description || null,
    priceLabel: priceLabel(mode, prices),
  };
}

export function parsePublicRegistrationOffer(payload: unknown): PublicRegistrationOffer | null {
  if (!payload || typeof payload !== 'object') return null;
  const mode = (payload as { event?: { registrationMode?: unknown } }).event?.registrationMode;
  if (mode !== 'FREE' && mode !== 'PAID' && mode !== 'INVITATION') return null;
  const raw = (payload as { categories?: unknown }).categories;
  const categories = Array.isArray(raw)
    ? raw.map((item) => readCategory(item, mode)).filter((item): item is PublicRegistrationCategory => item !== null).slice(0, 12)
    : [];
  return { mode, categories };
}

export function publicParticipantCtaLabel(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'Já tenho ingresso · acessar área do participante'
    : 'Já me inscrevi · acessar área do participante';
}

export function publicOfferSectionTitle(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'Ingressos' : 'Inscrições';
}

export function publicOfferLead(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'A participação começa com a compra de um ingresso. Quem já comprou entra na área do participante.'
    : 'A participação começa com uma inscrição nova. Quem já concluiu a inscrição entra na área do participante.';
}

export function publicOfferClosedLead(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'Não há venda de ingresso aberta agora. Quem já comprou continua pela área do participante.'
    : 'Não há inscrição nova aberta agora. Quem já se inscreveu continua pela área do participante.';
}

export function publicRegistrationSummaryTitle(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'Seu ingresso' : 'Sua inscrição';
}

export function publicRegistrationSubmitLabel(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
  selected: boolean,
): string {
  if (isPublicTicketEvent(profileCode, eventType)) {
    return selected ? 'Confirmar ingresso' : 'Reservar ingresso';
  }
  return selected ? 'Confirmar minha vaga' : 'Reservar minha vaga';
}

export function publicParticipantHeading(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'Acompanhe seu ingresso' : 'Acompanhe sua inscrição';
}

export function publicParticipantCodeLabel(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'Código do ingresso' : 'Código da inscrição';
}

export function publicRegistrationNoun(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): 'ingresso' | 'inscrição' {
  return isPublicTicketEvent(profileCode, eventType) ? 'ingresso' : 'inscrição';
}

export function publicRegistrationFormEyebrow(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'INGRESSO' : 'INSCRIÇÃO';
}

export function publicRegistrationSuccessEyebrow(
  status: 'CONFIRMED' | 'PENDING_PAYMENT' | 'EXPIRED' | 'CANCELLED',
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  const ticket = isPublicTicketEvent(profileCode, eventType);
  if (status === 'CONFIRMED') return ticket ? 'INGRESSO CONFIRMADO' : 'INSCRIÇÃO CONFIRMADA';
  return ticket ? 'RESERVA DE INGRESSO' : 'RESERVA DE INSCRIÇÃO';
}

export function publicRegistrationSuccessTitle(
  status: 'CONFIRMED' | 'PENDING_PAYMENT' | 'EXPIRED' | 'CANCELLED',
  finalPriceCents: number,
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  const ticket = isPublicTicketEvent(profileCode, eventType);
  if (status === 'CONFIRMED' && finalPriceCents === 0) return ticket ? 'Ingresso confirmado' : 'Inscrição confirmada';
  if (status === 'CONFIRMED') return 'Pagamento confirmado';
  if (status === 'PENDING_PAYMENT') return ticket ? 'Ingresso reservado' : 'Vaga reservada';
  return 'Reserva encerrada';
}

export function publicParticipantStatusLead(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'Consulte abaixo o estado atual do seu ingresso. Acompanhe seu ingresso e apresente sua credencial no evento.'
    : 'Consulte abaixo o estado atual da sua inscrição. Acompanhe sua inscrição e apresente sua credencial no evento.';
}

export function publicParticipantAccessLead(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  const noun = publicRegistrationNoun(profileCode, eventType);
  return `Use o código recebido na ${noun} e o mesmo CPF ou documento estrangeiro informado na ficha. Na sua conta Evolvia, os próximos acessos usam e-mail e senha.`;
}

export function publicPaymentReceiptHeading(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType)
    ? 'EVOLVIA — COMPROVANTE DE PAGAMENTO DO INGRESSO'
    : 'EVOLVIA — COMPROVANTE DE PAGAMENTO DA INSCRIÇÃO';
}

export function publicDeskSearchSubmitLabel(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Buscar ingresso' : 'Buscar inscrição';
}

export function publicDeskNewLabel(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Novo ingresso' : 'Nova inscrição';
}

export function publicDeskRegisterTitle(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Novo ingresso no posto' : 'Nova inscrição no posto';
}

export function publicDeskFreeConfirmLabel(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Confirmar ingresso gratuito' : 'Confirmar inscrição gratuita';
}

export function publicDeskSelectedLabel(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Ingresso selecionado' : 'Inscrição selecionada';
}

export function publicDeskProtocolMethodLabel(profileCode: string | null | undefined): string {
  return isPublicTicketEvent(profileCode, null) ? 'Número do ingresso' : 'Número de inscrição';
}

export function publicDeskSearchNotice(count: number, profileCode: string | null | undefined): string {
  if (isPublicTicketEvent(profileCode, null)) {
    return count === 0 ? 'Nenhum ingresso encontrado.' : `${count} ingresso(s) encontrado(s).`;
  }
  return count === 0 ? 'Nenhuma inscrição encontrada.' : `${count} inscrição(ões) encontrada(s).`;
}

export function publicOperationsListCaption(
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  return isPublicTicketEvent(profileCode, eventType) ? 'Ingressos do evento' : 'Inscrições do evento';
}

export function publicOperationsCountNotice(
  count: number,
  profileCode: string | null | undefined,
  eventType: string | null | undefined,
): string {
  if (isPublicTicketEvent(profileCode, eventType)) {
    return `${count} ingresso(s) encontrado(s).`;
  }
  return `${count} inscrição(ões) encontrada(s).`;
}
