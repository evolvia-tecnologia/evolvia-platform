import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { FiscalInvoicePolicyError, prepareFiscalInvoiceDraft, type FiscalSetup } from './nfse-draft-policy';

type PreparationRow = FiscalSetup & {
  organizationId: string; reservationId: string; amountCents: number; idempotencyKey: string;
  sandboxProvider: string | null; sandboxPreparedAt: Date | null;
};

type SavedPreparation = { provider: string; preparedAt: Date; idempotencyKey: string };

function preparationView(saved: SavedPreparation) {
  return { environment: 'SANDBOX', status: 'PREPARED', ...saved, issueAuthorized: false } as const;
}

type FiscalDatabase = Pick<PrismaClient, '$transaction'>;

export function readFiscalSandboxPreparation(db: FiscalDatabase, userId: string, eventId: string, receiptId: string) {
  return sandboxPreparation(db, userId, eventId, receiptId, 'read');
}

export function prepareFiscalSandbox(db: FiscalDatabase, userId: string, eventId: string, receiptId: string) {
  return sandboxPreparation(db, userId, eventId, receiptId, 'prepare');
}

function sandboxPreparation(db: FiscalDatabase, userId: string, eventId: string, receiptId: string, mode: 'read' | 'prepare') {
  return db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<PreparationRow[]>`
      SELECT r."organizationId", r."reservationId", r."amountCents", d."issuerId", d."recipientId", d."serviceCode",
        d."municipalityIbgeCode", d."idempotencyKey", d."sandboxProvider", d."sandboxPreparedAt"
      FROM "FiscalReceiptDraft" d
      JOIN "EventRegistrationPaymentReceipt" r ON r.id = d."receiptId" AND r."organizationId" = d."issuerId"
      JOIN "Event" e ON e.id = r."eventId" AND e."organizationId" = r."organizationId"
      JOIN "OrganizationMembership" m ON m."organizationId" = r."organizationId"
      JOIN "EventRegistrationCheckout" c ON c.id = r."checkoutId" AND c."reservationId" = r."reservationId"
      JOIN "EventRegistrationReservation" s ON s.id = r."reservationId"
      WHERE r.id = ${receiptId} AND r."eventId" = ${eventId} AND m."userId" = ${userId}
        AND m.status = 'ACTIVE' AND m.role = 'OWNER' AND c.status = 'PAID' AND c."paidAt" IS NOT NULL
        AND c."organizationId" = r."organizationId" AND c."eventId" = r."eventId"
        AND s."organizationId" = r."organizationId" AND s."eventId" = r."eventId"
        AND c."amountCents" = r."amountCents" AND s.status = 'CONFIRMED'
      FOR UPDATE OF d FOR SHARE OF r, e, m, c, s`;
    if (!row) throw new NotFoundException('Prévia fiscal indisponível.');
    try {
      const current = prepareFiscalInvoiceDraft({ ...row, receiptId, eventId, currency: 'BRL', paymentStatus: 'CONFIRMED' });
      if (current.idempotencyKey !== row.idempotencyKey) throw new ConflictException('Os dados do recibo divergiram da prévia fiscal.');
    } catch (error) {
      if (error instanceof FiscalInvoicePolicyError) throw new ConflictException('O recibo perdeu a elegibilidade fiscal.');
      throw error;
    }
    if (mode === 'read') {
      if (!row.sandboxProvider || !row.sandboxPreparedAt) throw new NotFoundException('Preparação fiscal indisponível.');
      return preparationView({ provider: row.sandboxProvider, preparedAt: row.sandboxPreparedAt, idempotencyKey: row.idempotencyKey });
    }
    const provider = process.env.EVOLVIA_NFSE_SANDBOX_PROVIDER;
    if ((provider !== 'enotas' && provider !== 'notazz') ||
        process.env.EVOLVIA_NFSE_SANDBOX_ORGANIZATION_ID !== row.organizationId ||
        process.env.EVOLVIA_NFSE_SANDBOX_MUNICIPALITY !== row.municipalityIbgeCode) {
      throw new ServiceUnavailableException('Preparação fiscal de homologação desabilitada.');
    }
    if (row.sandboxProvider && row.sandboxProvider !== provider) {
      throw new ConflictException('O recibo já foi preparado com outro provedor.');
    }
    const preparedAt = row.sandboxPreparedAt ?? new Date();
    if (!row.sandboxProvider) {
      await tx.$executeRaw`UPDATE "FiscalReceiptDraft" SET "sandboxProvider" = ${provider},
        "sandboxPreparedAt" = ${preparedAt} WHERE "receiptId" = ${receiptId}`;
      await tx.auditLog.create({ data: { organizationId: row.organizationId, eventId, actorUserId: userId,
        entityId: receiptId, entityType: 'FiscalReceiptDraft', action: 'nfse.sandbox_prepared' } });
    }
    return preparationView({ provider, preparedAt, idempotencyKey: row.idempotencyKey });
  });
}
