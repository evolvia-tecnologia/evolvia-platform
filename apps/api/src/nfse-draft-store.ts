import { setTimeout as delay } from 'node:timers/promises';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { FiscalInvoicePolicyError, validateFiscalSetup, type FiscalSetup } from './nfse-draft-policy';
import { previewFiscalReceipt } from './nfse-receipt-draft';

export async function readOrPrepareFiscalDraft(
  db: Pick<PrismaClient, '$transaction'>, userId: string, eventId: string, receiptId: string,
  command?: { setup: FiscalSetup },
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const event = await tx.event.findFirst({
          where: { id: eventId, organization: { memberships: { some: { userId, status: 'ACTIVE', role: 'OWNER' } } } },
          select: { organizationId: true },
        });
        if (!event?.organizationId) throw new NotFoundException('Recibo indisponível.');
        const organizationId = event.organizationId;
        const stored = await tx.fiscalReceiptDraft.findFirst({
          where: { receiptId, receipt: { eventId, organizationId } },
        });
        if (!command && !stored) throw new NotFoundException('Prévia fiscal indisponível.');
        const setup = command ? command.setup : stored!;
        try {
          validateFiscalSetup(setup);
        } catch (error) {
          if (error instanceof FiscalInvoicePolicyError) throw new BadRequestException(error.message);
          throw error;
        }
        if (setup.issuerId !== organizationId) {
          throw new BadRequestException('O emissor precisa corresponder à organização do recibo.');
        }
        const draft = await previewFiscalReceipt(tx, { userId, organizationId, eventId, receiptId }, setup);
        if (stored && stored.idempotencyKey !== draft.idempotencyKey) {
          throw new ConflictException('Os dados fiscais divergem da prévia registrada.');
        }
        if (!stored) {
          // Lock the authorization row through commit. A revocation that won the
          // race invalidates this serializable snapshot and forces a fresh check.
          const authorized = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "OrganizationMembership"
            WHERE "organizationId" = ${organizationId} AND "userId" = ${userId}
              AND "status" = 'ACTIVE' AND "role" = 'OWNER' FOR SHARE
          `;
          if (!authorized.length) throw new NotFoundException('Recibo indisponível.');
          await tx.fiscalReceiptDraft.create({ data: {
            receiptId, idempotencyKey: draft.idempotencyKey, issuerId: draft.issuerId,
            recipientId: draft.recipientId, municipalityIbgeCode: draft.municipalityIbgeCode, serviceCode: draft.serviceCode,
          } });
          await tx.auditLog.create({ data: {
            organizationId, eventId, actorUserId: userId, action: 'nfse.draft_prepared',
            entityType: 'FiscalReceiptDraft', entityId: receiptId,
          } });
        }
        return draft;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof FiscalInvoicePolicyError) throw new NotFoundException('Recibo indisponível.');
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      const serializationFailure = error.code === 'P2010' && error.meta?.code === '40001';
      if (!serializationFailure && !['P2034','P2002'].includes(error.code)) throw error;
      if (attempt >= 4) throw new ConflictException('Prévia em atualização. Repita a consulta.');
      const windowMs = 10 * 2 ** (attempt - 1);
      await delay(windowMs + Math.floor(Math.random() * windowMs));
    }
  }
}
