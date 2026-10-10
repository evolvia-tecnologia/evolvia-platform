import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import {
  activityDisplayTitle,
  normalizeTransmission,
  readActivityLinks,
  replaceActivityLink,
  TransmissionPolicyError,
  type StoredActivityLink,
  type TransmissionLink,
} from './transmission-policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const CODE = 'activity_transmission';

@Injectable()
export class ActivityTransmissionService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async list(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    const [activities, links] = await Promise.all([
      this.prisma.scientificProgramActivity.findMany({
        where: { eventId: event.id, organizationId: event.organizationId },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 80,
        select: { id: true, title: true, startAt: true, endAt: true, status: true },
      }),
      this.stored(event.id),
    ]);
    const byActivity = new Map(links.map((item) => [item.activityId, item]));
    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        title: activityDisplayTitle(activity.title),
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        status: activity.status,
        transmission: visible(byActivity.get(activity.id)),
      })),
    };
  }

  async save(userId: string, eventId: string, activityId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    if (!/^[a-z0-9]{20,32}$/u.test(activityId)) throw new BadRequestException('Atividade inválida.');
    const activity = await this.prisma.scientificProgramActivity.findFirst({
      where: { id: activityId, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada neste evento.');
    let link: TransmissionLink | null;
    try { link = normalizeTransmission(input); }
    catch (error) {
      if (error instanceof TransmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const current = await this.stored(event.id);
    let next: StoredActivityLink[];
    try { next = replaceActivityLink(current, activity.id, link); }
    catch (error) {
      if (error instanceof TransmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId: event.id, code: CODE } },
        create: {
          eventId: event.id,
          code: CODE,
          status: next.length > 0 ? CapabilityStatus.ACTIVE : CapabilityStatus.DISABLED,
          schemaVersion: 1,
          config: { links: next } as Prisma.InputJsonObject,
        },
        update: {
          status: next.length > 0 ? CapabilityStatus.ACTIVE : CapabilityStatus.DISABLED,
          config: { links: next } as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.activity_transmission_configured',
          entityType: 'EventCapability',
          entityId: event.id,
          metadata: { activityId: activity.id, enabled: Boolean(link), kind: link?.kind ?? null } as Prisma.InputJsonObject,
        },
      });
    });
    return { transmission: link };
  }

  async forActivities(eventId: string, organizationId: string, activityIds: readonly string[]) {
    if (activityIds.length === 0) return new Map<string, TransmissionLink>();
    const allowed = new Set(activityIds);
    const wanted = (await this.stored(eventId)).filter((item) => allowed.has(item.activityId));
    if (wanted.length === 0) return new Map<string, TransmissionLink>();
    const owned = await this.prisma.scientificProgramActivity.findMany({
      where: { id: { in: wanted.map((item) => item.activityId) }, eventId, organizationId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((item) => item.id));
    return new Map(wanted.filter((item) => ownedIds.has(item.activityId)).map((item) => [item.activityId, { kind: item.kind, title: item.title, url: item.url }]));
  }

  private async stored(eventId: string): Promise<StoredActivityLink[]> {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return [];
    return readActivityLinks(row.config);
  }

  private async eventFor(userId: string, eventId: string, roles: readonly MembershipRole[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, roles);
    return { id: event.id, organizationId: event.organizationId };
  }
}

function visible(link: StoredActivityLink | undefined): TransmissionLink | null {
  if (!link) return null;
  return { kind: link.kind, title: link.title, url: link.url };
}
