export const COMMISSION_MIN_PERCENT = 10;
export const COMMISSION_MAX_PERCENT = 15;
export const DEFAULT_COMMISSION_PERCENT = 10;
export const CARD_INSTALLMENTS = 12;

export type CommissionSurface = 'registration' | 'certificate' | 'scientific_submission';
export type FeeBearer = 'ORGANIZER' | 'PARTICIPANT';
export type ParticipantMarket = 'BR' | 'INTERNATIONAL';
export type CheckoutBillingType = 'PIX' | 'CREDIT_CARD';
export type CheckoutChargeType = 'DETACHED' | 'INSTALLMENT';

export class PaidEventCommissionError extends Error {}

const WALLET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type CommissionQuote = {
  surface: CommissionSurface;
  chargeable: boolean;
  percent: number;
  bearer: FeeBearer;
  ticketCents: number;
  platformCents: number;
  organizerCents: number;
  buyerCents: number;
  market: ParticipantMarket;
  billingTypes: CheckoutBillingType[];
  chargeTypes: CheckoutChargeType[];
  maxInstallmentCount: number | null;
};

export function negotiatedCommissionPercent(configured = process.env.EVOLVIA_ASAAS_COMMISSION_PERCENT): number {
  if (configured === undefined || configured.trim() === '') return DEFAULT_COMMISSION_PERCENT;
  if (!/^(?:10|11|12|13|14|15)$/u.test(configured.trim())) {
    throw new PaidEventCommissionError('A comissão negociada com o Asaas precisa ser um inteiro de 10 a 15.');
  }
  return Number(configured.trim());
}

export function normalizeFeeBearer(value: unknown): FeeBearer {
  if (value === undefined || value === null || value === '') return 'ORGANIZER';
  if (value === 'ORGANIZER' || value === 'PARTICIPANT') return value;
  throw new PaidEventCommissionError('Escolha se a organização absorve a comissão ou se o participante a paga.');
}

export function normalizeOrganizerWalletId(value: unknown): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'string' || !WALLET_ID.test(value.trim())) {
    throw new PaidEventCommissionError('Informe o identificador da carteira Asaas. Não use chave de API, token nem senha.');
  }
  return value.trim().toLowerCase();
}

export function participantMarket(country: unknown): ParticipantMarket {
  if (typeof country !== 'string' || !country.trim()) return 'BR';
  const compact = country.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (['br', 'bra', 'brasil', 'brazil'].includes(compact)) return 'BR';
  return 'INTERNATIONAL';
}

export function registrationCountry(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>).country;
}

export function checkoutMethods(market: ParticipantMarket): Pick<CommissionQuote, 'billingTypes' | 'chargeTypes' | 'maxInstallmentCount'> {
  if (market === 'BR') {
    return {
      billingTypes: ['PIX', 'CREDIT_CARD'],
      chargeTypes: ['DETACHED', 'INSTALLMENT'],
      maxInstallmentCount: CARD_INSTALLMENTS,
    };
  }
  return { billingTypes: ['CREDIT_CARD'], chargeTypes: ['DETACHED'], maxInstallmentCount: null };
}

