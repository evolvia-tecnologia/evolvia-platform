import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CreateEventDto } from './dto';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { slugify } from './slug';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, organizationId?: string) {
    if (organizationId) {
      await this.authorization.requireMembership(userId, organizationId);
      return this.prisma.event.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { organizationId: true },
    });
    const organizationIds = memberships.map((membership) => membership.organizationId);

    return this.prisma.event.findMany({
      where: {
        OR: [
          { organizationId: { in: organizationIds } },
          { organizationId: null, ownerId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
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

    const base = slugify(dto.name) || 'evento';
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ownerId: userId,
          createdById: userId,
          organizationId,
          name: dto.name.trim(),
          slug: `${base}-${Date.now().toString(36)}`,
          eventType: dto.eventType.trim(),
          format: dto.format,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
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
        },
      });
      return event;
    });
  }
}
