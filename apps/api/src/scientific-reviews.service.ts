import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificReviewAssignmentStatus,
  ScientificReviewConflictStatus,
  ScientificReviewMode,
  ScientificSubmissionStatus,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  calculateReviewScore,
  hasObjectiveAuthorshipConflict,
} from './scientific-review-policy';
import { normalizeScientificText } from './scientific-structure-policy';

export type CreateScientificReviewCriterionInput = {
  label: string;
  description?: string;
  sortOrder?: number;
  required?: boolean;
  minScore: number;
  maxScore: number;
  weight?: number;
};

export type CreateScientificReviewAssignmentInput = {
  submissionId: string;
  versionId: string;
  reviewerPersonId: string;
  assignmentRound?: number;
  dueAt?: string;
};

type Scope = { eventId: string; organizationId: string };

/**
 * Superfície administrativa do Gate A7.
 *
 * A comissão configura critérios, distribui trabalhos e acompanha resultados.
 * Preencher conflito, notas e parecer é responsabilidade do avaliador em área própria.
 * O portal do avaliador só deve ser registrado quando houver identidade externa segura.
 */
@Injectable()
export class ScientificReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async getManagement(userId: string, eventId: string) {
    const event = await this.requireEditor(userId, eventId);
    const scope: Scope = { eventId, organizationId: event.organizationId! };
    const [config, criteria, assignments, people, submissions] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } }),
      this.prisma.scientificReviewCriterion.findMany({
        where: scope,
        orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.scientificReviewAssignment.findMany({
        where: scope,
        include: {
          reviewer: true,
          submission: { include: { authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } } } },
          version: true,
          review: { include: { scores: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.scientificPerson.findMany({ where: { ...scope, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.scientificSubmission.findMany({
        where: { ...scope, status: { in: [ScientificSubmissionStatus.SUBMITTED, ScientificSubmissionStatus.UNDER_REVIEW] } },
        include: {
          versions: { orderBy: { versionNumber: 'desc' } },
          authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const reviewRules = {
      reviewersPerSubmission: config?.reviewersPerSubmission ?? null,
      coordinatorDecidesStatus: config?.coordinatorDecidesStatus ?? false,
      evaluationStyle: config?.evaluationStyle ?? 'ANALYTIC' as const,
    };
    const synthetic = reviewRules.evaluationStyle === 'SYNTHETIC';
    return {
      event: { id: event.id, name: event.name, status: event.status, organizationId: event.organizationId },
      reviewMode: config?.reviewMode ?? ScientificReviewMode.SINGLE_BLIND,
      reviewRules,
      criteria,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        weightedScore: assignment.review
          ? calculateReviewScore(
              synthetic ? 'SYNTHETIC' : 'ANALYTIC',
              criteria,
              assignment.review.scores.map((score) => ({ criterionId: score.criterionId, value: score.value })),
            )
          : null,
      })),
      people,
      submissions,
      summary: {
        criteria: criteria.filter((item) => item.active).length,
        assigned: assignments.filter((item) => item.status === ScientificReviewAssignmentStatus.ASSIGNED).length,
        inProgress: assignments.filter((item) => item.status === ScientificReviewAssignmentStatus.IN_PROGRESS).length,
        submitted: assignments.filter((item) => item.status === ScientificReviewAssignmentStatus.SUBMITTED).length,
        conflicts: assignments.filter((item) => item.conflictStatus === ScientificReviewConflictStatus.CONFLICT).length,
      },
      actorBoundary: {
        management: 'ORGANIZER_COMMITTEE',
        reviewerActionsAvailableHere: false,
        message: 'A comissão configura, distribui e acompanha. Conflito, notas e parecer são preenchidos pelo avaliador em área própria.',
      },
      nextAction: synthetic
        ? assignments.length
          ? 'Acompanhe o andamento e os conflitos informados pelos avaliadores sem editar pareceres em nome deles.'
          : 'Distribua as versões submetidas. Cada avaliador informa uma nota de 0 a 10, sem critérios separados.'
        : criteria.some((item) => item.active)
          ? assignments.length
            ? 'Acompanhe o andamento e os conflitos informados pelos avaliadores sem editar pareceres em nome deles.'
            : 'Distribua versões submetidas aos avaliadores elegíveis.'
          : 'Cadastre os critérios de avaliação antes de distribuir trabalhos.',
    };
  }

  async createCriterion(userId: string, eventId: string, dto: CreateScientificReviewCriterionInput) {
    const event = await this.requireMutableEditor(userId, eventId);
    const scope: Scope = { eventId, organizationId: event.organizationId! };
    if (!Number.isFinite(dto.minScore) || !Number.isFinite(dto.maxScore) || dto.minScore > dto.maxScore) {
      throw new BadRequestException('Informe uma escala válida, com nota mínima menor ou igual à máxima.');
    }
    const weight = dto.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new BadRequestException('O peso do critério deve ser maior que zero.');
    const label = normalizeScientificText(dto.label, 160);
    const code = this.slug(label);

    try {
      await this.prisma.$transaction(async (tx) => {
        const criterion = await tx.scientificReviewCriterion.create({
          data: {
            ...scope,
            code,
            label,
            description: this.optional(dto.description, 800),
            sortOrder: dto.sortOrder ?? 0,
            required: dto.required ?? true,
            minScore: dto.minScore,
            maxScore: dto.maxScore,
            weight,
          },
        });
        await this.audit(tx, event, userId, 'scientific.review_criterion_created', 'ScientificReviewCriterion', criterion.id, {
          code,
          minScore: dto.minScore,
          maxScore: dto.maxScore,
          weight,
        });
      });
    } catch (reason) {
      if (this.isUnique(reason)) throw new BadRequestException('Já existe um critério com este nome neste evento.');
      throw reason;
    }

    return this.getManagement(userId, eventId);
  }

  async createAssignment(userId: string, eventId: string, dto: CreateScientificReviewAssignmentInput) {
    const event = await this.requireMutableEditor(userId, eventId);
    const scope: Scope = { eventId, organizationId: event.organizationId! };
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { ...scope, id: dto.submissionId },
      include: { authors: true },
    });
    if (!submission || (submission.status !== ScientificSubmissionStatus.SUBMITTED && submission.status !== ScientificSubmissionStatus.UNDER_REVIEW)) {
      throw new BadRequestException('Somente trabalhos submetidos podem ser distribuídos para avaliação.');
    }

    const version = await this.prisma.scientificSubmissionVersion.findFirst({
      where: { ...scope, id: dto.versionId, submissionId: submission.id },
    });
    if (!version) throw new BadRequestException('A versão selecionada não pertence a este trabalho.');

    const reviewer = await this.prisma.scientificPerson.findFirst({
      where: { ...scope, id: dto.reviewerPersonId, status: 'ACTIVE' },
    });
    if (!reviewer) throw new BadRequestException('O avaliador selecionado não pertence a este evento.');
    if (!reviewer.email) throw new BadRequestException('O avaliador precisa ter um canal de contato cadastrado antes da distribuição.');
    if (hasObjectiveAuthorshipConflict(reviewer.id, submission.authors.map((author) => author.personId))) {
      throw new BadRequestException('Este avaliador é autor do próprio trabalho e não pode receber esta atribuição.');
    }

    const assignmentRound = dto.assignmentRound ?? 1;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (assignmentRound < 1) throw new BadRequestException('A rodada da avaliação deve começar em 1.');
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('Informe um prazo de avaliação válido.');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "ScientificSubmission"
          WHERE "id" = ${submission.id} AND "eventId" = ${eventId}
            AND "organizationId" = ${scope.organizationId}
          FOR UPDATE
        `);
        const active = await tx.scientificReviewAssignment.findFirst({
          where: {
            ...scope,
            submissionId: submission.id,
            versionId: version.id,
            reviewerPersonId: reviewer.id,
            status: { in: [ScientificReviewAssignmentStatus.ASSIGNED, ScientificReviewAssignmentStatus.IN_PROGRESS] },
          },
        });
        if (active) throw new BadRequestException('Este avaliador já possui uma atribuição ativa para esta versão do trabalho.');
    
        const config = await tx.scientificSubmissionConfig.findUnique({
          where: { eventId_organizationId: scope },
          select: { reviewersPerSubmission: true },
        });
        if (config?.reviewersPerSubmission != null) {
          const assigned = await tx.scientificReviewAssignment.count({
            where: {
              ...scope,
              submissionId: submission.id,
              versionId: version.id,
              status: { not: ScientificReviewAssignmentStatus.CANCELLED },
            },
          });
          if (assigned >= config.reviewersPerSubmission) {
            throw new BadRequestException(`Este trabalho já possui ${config.reviewersPerSubmission} avaliador(es), que é o limite configurado.`);
          }
        }
    
        const assignment = await tx.scientificReviewAssignment.create({
          data: {
            ...scope,
            submissionId: submission.id,
            versionId: version.id,
            reviewerPersonId: reviewer.id,
            assignmentRound,
            dueAt,
            conflictStatus: ScientificReviewConflictStatus.PENDING,
          },
        });
        if (submission.status === ScientificSubmissionStatus.SUBMITTED) {
          await tx.scientificSubmission.update({
            where: { id: submission.id },
            data: { status: ScientificSubmissionStatus.UNDER_REVIEW },
          });
          await this.audit(tx, event, userId, 'scientific.submission_review_started', 'ScientificSubmission', submission.id, {
            assignmentId: assignment.id,
            versionId: version.id,
          });
        }
        await this.audit(tx, event, userId, 'scientific.review_assignment_created', 'ScientificReviewAssignment', assignment.id, {
          submissionId: submission.id,
          versionId: version.id,
          reviewerPersonId: reviewer.id,
          assignmentRound,
        });
      });
    } catch (reason) {
      if (this.isUnique(reason)) throw new BadRequestException('Esta atribuição já existe nesta rodada.');
      throw reason;
    }

    return this.getManagement(userId, eventId);
  }

  private async requireEditor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (!event.organizationId) throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A avaliação científica está disponível apenas para eventos técnico-científicos.');
    }
    return event;
  }

  private async requireMutableEditor(userId: string, eventId: string) {
    const event = await this.requireEditor(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private optional(value: string | undefined, maxLength: number) {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private slug(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
  }

  private isUnique(reason: unknown) {
    return reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2002';
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

