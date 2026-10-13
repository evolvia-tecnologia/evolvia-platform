import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  LOT_DISPLAY_CAPABILITY,
  LotDisplayPolicyError,
  normalizeLotDisplayMode,
  readLotDisplayMode,
  type LotDisplayMode,
} from './registration-lot-display.policy';

const CODE = LOT_DISPLAY_CAPABILITY;

@Injectable()
export class RegistrationLotDisplayService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    return { mode: await this.modeFor(event.id) };
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    let mode: LotDisplayMode;
    try { mode = normalizeLotDisplayMode(input); }
    catch (error) {
      if (error instanceof LotDisplayPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId: event.id, code: CODE } },
        create: {
          eventId: event.id,
          code: CODE,
          status: CapabilityStatus.ACTIVE,
          schemaVersion: 1,
          config: { mode } as Prisma.InputJsonObject,
        },
        update: { status: CapabilityStatus.ACTIVE, config: { mode } as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'registration.lot_display_configured',
          entityType: 'EventCapability',
          entityId: event.id,
          metadata: { mode } as Prisma.InputJsonObject,
        },
      });
    });
    return { mode };
  }

  private async modeFor(eventId: string): Promise<LotDisplayMode> {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return 'LADDER';
    return readLotDisplayMode(row.config);
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId };
  }
}