export function quotePlatformCommission(input: {
  surface: CommissionSurface;
  ticketCents: number;
  percent: number;
  bearer: FeeBearer;
  country?: unknown;
}): CommissionQuote {
  const market = participantMarket(input.country);
  const methods = checkoutMethods(market);
  const clear: CommissionQuote = {
    surface: input.surface,
    chargeable: false,
    percent: 0,
    bearer: input.bearer,
    ticketCents: 0,
    platformCents: 0,
    organizerCents: 0,
    buyerCents: 0,
    market,
    ...methods,
  };
  if (input.surface !== 'registration') return clear;
  if (!Number.isInteger(input.ticketCents) || input.ticketCents < 0 || input.ticketCents > 1_000_000_000) {
    throw new PaidEventCommissionError('Valor da inscrição inválido.');
  }
  if (input.ticketCents === 0) return clear;
  if (!Number.isInteger(input.percent) || input.percent < COMMISSION_MIN_PERCENT || input.percent > COMMISSION_MAX_PERCENT) {
    throw new PaidEventCommissionError('A comissão negociada com o Asaas precisa ficar entre 10% e 15%.');
  }
  const platformCents = Math.round((input.ticketCents * input.percent) / 100);
  if (platformCents <= 0 || platformCents >= input.ticketCents) {
    throw new PaidEventCommissionError('O valor da inscrição é baixo demais para separar a comissão de 10% a 15%.');
  }
  if (input.bearer === 'PARTICIPANT') {
    const buyerCents = input.ticketCents + platformCents;
    if (!Number.isSafeInteger(buyerCents) || buyerCents > 1_000_000_000) {
      throw new PaidEventCommissionError('O valor cobrado do participante excede o limite.');
    }
    return {
      ...clear,
      surface: 'registration',
      chargeable: true,
      percent: input.percent,
      ticketCents: input.ticketCents,
      platformCents,
      organizerCents: input.ticketCents,
      buyerCents,
    };
  }
  return {
    ...clear,
    surface: 'registration',
    chargeable: true,
    percent: input.percent,
    ticketCents: input.ticketCents,
    platformCents,
    organizerCents: input.ticketCents - platformCents,
    buyerCents: input.ticketCents,
  };
}

export function asaasCheckoutPayload(input: {
  reservationId: string;
  protocol: string;
  eventName: string;
  amountCents: number;
  minutesToExpire: number;
  billingTypes: CheckoutBillingType[];
  chargeTypes: CheckoutChargeType[];
  maxInstallmentCount: number | null;
  split: { walletId: string; fixedValue: number };
}, callback: { successUrl: string; cancelUrl: string; expiredUrl: string }) {
  if (!input.billingTypes.length || input.billingTypes.some((item) => item !== 'PIX' && item !== 'CREDIT_CARD')) {
    throw new PaidEventCommissionError('O checkout do Asaas aceita Pix e cartão. Boleto e meios locais de outros países não entram nesta cobrança.');
  }
  if (!input.chargeTypes.length || input.chargeTypes.some((item) => item !== 'DETACHED' && item !== 'INSTALLMENT')) {
    throw new PaidEventCommissionError('O tipo de cobrança do checkout é inválido.');
  }
  const walletId = normalizeOrganizerWalletId(input.split.walletId);
  if (!walletId || !(input.split.fixedValue > 0)) {
    throw new PaidEventCommissionError('A carteira de repasse do organizador é inválida.');
  }
  return {
    billingTypes: input.billingTypes,
    chargeTypes: input.chargeTypes,
    ...(input.maxInstallmentCount ? { installment: { maxInstallmentCount: input.maxInstallmentCount } } : {}),
    minutesToExpire: input.minutesToExpire,
    externalReference: `registration:${input.reservationId}`,
    callback,
    items: [{
      externalReference: input.reservationId,
      name: `Inscrição — ${input.eventName}`.slice(0, 120),
      description: `Protocolo ${input.protocol}`,
      quantity: 1,
      value: Number((input.amountCents / 100).toFixed(2)),
    }],
    splits: [{ walletId, fixedValue: input.split.fixedValue }],
  };
}

export function asaasOrganizerSplit(quote: CommissionQuote, walletId: string | null): { walletId: string; fixedValue: number } {
  if (!quote.chargeable) throw new PaidEventCommissionError('Inscrição gratuita, certificado e trabalho científico não geram cobrança.');
  const wallet = normalizeOrganizerWalletId(walletId);
  if (!wallet) {
    throw new PaidEventCommissionError('Ligue a carteira Asaas do organizador antes de cobrar. A Evolvia não recebe o valor inteiro para repassar depois.');
  }
  const fixedValue = Number((quote.organizerCents / 100).toFixed(2));
  const charged = Number((quote.buyerCents / 100).toFixed(2));
  if (!(fixedValue > 0) || fixedValue >= charged) {
    throw new PaidEventCommissionError('O repasse do organizador precisa ser menor do que o valor cobrado.');
  }
  return { walletId: wallet, fixedValue };
}
