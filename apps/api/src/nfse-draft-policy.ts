import { createHash } from 'node:crypto';

/**
 * Gate G2.14 - deterministic fiscal request contract.
 *
 * This module does NOT issue invoices or talk to fiscal providers. Municipal
 * adapters, issuer authorization, taxpayer verification and legal validation
 * must exist before enabling emission in any environment.
 */
export class FiscalInvoicePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalInvoicePolicyError';
  }
}

export type FiscalInvoiceSource = {
  organizationId: string;
  eventId: string;
  reservationId: string;
  receiptId: string;
  paymentStatus: 'CONFIRMED' | 'PENDING' | 'REFUNDED' | 'CANCELLED';
  amountCents: number;
  currency: 'BRL';
  municipalityIbgeCode: string;
  issuerId: string;
  recipientId: string;
  serviceCode: string;
};

export type FiscalInvoiceDraft = {
  idempotencyKey: string;
  organizationId: string;
  eventId: string;
  reservationId: string;
  receiptId: string;
  amountCents: number;
  municipalityIbgeCode: string;
  issuerId: string;
  recipientId: string;
  serviceCode: string;
  status: 'AWAITING_MUNICIPAL_ADAPTER';
  issueAuthorized: false;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const IBGE = /^\d{7}$/u;
// IBGE municipality codes begin with a valid Brazilian state code. This is
// structural validation only; municipal adapter must validate the full code.
const IBGE_UF = new Set(['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29','31','32','33','35','41','42','43','50','51','52','53']);
const SERVICE = /^[A-Za-z0-9.\-]{1,20}$/u;
const MAX_CENTS = 999_999_999_999;

export function prepareFiscalInvoiceDraft(input: FiscalInvoiceSource): FiscalInvoiceDraft {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FiscalInvoicePolicyError('Referências fiscais inválidas.');
  }
  const ids = [input.organizationId, input.eventId, input.reservationId,
    input.receiptId, input.issuerId, input.recipientId];
  if (ids.some((id) => typeof id !== 'string' || !ID.test(id))) {
    throw new FiscalInvoicePolicyError('Referências fiscais inválidas.');
  }
  if (input.paymentStatus !== 'CONFIRMED') {
    throw new FiscalInvoicePolicyError('A nota exige pagamento confirmado e não estornado.');
  }
  if (input.currency !== 'BRL' || !Number.isSafeInteger(input.amountCents)
    || input.amountCents <= 0 || input.amountCents > MAX_CENTS) {
    throw new FiscalInvoicePolicyError('Valor fiscal inválido.');
  }
  if (typeof input.municipalityIbgeCode !== 'string'
    || !IBGE.test(input.municipalityIbgeCode)
    || !IBGE_UF.has(input.municipalityIbgeCode.slice(0, 2))
    || input.municipalityIbgeCode.slice(2) === '00000'
    || typeof input.serviceCode !== 'string'
    || !SERVICE.test(input.serviceCode)) {
    throw new FiscalInvoicePolicyError('Município ou código de serviço inválido.');
  }
  const keySource = [
    'nfse-draft-v1', input.organizationId, input.eventId, input.reservationId,
    input.receiptId, input.issuerId, input.recipientId, input.municipalityIbgeCode,
    input.serviceCode, String(input.amountCents),
  ].join(':');
  return {
    idempotencyKey: createHash('sha256').update(keySource).digest('hex'),
    organizationId: input.organizationId,
    eventId: input.eventId,
    reservationId: input.reservationId,
    receiptId: input.receiptId,
    amountCents: input.amountCents,
    municipalityIbgeCode: input.municipalityIbgeCode,
    issuerId: input.issuerId,
    recipientId: input.recipientId,
    serviceCode: input.serviceCode,
    status: 'AWAITING_MUNICIPAL_ADAPTER',
    issueAuthorized: false,
  };
}

export function requireMunicipalFiscalAuthorization(
  draft: FiscalInvoiceDraft,
): never {
  // Fail closed: no adapter / municipal homologation / explicit opt-in exists yet.
  // This prevents a payment receipt being mislabeled an issued tax document.
  void draft;
  throw new FiscalInvoicePolicyError(
    'NFS-e não emitida: adaptador municipal e homologação fiscal ainda indisponíveis.',
  );
}
