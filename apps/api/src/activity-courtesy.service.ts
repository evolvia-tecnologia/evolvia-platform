import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventActivityEnrollmentStatus, Prisma, ScientificProgramActivityStatus } from '@prisma/client';
import {
  ACTIVITY_COURTESY_CODE,
  ActivityCourtesyPolicyError,
  ActivityCourtesyQuota,
  normalizeCourtesyQuotas,
  readCourtesyQuotas,
} from './activity-courtesy.policy';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';

const ACTION = 'activity.courtesy_configured';

@Injectable()
export class ActivityCourtesyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    return this.view(event.id, event.organizationId);
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    let quotas: ActivityCourtesyQuota[];
    try { quotas = normalizeCourtesyQuotas(input); }
    catch (error) {
      if (error instanceof ActivityCourtesyPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.assertQuotas(event, quotas);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId: event.id, code: ACTIVITY_COURTESY_CODE } },
        create: {
          eventId: event.id,
          code: ACTIVITY_COURTESY_CODE,
          status: CapabilityStatus.ACTIVE,
          config: { quotas } as Prisma.InputJsonObject,
          schemaVersion: 1,
        },
        update: { status: CapabilityStatus.ACTIVE, config: { quotas } as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: userId,
          action: ACTION,
          entityType: 'EventCapability',
          entityId: ACTIVITY_COURTESY_CODE,
          metadata: { quotas: quotas.length, reason: 'configured' } as Prisma.InputJsonObject,
        },
      });
    });
    return this.view(event.id, event.organizationId);
  }

  private async assertQuotas(event: { id: string; organizationId: string }, quotas: ActivityCourtesyQuota[]) {
    if (quotas.length === 0) return;
    const activities = await this.prisma.scientificProgramActivity.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        id: { in: quotas.map((item) => item.activityId) },
        status: ScientificProgramActivityStatus.PUBLISHED,
      },
      select: { id: true, space: { select: { capacity: true } }, _count: { select: { participants: true } } },
    });
    const byId = new Map(activities.map((item) => [item.id, item]));
    const ids = quotas.map((item) => item.activityId);
    const [courtesyUsed, publicUsed] = await Promise.all([
      this.usedByActivity(event.id, event.organizationId, true, ids),
      this.usedByActivity(event.id, event.organizationId, false, ids),
    ]);
    for (const quota of quotas) {
      const activity = byId.get(quota.activityId);
      const open = activity?.space?.capacity == null
        ? 0
        : Math.max(0, activity.space.capacity - activity._count.participants - (publicUsed.get(quota.activityId) ?? 0));
      if (!activity || quota.count > open) throw new BadRequestException('A cortesia não pode passar das vagas abertas da atividade.');
      if (quota.count < (courtesyUsed.get(quota.activityId) ?? 0)) throw new BadRequestException('Já existem cortesias confirmadas acima desse número.');
    }
  }

  private async view(eventId: string, organizationId: string) {
    const [activities, quotas, courtesyUsed, publicUsed] = await Promise.all([
      this.prisma.scientificProgramActivity.findMany({
        where: { eventId, organizationId, status: ScientificProgramActivityStatus.PUBLISHED, space: { capacity: { gt: 0 } } },
        select: { id: true, title: true, space: { select: { capacity: true } }, _count: { select: { participants: true } } },
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
        take: 200,
      }),
      this.savedQuotas(eventId),
      this.usedByActivity(eventId, organizationId, true),
      this.usedByActivity(eventId, organizationId, false),
    ]);
    return {
      activities: activities.map((activity) => {
        const capacity = activity.space?.capacity ?? 0;
        const quota = quotas.get(activity.id) ?? 0;
        return {
          activityId: activity.id,
          title: activity.title,
          capacity,
          speakers: activity._count.participants,
          courtesyQuota: quota,
          courtesyUsed: courtesyUsed.get(activity.id) ?? 0,
          courtesyLimit: Math.max(0, capacity - activity._count.participants - (publicUsed.get(activity.id) ?? 0)),
          publicRemaining: Math.max(0, capacity - activity._count.participants - quota - (publicUsed.get(activity.id) ?? 0)),
        };
      }),
    };
  }

  private async savedQuotas(eventId: string) {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_COURTESY_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return new Map<string, number>();
    return new Map(readCourtesyQuotas(row.config).map((item) => [item.activityId, item.count]));
  }

  private async usedByActivity(eventId: string, organizationId: string, courtesy: boolean, activityIds?: string[]) {
    const rows = await this.prisma.eventActivityEnrollment.groupBy({
      by: ['activityId'],
      where: {
        eventId,
        organizationId,
        status: EventActivityEnrollmentStatus.ENROLLED,
        courtesy,
        ...(activityIds ? { activityId: { in: activityIds } } : {}),
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.activityId, row._count._all]));
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
