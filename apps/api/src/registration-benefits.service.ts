import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  RegistrationBenefitInput,
  RegistrationBenefitsPolicyError,
  normalizeRegistrationBenefits,
} from './registration-benefits-policy';

type SaveRegistrationBenefitsInput = {
  expectedRevision: number;
  benefits: RegistrationBenefitInput[];
};

@Injectable()
export class RegistrationBenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const catalog = await this.prisma.eventRegistrationBenefitCatalog.findUnique({
      where: { eventId_organizationId: scope },
      include: { benefits: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        registrationMode: event.registrationMode,
      },
      revision: catalog?.revision ?? 0,
      benefits: (catalog?.benefits ?? []).map((benefit) => ({
        id: benefit.id,
        code: benefit.code,
        name: benefit.name,
        kind: benefit.kind,
        discountPercent: benefit.discountPercent,
        maxUses: benefit.maxUses,
        usedCount: benefit.usedCount,
        validFrom: benefit.validFrom.toISOString(),
        validUntil: benefit.validUntil.toISOString(),
        active: benefit.active,
        sortOrder: benefit.sortOrder,
      })),
      publicRedemptionEnabled: false,
      message: 'Os códigos podem ser preparados e auditados. O uso durante a inscrição será ativado no próximo corte de reserva.',
    };
  }

  async save(userId: string, eventId: string, input: SaveRegistrationBenefitsInput) {
    const event = await this.requireMutableEvent(userId, eventId);
    let benefits;
    try {
      benefits = normalizeRegistrationBenefits(input.benefits, event.registrationMode);
    } catch (error) {
      if (error instanceof RegistrationBenefitsPolicyError) throw new BadRequestException(error.message);
      throw error;
    }

    const organizationId = event.organizationId!;
    const scope = { eventId, organizationId };
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.eventRegistrationBenefitCatalog.findUnique({
        where: { eventId_organizationId: scope },
        include: { benefits: true },
      });
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new ConflictException('Os benefícios foram alterados em outra sessão. Recarregue antes de salvar novamente.');
      }

      for (const previous of existing?.benefits ?? []) {
        const next = benefits.find((benefit) => benefit.code === previous.code);
        if (previous.usedCount > 0) {
          if (!next) {
            throw new BadRequestException('Benefícios já utilizados não podem ser excluídos; desative-os.');
          }
          if (next.kind !== previous.kind || next.discountPercent !== previous.discountPercent) {
            throw new BadRequestException('O tipo e o desconto de um benefício já utilizado não podem ser alterados.');
          }
        }
        if (next && next.maxUses < previous.usedCount) {
          throw new BadRequestException('O limite de usos não pode ser menor que a quantidade já utilizada.');
        }
      }

      let catalog;
      if (existing) {
        const advanced = await tx.eventRegistrationBenefitCatalog.updateMany({
          where: { id: existing.id, ...scope, revision: input.expectedRevision },
          data: { revision: { increment: 1 } },
        });
        if (advanced.count !== 1) {
          throw new ConflictException('Os benefícios foram alterados em outra sessão. Recarregue antes de salvar novamente.');
        }
        catalog = await tx.eventRegistrationBenefitCatalog.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        try {
          catalog = await tx.eventRegistrationBenefitCatalog.create({ data: { ...scope, revision: 1 } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Os benefícios foram alterados em outra sessão. Recarregue antes de salvar novamente.');
          }
          throw error;
        }
      }

      const previousByCode = new Map((existing?.benefits ?? []).map((benefit) => [benefit.code, benefit]));
      const newBenefits = benefits.filter((benefit) => !previousByCode.has(benefit.code));
      if (newBenefits.length > 0) {
        await tx.eventRegistrationBenefit.createMany({
          data: newBenefits.map((benefit) => ({
            ...scope,
            catalogId: catalog.id,
            code: benefit.code,
            name: benefit.name,
            kind: benefit.kind,
            discountPercent: benefit.discountPercent,
            maxUses: benefit.maxUses,
            validFrom: new Date(benefit.validFrom),
            validUntil: new Date(benefit.validUntil),
            active: benefit.active,
            sortOrder: benefit.sortOrder,
          })),
        });
      }

      for (const inputBenefit of benefits) {
        const previous = previousByCode.get(inputBenefit.code);
        if (!previous) continue;
        const data = {
          name: inputBenefit.name,
          kind: inputBenefit.kind,
          discountPercent: inputBenefit.discountPercent,
          maxUses: inputBenefit.maxUses,
          validFrom: new Date(inputBenefit.validFrom),
          validUntil: new Date(inputBenefit.validUntil),
          active: inputBenefit.active,
          sortOrder: inputBenefit.sortOrder,
        };
        const unchanged = previous.name === data.name
          && previous.kind === data.kind
          && previous.discountPercent === data.discountPercent
          && previous.maxUses === data.maxUses
          && previous.validFrom.getTime() === data.validFrom.getTime()
          && previous.validUntil.getTime() === data.validUntil.getTime()
          && previous.active === data.active
          && previous.sortOrder === data.sortOrder;
        if (!unchanged) await tx.eventRegistrationBenefit.update({ where: { id: previous.id }, data });
      }

      await tx.eventRegistrationBenefit.deleteMany({
        where: { ...scope, catalogId: catalog.id, usedCount: 0, code: { notIn: benefits.map((benefit) => benefit.code) } },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          eventId,
          actorUserId: userId,
          action: 'registration.benefit_catalog_saved',
          entityType: 'EventRegistrationBenefitCatalog',
          entityId: catalog.id,
          metadata: {
            revision: catalog.revision,
            benefitCount: benefits.length,
            couponCount: benefits.filter((benefit) => benefit.kind === 'COUPON').length,
            invitationCount: benefits.filter((benefit) => benefit.kind === 'INVITATION').length,
            courtesyCount: benefits.filter((benefit) => benefit.kind === 'COURTESY').length,
          } as Prisma.InputJsonObject,
        },
      });
    });

    return this.get(userId, eventId);
  }

  private async requireEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    if (!event.organizationId) throw new BadRequestException('O evento precisa estar vinculado a uma organização.');
    return event;
  }

  private async requireMutableEvent(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }
}
