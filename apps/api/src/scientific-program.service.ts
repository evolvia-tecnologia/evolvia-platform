import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventProfileCode,
  EventStatus,
  Prisma,
  ScientificProgramActivityStatus,
  ScientificSubmissionStatus,
  ScientificTaxonomyLevel,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import {
  AddScientificProgramParticipantDto,
  CreateScientificProgramActivityDto,
  CreateScientificProgramSpaceDto,
  UpdateScientificProgramActivityDto,
  UpdateScientificProgramSpaceDto,
} from './dto';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  invitationStatusWarning,
  programIntervalsOverlap,
  ScientificProgramConflict,
  validateProgramActivityWindow,
  validateProgramParticipationRole,
} from './scientific-program-policy';
import { normalizeScientificText } from './scientific-structure-policy';

const PUBLICATION_CLOSED_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.SUSPENDED,
  EventStatus.FINISHED,
  EventStatus.CANCELLED,
]);

@Injectable()
export class ScientificProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const [spaces, activities, people, taxonomy, acceptedWorks] = await Promise.all([
      this.prisma.scientificProgramSpace.findMany({
        where: scope,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.scientificProgramActivity.findMany({
        where: scope,
        include: {
          space: true,
          participants: {
            include: {
              person: { include: { guestProfile: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          taxonomyArea: true,
          taxonomySubarea: true,
          taxonomyTopic: true,
          submission: { select: { id: true, title: true, status: true, stationPublicCode: true } },
        },
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.scientificPerson.findMany({
        where: { ...scope, status: 'ACTIVE' },
        include: { guestProfile: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.scientificTaxonomyNode.findMany({
        where: { ...scope, active: true },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.scientificSubmission.findMany({
        where: {
          ...scope,
          status: { in: [ScientificSubmissionStatus.ACCEPTED, ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES] },
        },
        select: { id: true, title: true, status: true, stationPublicCode: true },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const conflicts = this.calculateConflicts(event, activities);
    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        format: event.format,
        startDate: event.startDate,
        endDate: event.endDate,
        timeZone: event.timeZone,
        organizationId: event.organizationId,
      },
      summary: {
        spaces: spaces.filter((item) => item.active).length,
        activities: activities.length,
        readyForReview: activities.filter((item) => item.status === ScientificProgramActivityStatus.READY_FOR_REVIEW).length,
        published: activities.filter((item) => item.status === ScientificProgramActivityStatus.PUBLISHED).length,
        blockingConflicts: conflicts.filter((item) => item.severity === 'BLOCKING').length,
        warnings: conflicts.filter((item) => item.severity === 'WARNING').length,
      },
      spaces,
      activities,
      people: people.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        institution: item.institution,
        invitationStatus: item.guestProfile?.invitationStatus ?? null,
      })),
      taxonomy,
      acceptedWorks,
      conflicts,
      nextAction: this.nextAction(spaces, activities, conflicts),
    };
  }

  async createSpace(userId: string, eventId: string, dto: CreateScientificProgramSpaceDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    try {
      await this.prisma.$transaction(async (tx) => {
        const space = await tx.scientificProgramSpace.create({
          data: {
            ...scope,
            name: normalizeScientificText(dto.name, 120),
            kind: dto.kind,
            description: this.optional(dto.description, 500),
            location: this.optional(dto.location, 240),
            capacity: dto.capacity ?? null,
          },
        });
        await this.audit(tx, event, userId, 'scientific.program_space_created', 'ScientificProgramSpace', space.id, {
          kind: space.kind,
          capacity: space.capacity,
        });
      });
    } catch (reason) {
      this.rethrowUnique(reason, 'Já existe um espaço com este nome neste evento.');
    }
    return this.get(userId, eventId);
  }

  async updateSpace(userId: string, eventId: string, spaceId: string, dto: UpdateScientificProgramSpaceDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const space = await this.requireSpace(eventId, event.organizationId!, spaceId);
    const data: Prisma.ScientificProgramSpaceUpdateInput = {};
    if (dto.name !== undefined) data.name = normalizeScientificText(dto.name, 120);
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.description !== undefined) data.description = this.optional(dto.description, 500);
    if (dto.location !== undefined) data.location = this.optional(dto.location, 240);
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.active !== undefined) data.active = dto.active;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.scientificProgramSpace.update({ where: { id: space.id }, data });
        await this.audit(tx, event, userId, 'scientific.program_space_updated', 'ScientificProgramSpace', space.id, {
          changedFields: Object.keys(dto),
        });
      });
    } catch (reason) {
      this.rethrowUnique(reason, 'Já existe um espaço com este nome neste evento.');
    }
    return this.get(userId, eventId);
  }

  async createActivity(userId: string, eventId: string, dto: CreateScientificProgramActivityDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertWindow(event, startAt, endAt);
    await this.validateActivityReferences(scope, dto);
    await this.assertSpaceAvailability(scope, dto.spaceId, startAt, endAt);

    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scientificProgramActivity.create({
        data: {
          ...scope,
          title: normalizeScientificText(dto.title, 180),
          activityType: normalizeScientificText(dto.activityType, 100),
          description: this.optional(dto.description, 1200),
          spaceId: dto.spaceId ?? null,
          startAt,
          endAt,
          taxonomyAreaId: dto.taxonomyAreaId ?? null,
          taxonomySubareaId: dto.taxonomySubareaId ?? null,
          taxonomyTopicId: dto.taxonomyTopicId ?? null,
          operationalNotes: this.optional(dto.operationalNotes, 1200),
        },
      });
      await this.audit(tx, event, userId, 'scientific.program_activity_created', 'ScientificProgramActivity', created.id, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        spaceId: created.spaceId,
      });
      return created;
    });

    return { ...(await this.get(userId, eventId)), createdActivityId: activity.id };
  }

  async updateActivity(
    userId: string,
    eventId: string,
    activityId: string,
    dto: UpdateScientificProgramActivityDto,
  ) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId);
    const startAt = dto.startAt ? new Date(dto.startAt) : activity.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : activity.endAt;
    const spaceId = dto.spaceId === undefined ? activity.spaceId : dto.spaceId;
    this.assertWindow(event, startAt, endAt);
    await this.validateActivityReferences(scope, dto);
    await this.assertSpaceAvailability(scope, spaceId ?? undefined, startAt, endAt, activity.id);
    if (dto.startAt !== undefined || dto.endAt !== undefined) {
      const participants = await this.prisma.scientificProgramParticipant.findMany({
        where: { ...scope, activityId: activity.id },
        select: { personId: true },
      });
      await this.assertPeopleAvailability(
        scope,
        participants.map((participant) => participant.personId),
        startAt,
        endAt,
        activity.id,
      );
    }

    const data: Prisma.ScientificProgramActivityUpdateInput = {
      status: ScientificProgramActivityStatus.DRAFT,
    };
    if (dto.title !== undefined) data.title = normalizeScientificText(dto.title, 180);
    if (dto.activityType !== undefined) data.activityType = normalizeScientificText(dto.activityType, 100);
    if (dto.description !== undefined) data.description = this.optional(dto.description, 1200);
    if (dto.spaceId !== undefined) data.space = { connect: { id: dto.spaceId } };
    if (dto.startAt !== undefined) data.startAt = startAt;
    if (dto.endAt !== undefined) data.endAt = endAt;
    if (dto.taxonomyAreaId !== undefined) data.taxonomyArea = { connect: { id: dto.taxonomyAreaId } };
    if (dto.taxonomySubareaId !== undefined) data.taxonomySubarea = { connect: { id: dto.taxonomySubareaId } };
    if (dto.taxonomyTopicId !== undefined) data.taxonomyTopic = { connect: { id: dto.taxonomyTopicId } };
    if (dto.operationalNotes !== undefined) data.operationalNotes = this.optional(dto.operationalNotes, 1200);

    await this.prisma.$transaction(async (tx) => {
      await tx.scientificProgramActivity.update({ where: { id: activity.id }, data });
      await this.audit(tx, event, userId, 'scientific.program_activity_updated', 'ScientificProgramActivity', activity.id, {
        changedFields: Object.keys(dto),
      });
    });
    return this.get(userId, eventId);
  }

  async addParticipant(
    userId: string,
    eventId: string,
    activityId: string,
    dto: AddScientificProgramParticipantDto,
  ) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId);
    const person = await this.prisma.scientificPerson.findFirst({ where: { id: dto.personId, ...scope } });
    if (!person) throw new BadRequestException('A pessoa selecionada não pertence a este evento científico.');

    const roleConflicts = validateProgramParticipationRole(dto.participationType, dto.customRoleLabel);
    if (roleConflicts.length) throw new BadRequestException(roleConflicts[0].message);
    await this.assertPeopleAvailability(scope, [dto.personId], activity.startAt, activity.endAt, activity.id);

    try {
      await this.prisma.$transaction(async (tx) => {
        const participant = await tx.scientificProgramParticipant.create({
          data: {
            ...scope,
            activityId: activity.id,
            personId: dto.personId,
            participationType: dto.participationType,
            customRoleLabel: this.optional(dto.customRoleLabel, 100),
          },
        });
        await tx.scientificProgramActivity.update({
          where: { id: activity.id },
          data: { status: ScientificProgramActivityStatus.DRAFT },
        });
        await this.audit(tx, event, userId, 'scientific.program_participant_added', 'ScientificProgramParticipant', participant.id, {
          activityId: activity.id,
          personId: dto.personId,
          participationType: dto.participationType,
        });
      });
    } catch (reason) {
      this.rethrowUnique(reason, 'Esta pessoa já possui esta mesma função nesta atividade.');
    }
    return this.get(userId, eventId);
  }

  async removeParticipant(userId: string, eventId: string, activityId: string, participantId: string) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const participant = await this.prisma.scientificProgramParticipant.findFirst({
      where: { id: participantId, activityId, eventId, organizationId: event.organizationId! },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado nesta atividade.');

    await this.prisma.$transaction(async (tx) => {
      await tx.scientificProgramParticipant.delete({ where: { id: participant.id } });
      await tx.scientificProgramActivity.update({
        where: { id: activityId },
        data: { status: ScientificProgramActivityStatus.DRAFT },
      });
      await this.audit(tx, event, userId, 'scientific.program_participant_removed', 'ScientificProgramParticipant', participant.id, {
        activityId,
        personId: participant.personId,
      });
    });
    return this.get(userId, eventId);
  }

  async linkConfirmedWork(userId: string, eventId: string, activityId: string, submissionId: string | null) {
    const event = await this.requireScientificEvent(userId, eventId);
    if (PUBLICATION_CLOSED_EVENT_STATUSES.has(event.status)) {
      throw new ConflictException({
        code: 'INVALID_EVENT_STATE',
        message: 'Não é possível alterar o vínculo científico de um evento suspenso, encerrado ou cancelado.',
        context: { eventStatus: event.status },
      });
    }
    const scope = { eventId, organizationId: event.organizationId! };
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId);
    const nextId = submissionId?.trim() || null;
    if ((activity.submissionId ?? null) === nextId) return this.get(userId, eventId);

    if (nextId) {
      const submission = await this.prisma.scientificSubmission.findFirst({
        where: { id: nextId, ...scope },
        select: { id: true, status: true },
      });
      if (!submission) throw new NotFoundException('Trabalho não encontrado neste evento.');
      if (
        submission.status !== ScientificSubmissionStatus.ACCEPTED
        && submission.status !== ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES
      ) {
        throw new BadRequestException('Só um trabalho aceito ou aceito com ressalvas pode entrar na programação.');
      }
      const taken = await this.prisma.scientificProgramActivity.findFirst({
        where: { ...scope, submissionId: nextId, NOT: { id: activity.id } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Este trabalho já está em outra atividade da programação.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.scientificProgramActivity.update({
          where: { id: activity.id },
          data: nextId
            ? { submission: { connect: { id_eventId_organizationId: { id: nextId, eventId, organizationId: event.organizationId! } } } }
            : { submission: { disconnect: true } },
        });
        await this.audit(
          tx,
          event,
          userId,
          nextId ? 'scientific.program_work_linked' : 'scientific.program_work_unlinked',
          'ScientificProgramActivity',
          activity.id,
          { submissionId: nextId },
        );
      });
    } catch (reason) {
      this.rethrowUnique(reason, 'Este trabalho já está em outra atividade da programação.');
    }
    return this.get(userId, eventId);
  }

  async conflicts(userId: string, eventId: string) {
    const current = await this.get(userId, eventId);
    return { conflicts: current.conflicts, summary: current.summary, nextAction: current.nextAction };
  }

  async markReadyForReview(userId: string, eventId: string, activityId: string) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId, true);
    if (activity.status === ScientificProgramActivityStatus.PUBLISHED) return this.get(userId, eventId);
    const activities = await this.prisma.scientificProgramActivity.findMany({
      where: { eventId, organizationId: event.organizationId! },
      include: {
        space: true,
        participants: { include: { person: { include: { guestProfile: true } } } },
        taxonomyArea: true,
        taxonomySubarea: true,
        taxonomyTopic: true,
      },
    });
    const blocking = this.calculateConflicts(event, activities).filter(
      (item) => item.severity === 'BLOCKING' && item.entityIds?.includes(activity.id),
    );
    if (blocking.length) {
      throw new ConflictException({
        code: 'PROGRAM_CONFLICTS_BLOCK_REVIEW',
        message: 'Resolva os conflitos bloqueantes desta atividade antes de marcá-la como pronta para revisão.',
        conflicts: blocking,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scientificProgramActivity.update({
        where: { id: activity.id },
        data: { status: ScientificProgramActivityStatus.READY_FOR_REVIEW },
      });
      await this.audit(tx, event, userId, 'scientific.program_activity_ready_for_review', 'ScientificProgramActivity', activity.id, {});
    });
    return this.get(userId, eventId);
  }

  async publishActivity(userId: string, eventId: string, activityId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    if (PUBLICATION_CLOSED_EVENT_STATUSES.has(event.status)) {
      throw new ConflictException({
        code: 'INVALID_EVENT_STATE',
        message: 'Não é possível publicar atividades de um evento suspenso, encerrado ou cancelado.',
        context: { eventStatus: event.status },
      });
    }
    const scope = { eventId, organizationId: event.organizationId! };
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId);
    if (activity.status === ScientificProgramActivityStatus.PUBLISHED) return this.get(userId, eventId);
    if (activity.status !== ScientificProgramActivityStatus.READY_FOR_REVIEW) {
      throw new ConflictException({
        code: 'PROGRAM_ACTIVITY_NOT_REVIEWED',
        message: 'Marque a atividade como pronta para revisão antes de publicá-la na página do evento.',
      });
    }
    const activities = await this.prisma.scientificProgramActivity.findMany({
      where: scope,
      include: {
        space: true,
        participants: { include: { person: { include: { guestProfile: true } } } },
      },
    });
    const blocking = this.calculateConflicts(event, activities).filter(
      (item) => item.severity === 'BLOCKING' && item.entityIds?.includes(activity.id),
    );
    if (blocking.length) {
      throw new ConflictException({
        code: 'PROGRAM_CONFLICTS_BLOCK_PUBLICATION',
        message: 'Resolva os conflitos bloqueantes desta atividade antes de publicá-la.',
        conflicts: blocking,
      });
    }

    await this.transitionActivity(event, userId, activity.id, {
      from: ScientificProgramActivityStatus.READY_FOR_REVIEW,
      to: ScientificProgramActivityStatus.PUBLISHED,
      action: 'scientific.program_activity_published',
    });
    return this.get(userId, eventId);
  }

  async unpublishActivity(userId: string, eventId: string, activityId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const activity = await this.requireActivity(eventId, event.organizationId!, activityId);
    if (activity.status !== ScientificProgramActivityStatus.PUBLISHED) return this.get(userId, eventId);
    await this.transitionActivity(event, userId, activity.id, {
      from: ScientificProgramActivityStatus.PUBLISHED,
      to: ScientificProgramActivityStatus.READY_FOR_REVIEW,
      action: 'scientific.program_activity_unpublished',
    });
    return this.get(userId, eventId);
  }

  private async transitionActivity(
    event: { id: string; organizationId: string | null },
    userId: string,
    activityId: string,
    change: { from: ScientificProgramActivityStatus; to: ScientificProgramActivityStatus; action: string },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.scientificProgramActivity.updateMany({
        where: { id: activityId, eventId: event.id, organizationId: event.organizationId!, status: change.from },
        data: { status: change.to },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'PROGRAM_ACTIVITY_CHANGED',
          message: 'A atividade foi alterada por outra pessoa. Atualize a programação e tente novamente.',
        });
      }
      await this.audit(tx, event, userId, change.action, 'ScientificProgramActivity', activityId, {
        from: change.from,
        to: change.to,
      });
    });
  }

  private calculateConflicts(event: any, activities: any[]): ScientificProgramConflict[] {
    const conflicts: ScientificProgramConflict[] = [];
    const seen = new Set<string>();

    for (const activity of activities) {
      for (const conflict of validateProgramActivityWindow({
        startAt: activity.startAt,
        endAt: activity.endAt,
        eventStart: event.startDate,
        eventEnd: event.endDate,
      })) {
        conflicts.push({ ...conflict, entityIds: [activity.id] });
      }

      for (const participant of activity.participants) {
        const roleConflicts = validateProgramParticipationRole(participant.participationType, participant.customRoleLabel);
        for (const conflict of roleConflicts) conflicts.push({ ...conflict, entityIds: [activity.id, participant.id] });
        const warning = invitationStatusWarning(participant.person.guestProfile?.invitationStatus ?? null);
        if (warning) conflicts.push({ ...warning, entityIds: [activity.id, participant.personId] });
      }
    }

    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      for (let j = i + 1; j < activities.length; j += 1) {
        const b = activities[j];
        if (!programIntervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) continue;

        if (a.spaceId && a.spaceId === b.spaceId) {
          const key = `space:${a.id}:${b.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              code: 'SPACE_OVERLAP',
              severity: 'BLOCKING',
              message: `O espaço “${a.space?.name ?? 'selecionado'}” está ocupado por duas atividades no mesmo horário.`,
              suggestion: 'Altere o horário ou escolha outro espaço para uma das atividades.',
              entityIds: [a.id, b.id, a.spaceId],
            });
          }
        }

        const peopleA = new Set(a.participants.map((item: any) => item.personId));
        for (const participant of b.participants) {
          if (!peopleA.has(participant.personId)) continue;
          const key = `person:${participant.personId}:${a.id}:${b.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          conflicts.push({
            code: 'PERSON_OVERLAP',
            severity: 'BLOCKING',
            message: `A pessoa “${participant.person.name}” está em duas atividades com horários sobrepostos.`,
            suggestion: 'Ajuste o horário ou substitua o participante em uma das atividades.',
            entityIds: [a.id, b.id, participant.personId],
          });
        }
      }
    }

    return conflicts;
  }

  private async assertSpaceAvailability(
    scope: { eventId: string; organizationId: string },
    spaceId: string | undefined,
    startAt: Date,
    endAt: Date,
    ignoreActivityId?: string,
  ) {
    if (!spaceId) return;
    const space = await this.requireSpace(scope.eventId, scope.organizationId, spaceId);
    if (!space.active) throw new BadRequestException('Escolha um espaço ativo para a atividade.');
    const candidates = await this.prisma.scientificProgramActivity.findMany({
      where: {
        ...scope,
        spaceId,
        ...(ignoreActivityId ? { id: { not: ignoreActivityId } } : {}),
      },
      select: { id: true, title: true, startAt: true, endAt: true },
    });
    const conflict = candidates.find((item) => programIntervalsOverlap(startAt, endAt, item.startAt, item.endAt));
    if (conflict) {
      throw new ConflictException(`Este espaço já está ocupado pela atividade “${conflict.title}” no horário informado.`);
    }
  }

  private async assertPeopleAvailability(
    scope: { eventId: string; organizationId: string },
    personIds: string[],
    startAt: Date,
    endAt: Date,
    ignoreActivityId?: string,
  ) {
    const uniquePersonIds = [...new Set(personIds)];
    if (!uniquePersonIds.length) return;
    const participations = await this.prisma.scientificProgramParticipant.findMany({
      where: {
        ...scope,
        personId: { in: uniquePersonIds },
        ...(ignoreActivityId ? { activityId: { not: ignoreActivityId } } : {}),
      },
      select: {
        activity: { select: { title: true, startAt: true, endAt: true } },
        person: { select: { name: true } },
      },
    });
    const conflict = participations.find((item) =>
      programIntervalsOverlap(startAt, endAt, item.activity.startAt, item.activity.endAt),
    );
    if (conflict) {
      throw new ConflictException(
        `A pessoa “${conflict.person.name}” já participa da atividade “${conflict.activity.title}” no mesmo horário.`,
      );
    }
  }

  private assertWindow(event: any, startAt: Date, endAt: Date) {
    const conflicts = validateProgramActivityWindow({
      startAt,
      endAt,
      eventStart: event.startDate,
      eventEnd: event.endDate,
    });
    if (conflicts.length) throw new BadRequestException(conflicts[0].message);
  }

  private async validateActivityReferences(
    scope: { eventId: string; organizationId: string },
    dto: Partial<CreateScientificProgramActivityDto>,
  ) {
    if (dto.spaceId) await this.requireSpace(scope.eventId, scope.organizationId, dto.spaceId);
    const expected: Array<[string | undefined, ScientificTaxonomyLevel]> = [
      [dto.taxonomyAreaId, ScientificTaxonomyLevel.AREA],
      [dto.taxonomySubareaId, ScientificTaxonomyLevel.SUBAREA],
      [dto.taxonomyTopicId, ScientificTaxonomyLevel.TOPIC],
    ];
    for (const [id, level] of expected) {
      if (!id) continue;
      const node = await this.prisma.scientificTaxonomyNode.findFirst({ where: { id, ...scope, level, active: true } });
      if (!node) throw new BadRequestException('A classificação científica selecionada não pertence a este evento ou não corresponde ao nível esperado.');
    }
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A programação científica está disponível apenas para eventos técnico-científicos.');
    }
    if (!event.organizationId) {
      throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    }
    return event;
  }

  private async requireSpace(eventId: string, organizationId: string, spaceId: string) {
    const space = await this.prisma.scientificProgramSpace.findFirst({ where: { id: spaceId, eventId, organizationId } });
    if (!space) throw new NotFoundException('Espaço não encontrado neste evento.');
    return space;
  }

  private async requireActivity(eventId: string, organizationId: string, activityId: string, includeParticipants = false): Promise<any> {
    const activity = await this.prisma.scientificProgramActivity.findFirst({
      where: { id: activityId, eventId, organizationId },
      ...(includeParticipants ? { include: { participants: true } } : {}),
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada nesta programação.');
    return activity;
  }

  private nextAction(spaces: any[], activities: any[], conflicts: ScientificProgramConflict[]): string {
    if (!spaces.some((item) => item.active)) return 'Cadastre o primeiro espaço ou ambiente da programação.';
    if (!activities.length) return 'Crie a primeira atividade escolhendo quando, onde e o que acontece.';
    if (conflicts.some((item) => item.severity === 'BLOCKING')) return 'Revise os conflitos bloqueantes antes de marcar atividades como prontas.';
    if (activities.some((item) => item.status === ScientificProgramActivityStatus.DRAFT)) return 'Revise as atividades em rascunho e marque as que estiverem prontas.';
    if (activities.some((item) => item.status === ScientificProgramActivityStatus.READY_FOR_REVIEW)) return 'Publique na página do evento as atividades revisadas que o público já pode ver.';
    return 'A programação está pronta para a próxima etapa de revisão do evento.';
  }

  private optional(value: string | undefined, maxLength: number): string | null {
    if (!value) return null;
    const normalized = normalizeScientificText(value, maxLength);
    return normalized || null;
  }

  private rethrowUnique(reason: unknown, message: string): never | void {
    if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw reason;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    event: { id: string; organizationId: string | null },
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId!,
        eventId: event.id,
        actorUserId,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }
}

