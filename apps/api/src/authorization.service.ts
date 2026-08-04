import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';

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

  async requireRole(userId: string, organizationId: string, roles: readonly MembershipRole[]) {
    const membership = await this.requireMembership(userId, organizationId);
    if (!roles.includes(membership.role)) {
      throw new NotFoundException('Organização não encontrada.');
    }
    return membership;
  }
}
