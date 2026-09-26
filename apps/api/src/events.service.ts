import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, OperatorPermission } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CreateEventDto } from './dto';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { enabledOperationalPermissions } from './operator-capability-policy';
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
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE, ...(organizationId ? { organizationId } : {}) },
      select: { organizationId: true, role: true },
    });
    if (organizationId && memberships.length === 0) {
      await this.authorization.requireMembership(userId, organizationId);
    }
    const editorIds = memberships
      .filter((membership) => EVENT_EDITOR_ROLES.includes(membership.role))
      .map((membership) => membership.organizationId);
    const operatorIds = memberships
      .filter((membership) => membership.role === MembershipRole.OPERATOR)
      .map((membership) => membership.organizationId);

    const events = await this.prisma.event.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        OR: [
          { organizationId: { in: editorIds } },
          {
            organizationId: { in: operatorIds },
            operatorAssignments: { some: {
              userId, active: true, permissions: { isEmpty: false },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            } },
          },
          ...(!organizationId ? [{ organizationId: null, ownerId: userId }] : []),
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
        operatorAssignments: {
          where: { userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { permissions: true },
        },
        capabilities: {
          where: { status: 'ACTIVE' },
          select: { code: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return events.map(({ wizardSessions, capabilities, operatorAssignments, ...event }) => {
      const wizard = !event.organizationId || editorIds.includes(event.organizationId) ? wizardSessions[0] ?? null : null;
      return {
        ...event,
        wizard: wizard
          ? {
              ...wizard,
              completionPercent: wizard.status === 'COMPLETED' ? 100 : wizard.completionPercent,
            }
          : null,
        capabilityCodes: capabilities.map((capability) => capability.code),
        operatorPermissions: enabledOperationalPermissions(
          event.organizationId && editorIds.includes(event.organizationId)
            ? [OperatorPermission.CHECK_IN, OperatorPermission.ACCREDITATION]
            : operatorAssignments[0]?.permissions ?? [],
          capabilities.map((capability) => capability.code),
        ),
      };
    }).filter((event) => event.organizationId === null
      || editorIds.includes(event.organizationId)
      || event.operatorPermissions.length > 0);
  }

  async get(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, organizationId: true, ownerId: true,
        organization: { select: { name: true } },
        capabilities: { where: { status: 'ACTIVE' }, select: { code: true } },
        operatorAssignments: {
          where: { userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { permissions: true }, take: 1,
        },
      },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    const capabilityCodes = event.capabilities.map((item) => item.code);
    let operatorPermissions = enabledOperationalPermissions(
      event.operatorAssignments[0]?.permissions ?? [], capabilityCodes,
    );
    if (event.organizationId) {
      const membership = await this.authorization.requireMembership(userId, event.organizationId);
      if (!EVENT_EDITOR_ROLES.includes(membership.role)) {
        if (membership.role !== MembershipRole.OPERATOR || operatorPermissions.length === 0) {
          throw new NotFoundException('Evento não encontrado.');
        }
      } else {
        operatorPermissions = enabledOperationalPermissions(
          [OperatorPermission.CHECK_IN, OperatorPermission.ACCREDITATION], capabilityCodes,
        );
      }
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    return {
      id: event.id, name: event.name, organizationId: event.organizationId,
      organization: event.organization, capabilityCodes, operatorPermissions,
    };
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
