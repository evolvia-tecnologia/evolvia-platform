import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, Prisma } from '@prisma/client';
import {
  ACTIVITY_ENROLLMENT_LIMIT_CODE,
  ActivityEnrollmentLimit,
  ActivityEnrollmentLimitPolicyError,
  normalizeEnrollmentLimit,
} from './activity-enrollment-limit.policy';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';

const ACTION = 'activity.enrollment_limit_configured';

@Injectable()
export class ActivityEnrollmentLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    return this.view(event.id);
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    let rule: ActivityEnrollmentLimit;
    try { rule = normalizeEnrollmentLimit(input); }
    catch (error) {
      if (error instanceof ActivityEnrollmentLimitPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId: event.id, code: ACTIVITY_ENROLLMENT_LIMIT_CODE } },
        create: {
          eventId: event.id,
          code: ACTIVITY_ENROLLMENT_LIMIT_CODE,
          status: CapabilityStatus.ACTIVE,
          config: rule as Prisma.InputJsonObject,
          schemaVersion: 1,
        },
        update: { status: CapabilityStatus.ACTIVE, config: rule as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: userId,
          action: ACTION,
          entityType: 'EventCapability',
          entityId: ACTIVITY_ENROLLMENT_LIMIT_CODE,
          metadata: { max: rule.max, confirmByOrganization: rule.confirmByOrganization, reason: 'configured' } as Prisma.InputJsonObject,
        },
      });
    });
    return this.view(event.id);
  }

  private async view(eventId: string) {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_ENROLLMENT_LIMIT_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return { configured: false, max: null, confirmByOrganization: false };
    try {
      const rule = normalizeEnrollmentLimit(row.config);
      return { configured: true, max: rule.max, confirmByOrganization: rule.confirmByOrganization };
    } catch {
      return { configured: false, max: null, confirmByOrganization: false };
    }
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
