import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, OperatorPermission } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import { enabledOperationalPermissions } from './operator-capability-policy';

@Injectable()
export class EventOperatorAssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  private async requireOrganizer(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId }, select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, [MembershipRole.OWNER, MembershipRole.ADMIN]);
    return { eventId, organizationId: event.organizationId };
  }

  async list(userId: string, eventId: string) {
    const scope = await this.requireOrganizer(userId, eventId);
    return this.prisma.eventOperatorAssignment.findMany({
      where: scope,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, userId: true, permissions: true, active: true, expiresAt: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async grant(userId: string, eventId: string, targetUserId: string, permissions: OperatorPermission[], expiresAt?: string) {
    const scope = await this.requireOrganizer(userId, eventId);
    const expiryDate = expiresAt ? new Date(expiresAt) : null;
    if (expiryDate && Number.isNaN(expiryDate.getTime())) throw new BadRequestException('Data de validade inválida.');
    if (expiryDate && expiryDate <= new Date()) throw new BadRequestException('Validade precisa ser futura.');
    const target = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: scope.organizationId, userId: targetUserId } },
      select: { role: true, status: true },
    });
    if (target?.role !== MembershipRole.OPERATOR || target.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Operador não encontrado neste evento.');
    }
    const unique = [...new Set(permissions)];
    if (unique.some((permission) => ![OperatorPermission.CHECK_IN, OperatorPermission.ACCREDITATION].includes(permission))) {
      throw new BadRequestException('Esta função operacional ainda não está disponível.');
    }
    const capabilities = await this.prisma.eventCapability.findMany({
      where: { eventId, status: 'ACTIVE' }, select: { code: true },
    });
    if (enabledOperationalPermissions(unique, capabilities.map((item) => item.code)).length !== unique.length) {
      throw new BadRequestException('Habilite as capacidades correspondentes na configuração do evento.');
    }
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.eventOperatorAssignment.upsert({
        where: { eventId_userId: { eventId, userId: targetUserId } },
        create: { ...scope, userId: targetUserId, permissions: unique, expiresAt: expiryDate },
        update: { permissions: unique, expiresAt: expiryDate, active: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId, eventId, actorUserId: userId,
          action: 'operator.assignment_saved', entityType: 'EventOperatorAssignment', entityId: assignment.id,
          metadata: { targetUserId, permissions: unique, expiresAt: expiresAt ?? null },
        },
      });
      return { userId: targetUserId, permissions: assignment.permissions, active: assignment.active, expiresAt: assignment.expiresAt };
    });
  }

  async revoke(userId: string, eventId: string, targetUserId: string) {
    const scope = await this.requireOrganizer(userId, eventId);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.eventOperatorAssignment.findUnique({
        where: { eventId_userId: { eventId, userId: targetUserId } },
      });
      if (!assignment || assignment.organizationId !== scope.organizationId) throw new NotFoundException('Atribuição não encontrada.');
      await tx.eventOperatorAssignment.update({ where: { id: assignment.id }, data: { active: false } });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId, eventId, actorUserId: userId,
          action: 'operator.assignment_revoked', entityType: 'EventOperatorAssignment', entityId: assignment.id,
          metadata: { targetUserId },
        },
      });
      return { revoked: true };
    });
  }
}
