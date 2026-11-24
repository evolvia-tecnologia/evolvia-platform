import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

type PreparationRow = {
  organizationId: string; municipalityIbgeCode: string; idempotencyKey: string;
  sandboxProvider: string | null; sandboxPreparedAt: Date | null;
};

// Persist the sandbox binding, never a municipal protocol or an issuance result.
export function prepareFiscalSandbox(db: Pick<PrismaClient, '$transaction'>, userId: string, eventId: string, receiptId: string) {
  return db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<PreparationRow[]>`
      SELECT r."organizationId", d."municipalityIbgeCode", d."idempotencyKey", d."sandboxProvider", d."sandboxPreparedAt"
      FROM "FiscalReceiptDraft" d
      JOIN "EventRegistrationPaymentReceipt" r ON r.id = d."receiptId" AND r."organizationId" = d."issuerId"
      JOIN "OrganizationMembership" m ON m."organizationId" = r."organizationId"
      JOIN "EventRegistrationCheckout" c ON c.id = r."checkoutId" AND c."reservationId" = r."reservationId"
      JOIN "EventRegistrationReservation" s ON s.id = r."reservationId"
      WHERE r.id = ${receiptId} AND r."eventId" = ${eventId} AND m."userId" = ${userId}
        AND m.status = 'ACTIVE' AND m.role = 'OWNER' AND c.status = 'PAID' AND c."paidAt" IS NOT NULL
        AND c."amountCents" = r."amountCents" AND s.status = 'CONFIRMED'
      FOR UPDATE OF d FOR SHARE OF r, m, c, s`;
    if (!row) throw new NotFoundException('Prévia fiscal indisponível.');
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
    return { environment: 'SANDBOX', status: 'PREPARED', provider, preparedAt,
      idempotencyKey: row.idempotencyKey, issueAuthorized: false };
  });
}
