import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, OperatorPermission } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { operationalCapability } from './operator-capability-policy';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: true },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Organização não encontrada.');
    }
    return membership;
  }

  async requireEventPermission(userId: string, organizationId: string, eventId: string, permission: OperatorPermission) {
    const membership = await this.requireMembership(userId, organizationId);
    if (!EVENT_EDITOR_ROLES.includes(membership.role)) {
      if (membership.role !== MembershipRole.OPERATOR) throw new NotFoundException('Evento não encontrado.');
      const assignment = await this.prisma.eventOperatorAssignment.findFirst({
      where: {
        eventId, organizationId, userId, active: true,
        permissions: { has: permission },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
      if (!assignment) throw new NotFoundException('Evento não encontrado.');
    }
    const capability = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: operationalCapability(permission) } },
      select: { status: true },
    });
    if (capability?.status !== 'ACTIVE') throw new NotFoundException('Evento não encontrado.');
    return membership;
  }

  async requireRole(userId: string, organizationId: string, roles: readonly MembershipRole[]) {
    const membership = await this.requireMembership(userId, organizationId);
    if (!roles.includes(membership.role)) {
      throw new NotFoundException('Organização não encontrada.');
    }
    return membership;
  }
}
