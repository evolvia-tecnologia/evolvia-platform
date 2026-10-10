import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationBenefitKind, RegistrationMode } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  CouponBatchPolicyError,
  couponBatchCodes,
  newCouponCode,
  normalizeCouponBatch,
} from './registration-coupon-batch.policy';

const BENEFIT_CAP = 500;

@Injectable()
export class RegistrationCouponBatchService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async create(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    if (event.registrationMode !== RegistrationMode.PAID) {
      throw new BadRequestException('Cupons em quantidade só valem para evento com inscrição paga.');
    }
    let batch;
    try { batch = normalizeCouponBatch(input, new Date()); }
    catch (error) {
      if (error instanceof CouponBatchPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const existing = await this.prisma.eventRegistrationBenefit.findMany({
      where: { eventId: event.id, organizationId: event.organizationId },
      select: { code: true, sortOrder: true },
    });
    if (existing.length + batch.quantity > BENEFIT_CAP) {
      throw new BadRequestException('Este evento já chegou ao limite de cupons, convites e cortesias.');
    }
    const taken = new Set(existing.map((item) => item.code));
    let codes: string[];
    try {
      codes = couponBatchCodes(batch.quantity, taken, () => newCouponCode((index) => randomBytes(1)[0] ?? 0));
    } catch (error) {
      if (error instanceof CouponBatchPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const sortFrom = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
    const validFrom = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const catalog = await tx.eventRegistrationBenefitCatalog.upsert({
          where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId } },
          create: { eventId: event.id, organizationId: event.organizationId, revision: 1 },
          update: { revision: { increment: 1 } },
        });
        await tx.eventRegistrationBenefit.createMany({
          data: codes.map((code, index) => ({
            organizationId: event.organizationId,
            eventId: event.id,
            catalogId: catalog.id,
            code,
            name: batch.sponsor,
            kind: RegistrationBenefitKind.COUPON,
            discountPercent: batch.discountPercent,
            maxUses: batch.maxUses,
            validFrom,
            validUntil: batch.validUntil,
            active: true,
            sortOrder: sortFrom + index,
          })),
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: 'registration.coupon_batch_created',
            entityType: 'EventRegistrationBenefitCatalog',
            entityId: catalog.id,
            metadata: {
              quantity: batch.quantity,
              discountPercent: batch.discountPercent,
              maxUses: batch.maxUses,
            } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Não foi possível reservar códigos únicos. Tente de novo.');
      }
      throw error;
    }
    return {
      quantity: codes.length,
      discountPercent: batch.discountPercent,
      maxUses: batch.maxUses,
      validUntil: batch.validUntil.toISOString(),
      codes,
    };
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, registrationMode: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId, registrationMode: event.registrationMode };
  }
}
