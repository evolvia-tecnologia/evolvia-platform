import { NotFoundException } from '@nestjs/common';
import type { FiscalInvoiceDraft } from './nfse-draft-policy';

/** Versioned internal input for a fiscal connector. Provider wire formats require separate homologation. */
export function prepareFiscalAdapterPreview(provider: string, draft: FiscalInvoiceDraft) {
  if (provider !== 'enotas' && provider !== 'notazz') {
    throw new NotFoundException('Conector fiscal indisponível.');
  }
  return {
    version: 1, provider, operation: 'PREVIEW', issueAuthorized: false,
    idempotencyKey: draft.idempotencyKey,
    source: { organizationId: draft.organizationId, eventId: draft.eventId, receiptId: draft.receiptId },
    service: { municipalityIbgeCode: draft.municipalityIbgeCode, code: draft.serviceCode,
      amountCents: draft.amountCents, currency: draft.currency },
    parties: { issuerId: draft.issuerId, recipientId: draft.recipientId },
  } as const;
}
