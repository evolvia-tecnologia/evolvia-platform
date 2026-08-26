import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CreateEventDto } from './dto';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { slugify } from './slug';
import { normalizeEventTimeZone } from './time-zone-policy';
import { inferEventProfileCode } from './wizard-policy';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, organizationId?: string) {
    let organizationIds: string[] | undefined;

    if (organizationId) {
      await this.authorization.requireMembership(userId, organizationId);
      organizationIds = [organizationId];
    } else {
      const memberships = await this.prisma.organizationMembership.findMany({
        where: { userId, status: MembershipStatus.ACTIVE },
        select: { organizationId: true },
      });
      organizationIds = memberships.map((membership) => membership.organizationId);
    }

    const events = await this.prisma.event.findMany({
      where: organizationId
        ? { organizationId }
        : {
            OR: [
              { organizationId: { in: organizationIds } },
              { organizationId: null, ownerId: userId },
            ],
          },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        wizardSessions: {
          where: { flowVersion: 'v2' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            flowVersion: true,
            currentStep: true,
            completionPercent: true,
            status: true,
            lastSavedAt: true,
          },
        },
        capabilities: {
          where: { status: 'ACTIVE' },
          select: { code: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return events.map(({ wizardSessions, capabilities, ...event }) => {
      const wizard = wizardSessions[0] ?? null;
      return {
        ...event,
        wizard: wizard
          ? {
              ...wizard,
              completionPercent: wizard.status === 'COMPLETED' ? 100 : wizard.completionPercent,
            }
          : null,
        capabilityCodes: capabilities.map((capability) => capability.code),
      };
    });
  }

  async create(userId: string, dto: CreateEventDto) {
    let organizationId = dto.organizationId;

    if (organizationId) {
      await this.authorization.requireRole(userId, organizationId, EVENT_EDITOR_ROLES);
    } else {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          status: MembershipStatus.ACTIVE,
          role: { in: [...EVENT_EDITOR_ROLES] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!membership) throw new NotFoundException('Nenhuma organização disponível para criar o evento.');
      organizationId = membership.organizationId;
    }

    const eventType = dto.eventType.trim();
    const timeZone = dto.timeZone ? normalizeEventTimeZone(dto.timeZone) : undefined;
    if (dto.timeZone && !timeZone) throw new BadRequestException('Fuso horário do evento inválido.');
    const base = slugify(dto.name) || 'evento';
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ownerId: userId,
          createdById: userId,
          organizationId,
          name: dto.name.trim(),
          slug: `${base}-${Date.now().toString(36)}`,
          eventType,
          profileCode: inferEventProfileCode(eventType),
          format: dto.format,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          timeZone: timeZone ?? null,
          venue: dto.venue?.trim() || null,
          registrationMode: dto.registrationMode,
          status: 'SETUP',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.created',
          entityType: 'Event',
          entityId: event.id,
          metadata: { profileCode: event.profileCode },
        },
      });
      return event;
    });
  }
}
