import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AddOrganizationMemberDto, CreateOrganizationDto, UpdateMembershipRoleDto } from './dto';
import { AuthorizationService } from './authorization.service';
import { canAssignRole, canManageMembers, requiresAnotherOwner } from './membership-policy';
import { PrismaService } from './prisma.service';
import { slugify } from './slug';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  list(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        organization: {
          select: { id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true },
        },
      },
    });
  }

  async create(userId: string, dto: CreateOrganizationDto, idempotencyKey?: string) {
    const name = dto.name.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(idempotencyKey)) {
      throw new BadRequestException('Informe uma chave de idempotência válida para criar a organização.');
    }
    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const payloadHash = createHash('sha256').update(JSON.stringify({ ...dto, name })).digest('hex');

    const replay = async () => {
      const previous = await this.prisma.organizationCreationRequest.findUnique({
        where: { userId_keyHash: { userId, keyHash } },
        select: { payloadHash: true, organizationId: true },
      });
      if (!previous) return null;
      if (previous.payloadHash !== payloadHash) {
        throw new ConflictException('Esta tentativa já foi usada com outro nome de organização.');
      }
      return this.prisma.organization.findUniqueOrThrow({ where: { id: previous.organizationId } });
    };
    const previous = await replay();
    if (previous) return previous;

    const slug = `${slugify(name) || 'organizacao'}-${randomUUID().slice(0, 8)}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name, slug, createdById: userId },
        });
        await tx.organizationCreationRequest.create({
          data: { userId, keyHash, payloadHash, organizationId: organization.id },
        });
        await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: userId,
            action: 'organization.created',
            entityType: 'Organization',
            entityId: organization.id,
          },
        });
        return organization;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A concorrente terminou a transação: a chave única decide qual resposta prevalece.
        const completed = await replay();
        if (completed) return completed;
        throw new ConflictException('Não foi possível concluir esta criação. Tente novamente.');
      }
      throw error;
    }
  }

  async listMembers(userId: string, organizationId: string) {
    await this.authorization.requireMembership(userId, organizationId);
    return this.prisma.organizationMembership.findMany({
      where: { organizationId, status: { not: MembershipStatus.REMOVED } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async addMember(userId: string, organizationId: string, dto: AddOrganizationMemberDto) {
    const actor = await this.authorization.requireMembership(userId, organizationId);
    if (!canManageMembers(actor.role)) throw new ForbiddenException('Você não pode gerenciar membros.');
    if (!canAssignRole(actor.role, null, dto.role)) {
      throw new ForbiddenException('Você não pode atribuir esse papel.');
    }

    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      throw new BadRequestException('O usuário precisa criar uma conta antes de entrar na organização.');
    }

    const existing = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: target.id } },
    });
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('Esse usuário já participa da organização.');
    }

    return this.prisma.$transaction(async (tx) => {
      const membership = existing
        ? await tx.organizationMembership.update({
            where: { id: existing.id },
            data: {
              role: dto.role,
              status: MembershipStatus.ACTIVE,
              invitedById: userId,
              joinedAt: new Date(),
            },
            include: { user: { select: { id: true, name: true, email: true } } },
          })
        : await tx.organizationMembership.create({
            data: {
              organizationId,
              userId: target.id,
              role: dto.role,
              status: MembershipStatus.ACTIVE,
              invitedById: userId,
              joinedAt: new Date(),
            },
            include: { user: { select: { id: true, name: true, email: true } } },
          });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'membership.added',
          entityType: 'OrganizationMembership',
          entityId: membership.id,
          metadata: { targetUserId: target.id, role: dto.role },
        },
      });
      return membership;
    });
  }

  async updateRole(
    userId: string,
    organizationId: string,
    membershipId: string,
    dto: UpdateMembershipRoleDto,
  ) {
    const actor = await this.authorization.requireMembership(userId, organizationId);
    const target = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!target) throw new NotFoundException('Membro não encontrado.');
    if (!canAssignRole(actor.role, target.role, dto.role)) {
      throw new ForbiddenException('Você não pode realizar essa alteração de papel.');
    }

    if (requiresAnotherOwner(target.role, dto.role)) {
      const owners = await this.prisma.organizationMembership.count({
        where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      if (owners <= 1) throw new ConflictException('A organização precisa manter ao menos um proprietário.');
    }

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: dto.role },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'membership.role_changed',
          entityType: 'OrganizationMembership',
          entityId: target.id,
          metadata: { from: target.role, to: dto.role, targetUserId: target.userId },
        },
      });
      return membership;
    });
  }

  async removeMember(userId: string, organizationId: string, membershipId: string) {
    const actor = await this.authorization.requireMembership(userId, organizationId);
    const target = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!target) throw new NotFoundException('Membro não encontrado.');
    if (!canManageMembers(actor.role)) throw new ForbiddenException('Você não pode remover membros.');
    if (actor.role === MembershipRole.ADMIN && target.role === MembershipRole.OWNER) {
      throw new ForbiddenException('Administradores não podem remover proprietários.');
    }

    if (requiresAnotherOwner(target.role, null)) {
      const owners = await this.prisma.organizationMembership.count({
        where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      if (owners <= 1) throw new ConflictException('A organização precisa manter ao menos um proprietário.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({
        where: { id: target.id },
        data: { status: MembershipStatus.REMOVED },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'membership.removed',
          entityType: 'OrganizationMembership',
          entityId: target.id,
          metadata: { targetUserId: target.userId, previousRole: target.role },
        },
      });
    });
    return { removed: true };
  }
}
