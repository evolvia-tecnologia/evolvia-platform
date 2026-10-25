import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import {
  DEFAULT_HOLD_MINUTES,
  HOLD_MINUTE_OPTIONS,
  REGISTRATION_HOLD_CAPABILITY,
  RegistrationHoldPolicyError,
  SUGGESTED_HOLD_MINUTES,
  normalizeHoldMinutes,
  readHoldMinutes,
} from './registration-hold.policy';

const EVENT_EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];

@Injectable()
export class RegistrationHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    return {
      minutes: await this.minutesFor(event.id),
      options: [...HOLD_MINUTE_OPTIONS],
      suggestedMinutes: SUGGESTED_HOLD_MINUTES,
    };
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    let minutes: number;
    try {
      minutes = normalizeHoldMinutes(input);
    } catch (error) {
      if (error instanceof RegistrationHoldPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId: event.id, code: REGISTRATION_HOLD_CAPABILITY } },
        create: {
          eventId: event.id,
          code: REGISTRATION_HOLD_CAPABILITY,
          status: CapabilityStatus.ACTIVE,
          schemaVersion: 1,
          config: { minutes },
        },
        update: {
          status: CapabilityStatus.ACTIVE,
          config: { minutes },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'registration.hold_configured',
          entityType: 'EventCapability',
          entityId: event.id,
          metadata: { minutes } as Prisma.InputJsonObject,
        },
      });
    });
    return { minutes };
  }

  private async minutesFor(eventId: string) {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: REGISTRATION_HOLD_CAPABILITY } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return DEFAULT_HOLD_MINUTES;
    return readHoldMinutes(row.status, row.config);
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
