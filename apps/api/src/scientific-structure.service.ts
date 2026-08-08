import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificTaxonomyLevel,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import {
  AddScientificCommitteeMemberDto,
  AssignScientificPersonRoleDto,
  CreateScientificCommitteeDto,
  CreateScientificPersonDto,
  CreateScientificRoleDto,
  CreateScientificTaxonomyNodeDto,
} from './dto';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  normalizeScientificText,
  scientificCodeBase,
  taxonomyParentError,
} from './scientific-structure-policy';

@Injectable()
export class ScientificStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);

    const [people, roles, committees, taxonomy] = await Promise.all([
      this.prisma.scientificPerson.findMany({
        where: { eventId, organizationId: event.organizationId! },
        include: {
          roleAssignments: { include: { role: true }, orderBy: { createdAt: 'asc' } },
          committeeMemberships: {
            include: { committee: true, role: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.scientificRole.findMany({
        where: { eventId, organizationId: event.organizationId! },
        orderBy: { label: 'asc' },
      }),
      this.prisma.scientificCommittee.findMany({
        where: { eventId, organizationId: event.organizationId! },
        include: {
          memberships: {
            include: { person: true, role: true },
            orderBy: [{ isChair: 'desc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.scientificTaxonomyNode.findMany({
        where: { eventId, organizationId: event.organizationId! },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        profileCode: event.profileCode,
        organizationId: event.organizationId,
        organization: event.organization,
      },
      summary: {
        people: people.length,
        roles: roles.length,
        committees: committees.length,
        areas: taxonomy.filter((item) => item.level === ScientificTaxonomyLevel.AREA).length,
        subareas: taxonomy.filter((item) => item.level === ScientificTaxonomyLevel.SUBAREA).length,
        topics: taxonomy.filter((item) => item.level === ScientificTaxonomyLevel.TOPIC).length,
      },
      people,
      roles,
      committees,
      taxonomy,
    };
  }

  async createPerson(userId: string, eventId: string, dto: CreateScientificPersonDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const data = {
      organizationId: event.organizationId!,
      eventId,
      name: normalizeScientificText(dto.name, 120),
      email: dto.email ? dto.email.trim().toLowerCase() : null,
      institution: this.optional(dto.institution, 160),
      orcid: this.optional(dto.orcid, 32),
      notes: this.optional(dto.notes, 500),
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const person = await tx.scientificPerson.create({ data });
        await this.audit(tx, event, userId, 'scientific.structure.person_created', 'ScientificPerson', person.id, {
          name: person.name,
        });
      });
    } catch (reason) {
      this.rethrowKnownConflict(reason, 'Já existe uma pessoa com este e-mail neste evento.');
    }

    return this.get(userId, eventId);
  }

  async createRole(userId: string, eventId: string, dto: CreateScientificRoleDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const label = normalizeScientificText(dto.label, 100);
    const code = this.internalCode(label);

    await this.prisma.$transaction(async (tx) => {
      const role = await tx.scientificRole.create({
        data: {
          organizationId: event.organizationId!,
          eventId,
          code,
          label,
          description: this.optional(dto.description, 300),
        },
      });
      await this.audit(tx, event, userId, 'scientific.structure.role_created', 'ScientificRole', role.id, {
        label: role.label,
      });
    });

    return this.get(userId, eventId);
  }

  async assignRole(userId: string, eventId: string, dto: AssignScientificPersonRoleDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };

    const [person, role] = await Promise.all([
      this.prisma.scientificPerson.findFirst({ where: { id: dto.personId, ...scope } }),
      this.prisma.scientificRole.findFirst({ where: { id: dto.roleId, ...scope } }),
    ]);
    if (!person || !role) throw new BadRequestException('Pessoa ou papel não pertence a este evento científico.');

    try {
      await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.scientificPersonRole.create({
          data: {
            ...scope,
            personId: person.id,
            roleId: role.id,
          },
        });
        await this.audit(tx, event, userId, 'scientific.structure.role_assigned', 'ScientificPersonRole', assignment.id, {
          personId: person.id,
          roleId: role.id,
        });
      });
    } catch (reason) {
      this.rethrowKnownConflict(reason, 'Esta pessoa já possui este papel no evento.');
    }

    return this.get(userId, eventId);
  }

  async createCommittee(userId: string, eventId: string, dto: CreateScientificCommitteeDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const name = normalizeScientificText(dto.name, 120);

    await this.prisma.$transaction(async (tx) => {
      const committee = await tx.scientificCommittee.create({
        data: {
          organizationId: event.organizationId!,
          eventId,
          code: this.internalCode(name),
          name,
          description: this.optional(dto.description, 500),
        },
      });
      await this.audit(tx, event, userId, 'scientific.structure.committee_created', 'ScientificCommittee', committee.id, {
        name: committee.name,
      });
    });

    return this.get(userId, eventId);
  }

  async addCommitteeMember(userId: string, eventId: string, dto: AddScientificCommitteeMemberDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };

    const [committee, person, role] = await Promise.all([
      this.prisma.scientificCommittee.findFirst({ where: { id: dto.committeeId, ...scope } }),
      this.prisma.scientificPerson.findFirst({ where: { id: dto.personId, ...scope } }),
      dto.roleId
        ? this.prisma.scientificRole.findFirst({ where: { id: dto.roleId, ...scope } })
        : Promise.resolve(null),
    ]);

    if (!committee || !person || (dto.roleId && !role)) {
      throw new BadRequestException('Comissão, pessoa ou papel não pertence a este evento científico.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const membership = await tx.scientificCommitteeMembership.create({
          data: {
            ...scope,
            committeeId: committee.id,
            personId: person.id,
            roleId: role?.id ?? null,
            isChair: dto.isChair === true,
          },
        });
        await this.audit(tx, event, userId, 'scientific.structure.committee_member_added', 'ScientificCommitteeMembership', membership.id, {
          committeeId: committee.id,
          personId: person.id,
          roleId: role?.id ?? null,
          isChair: membership.isChair,
        });
      });
    } catch (reason) {
      this.rethrowKnownConflict(reason, 'Esta pessoa já participa desta comissão.');
    }

    return this.get(userId, eventId);
  }

  async createTaxonomyNode(userId: string, eventId: string, dto: CreateScientificTaxonomyNodeDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const parent = dto.parentId
      ? await this.prisma.scientificTaxonomyNode.findFirst({ where: { id: dto.parentId, ...scope } })
      : null;

    if (dto.parentId && !parent) throw new BadRequestException('O item pai não pertence a este evento científico.');
    const hierarchyError = taxonomyParentError(dto.level, parent?.level);
    if (hierarchyError) throw new BadRequestException(hierarchyError);

    const name = normalizeScientificText(dto.name, 140);
    await this.prisma.$transaction(async (tx) => {
      const node = await tx.scientificTaxonomyNode.create({
        data: {
          ...scope,
          parentId: parent?.id ?? null,
          level: dto.level,
          code: this.internalCode(name),
          name,
          description: this.optional(dto.description, 500),
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.audit(tx, event, userId, 'scientific.structure.taxonomy_created', 'ScientificTaxonomyNode', node.id, {
        name: node.name,
        level: node.level,
        parentId: node.parentId,
      });
    });

    return this.get(userId, eventId);
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    if (!event) throw new NotFoundException('Evento não encontrado.');

    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A estrutura científica está disponível apenas para eventos técnico-científicos.');
    }
    if (!event.organizationId) {
      throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    }

    return event;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    event: { id: string; organizationId: string | null },
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId!,
        actorUserId: userId,
        eventId: event.id,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }

  private optional(value: string | undefined, maxLength: number): string | null {
    if (!value) return null;
    const normalized = normalizeScientificText(value, maxLength);
    return normalized || null;
  }

  private internalCode(label: string): string {
    return `${scientificCodeBase(label)}_${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private rethrowKnownConflict(reason: unknown, message: string): never {
    if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw reason;
  }
}
