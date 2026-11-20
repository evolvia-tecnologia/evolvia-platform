import { readOrPrepareFiscalDraft } from './nfse-draft-store';
import type { FiscalSetup } from './nfse-draft-policy';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import { SaveEventFinancialResponsibilityDto } from './event-financial-responsibility.dto';
import {
  COMMISSION_MAX_PERCENT,
  COMMISSION_MIN_PERCENT,
  PaidEventCommissionError,
  negotiatedCommissionPercent,
  normalizeFeeBearer,
} from './paid-event-commission.policy';

function currentCommissionPercent(): number | null {
  try {
    return negotiatedCommissionPercent();
  } catch (error) {
    if (error instanceof PaidEventCommissionError) return null;
    throw error;
  }
}

@Injectable()
export class EventFinancialResponsibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  fiscalDraft(userId: string, eventId: string, receiptId: string, command?: { setup: FiscalSetup }) {
    return readOrPrepareFiscalDraft(this.prisma, userId, eventId, receiptId, command);
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, status: true, registrationMode: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, [MembershipRole.OWNER, MembershipRole.ADMIN]);
    return { ...event, organizationId: event.organizationId };
  }

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const [configuration, seller] = await Promise.all([
      this.prisma.eventFinancialResponsibility.findUnique({ where: { eventId } }),
      this.prisma.organizationLegalProfile.findUnique({ where: { organizationId: event.organizationId } }),
    ]);
    return {
      event: { id: event.id, organizationId: event.organizationId, status: event.status, registrationMode: event.registrationMode },
      seller: seller ? { kind: seller.kind, legalName: seller.legalName, tradeName: seller.tradeName, taxId: seller.taxId, revision: seller.revision } : null,
      configuration: configuration ? {
        revision: configuration.revision,
        sellerOrganizationId: configuration.organizationId,
        sellerLegalProfileRevision: configuration.sellerLegalProfileRevision,
        feeBearer: normalizeFeeBearer(configuration.feeBearer),
      } : null,
      commission: {
        provider: 'ASAAS' as const,
        percent: currentCommissionPercent(),
        minPercent: COMMISSION_MIN_PERCENT,
        maxPercent: COMMISSION_MAX_PERCENT,
        bearer: normalizeFeeBearer(configuration?.feeBearer),
        walletLinked: Boolean(seller?.asaasWalletId),
        certificateCents: 0 as const,
        submissionCents: 0 as const,
      },
      ready: Boolean(configuration && seller && configuration.organizationId === event.organizationId
        && configuration.sellerLegalProfileRevision === seller.revision),
      documentIssuanceAvailable: false,
    };
  }

  async save(userId: string, eventId: string, dto: SaveEventFinancialResponsibilityDto) {
    const event = await this.eventFor(userId, eventId);
    if (dto.sellerOrganizationId !== event.organizationId) {
      throw new NotFoundException('A entidade responsável não pertence a este evento.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.event.findUnique({
          where: { id_organizationId: { id: event.id, organizationId: event.organizationId } },
          select: { status: true },
        });
        if (!locked || !['DRAFT', 'SETUP', 'HOMOLOGATION'].includes(locked.status)) {
          throw new ConflictException('Volte o evento à configuração antes de alterar o responsável financeiro.');
        }
        const paid = await tx.eventRegistrationCheckout.count({
          where: { eventId: event.id, organizationId: event.organizationId, paidAt: { not: null } },
        });
        if (paid) throw new ConflictException('Há pagamentos confirmados. A mudança exige revisão financeira.');
        const seller = await tx.organizationLegalProfile.findUnique({ where: { organizationId: event.organizationId } });
        if (!seller) throw new ConflictException('Cadastre os dados PF/PJ da organização antes de configurar a venda.');
        const current = await tx.eventFinancialResponsibility.findUnique({ where: { eventId } });
        if ((current?.revision ?? 0) !== dto.expectedRevision) {
          throw new ConflictException('O responsável financeiro foi alterado. Recarregue antes de salvar.');
        }
        const feeBearer = dto.feeBearer === undefined ? normalizeFeeBearer(current?.feeBearer) : normalizeFeeBearer(dto.feeBearer);
        const saved = current
          ? await (async () => {
              const advanced = await tx.eventFinancialResponsibility.updateMany({
                where: { eventId, organizationId: event.organizationId, revision: dto.expectedRevision },
                data: { sellerLegalProfileRevision: seller.revision, feeBearer, revision: { increment: 1 } },
              });
              if (advanced.count !== 1) throw new ConflictException('O responsável financeiro foi alterado. Recarregue antes de salvar.');
              return tx.eventFinancialResponsibility.findUniqueOrThrow({ where: { eventId } });
            })()
          : await tx.eventFinancialResponsibility.create({
              data: { eventId, organizationId: event.organizationId, sellerLegalProfileRevision: seller.revision, feeBearer },
            });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId, eventId, actorUserId: userId,
            action: 'event.financial_responsibility_saved',
            entityType: 'EventFinancialResponsibility', entityId: eventId,
            metadata: { revision: saved.revision, sellerLegalProfileRevision: seller.revision, feeBearer },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('O responsável financeiro foi alterado. Recarregue antes de salvar.');
      }
      throw error;
    }
    return this.get(userId, eventId);
  }
}
