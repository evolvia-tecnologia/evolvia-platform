import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificReviewAssignmentStatus,
  ScientificReviewConflictStatus,
  ScientificReviewMode,
  ScientificReviewRecommendation,
  ScientificSubmissionStatus,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  calculateWeightedReviewScore,
  canMutateReview,
  canTransitionReviewAssignment,
  hasObjectiveAuthorshipConflict,
  validateReviewForSubmit,
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

export type DeclareScientificReviewConflictInput = {
  hasConflict: boolean;
  reason?: string;
};

export type ScientificReviewScoreInput = {
  criterionId: string;
  value: number;
  comment?: string;
};

export type SaveScientificReviewInput = {
  recommendation?: ScientificReviewRecommendation;
  authorComment?: string;
  confidentialComment?: string;
  scores: ScientificReviewScoreInput[];
};

type Scope = { eventId: string; organizationId: string };

@Injectable()
export class ScientificReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async getManagement(userId: string, eventId: string) {
    const event = await this.requireScientificEventForEditor(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const [config, criteria, assignments, people, submissions] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } }),
      this.prisma.scientificReviewCriterion.findMany({ where: scope, orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }] }),
      this.prisma.scientificReviewAssignment.findMany({
        where: scope,
        include: {
          reviewer: true,
          submission: { include: { authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } } } },
          version: true,
          review: { include: { scores: { include: { criterion: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.scientificPerson.findMany({ where: { ...scope, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.scientificSubmission.findMany({
        where: { ...scope, status: { in: [ScientificSubmissionStatus.SUBMITTED, ScientificSubmissionStatus.UNDER_REVIEW] } },
        include: { versions: { orderBy: { versionNumber: 'desc' } }, authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      event: { id: event.id, name: event.name, status: event.status, organizationId: event.organizationId },
      reviewMode: config?.reviewMode ?? ScientificReviewMode.SINGLE_BLIND,
      criteria,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        weightedScore: assignment.review
          ? calculateWeightedReviewScore(
              criteria.filter((criterion) => criterion.active).map((criterion) => ({ ...criterion })),
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
      nextAction: criteria.some((item) => item.active)
        ? assignments.length
          ? 'Acompanhe os pareceres e conflitos declarados sem transformar recomendação em decisão final.'
          : 'Distribua os trabalhos submetidos aos avaliadores elegíveis.'
        : 'Cadastre os critérios de avaliação antes de distribuir trabalhos.',
    };
  }

  async createCriterion(userId: string, eventId: string, dto: CreateScientificReviewCriterionInput) {
    const event = await this.requireMutableScientificEventForEditor(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    if (!Number.isFinite(dto.minScore) || !Number.isFinite(dto.maxScore) || dto.minScore > dto.maxScore) {
      throw new BadRequestException('Informe uma escala válida, com nota mínima menor ou igual à máxima.');
    }
    const weight = dto.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new BadRequestException('O peso do critério deve ser maior que zero.');
    const label = normalizeScientificText(dto.label, 160);
    const code = this.slug(label);
    if (!code) throw new BadRequestException('Informe um nome válido para o critério.');

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
    const event = await this.requireMutableScientificEventForEditor(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { ...scope, id: dto.submissionId },
      include: { authors: true },
    });
    if (!submission || ![ScientificSubmissionStatus.SUBMITTED, ScientificSubmissionStatus.UNDER_REVIEW].includes(submission.status)) {
      throw new BadRequestException('Somente trabalhos submetidos podem ser distribuídos para avaliação.');
    }
    const version = await this.prisma.scientificSubmissionVersion.findFirst({
      where: { ...scope, id: dto.versionId, submissionId: submission.id },
    });
    if (!version) throw new BadRequestException('A versão selecionada não pertence a este trabalho.');
    const reviewer = await this.prisma.scientificPerson.findFirst({ where: { ...scope, id: dto.reviewerPersonId, status: 'ACTIVE' } });
    if (!reviewer) throw new BadRequestException('O avaliador selecionado não pertence a este evento.');
    if (!reviewer.email) throw new BadRequestException('O avaliador precisa ter e-mail para acessar o parecer de forma autenticada.');
    if (hasObjectiveAuthorshipConflict(reviewer.id, submission.authors.map((author) => author.personId))) {
      throw new BadRequestException('Este avaliador é autor do próprio trabalho e não pode receber esta atribuição.');
    }
    const active = await this.prisma.scientificReviewAssignment.findFirst({
      where: {
        ...scope,
        submissionId: submission.id,
        versionId: version.id,
        reviewerPersonId: reviewer.id,
        status: { in: [ScientificReviewAssignmentStatus.ASSIGNED, ScientificReviewAssignmentStatus.IN_PROGRESS] },
      },
    });
    if (active) throw new BadRequestException('Este avaliador já possui uma atribuição ativa para esta versão do trabalho.');
    const assignmentRound = dto.assignmentRound ?? 1;
    if (assignmentRound < 1) throw new BadRequestException('A rodada da avaliação deve começar em 1.');
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('Informe um prazo de avaliação válido.');

    try {
      await this.prisma.$transaction(async (tx) => {
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
          await tx.scientificSubmission.update({ where: { id: submission.id }, data: { status: ScientificSubmissionStatus.UNDER_REVIEW } });
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

  async getReviewerWorkspace(userId: string, email: string, eventId: string) {
    const { event, person, scope } = await this.requireReviewerIdentity(userId, email, eventId);
    const config = await this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } });
    const reviewMode = config?.reviewMode ?? ScientificReviewMode.SINGLE_BLIND;
    const criteria = await this.prisma.scientificReviewCriterion.findMany({
      where: { ...scope, active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const assignments = await this.prisma.scientificReviewAssignment.findMany({
      where: { ...scope, reviewerPersonId: person.id },
      include: {
        version: true,
        submission: { include: { authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } } } },
        review: { include: { scores: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      event: { id: event.id, name: event.name },
      reviewer: { id: person.id, name: person.name },
      reviewMode,
      criteria,
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        conflictStatus: assignment.conflictStatus,
        conflictReason: assignment.conflictReason,
        dueAt: assignment.dueAt,
        assignmentRound: assignment.assignmentRound,
        version: {
          id: assignment.version.id,
          versionNumber: assignment.version.versionNumber,
          title: assignment.version.title,
          abstractText: assignment.version.abstractText,
          keywords: assignment.version.keywords,
          fileAvailable: Boolean(assignment.version.fileKey),
        },
        authors: reviewMode === ScientificReviewMode.DOUBLE_BLIND
          ? []
          : assignment.submission.authors.map((author) => ({
              name: author.person.name,
              institution: author.person.institution,
              order: author.sortOrder,
            })),
        review: assignment.review ? {
          recommendation: assignment.review.recommendation,
          authorComment: assignment.review.authorComment,
          confidentialComment: assignment.review.confidentialComment,
          submittedAt: assignment.review.submittedAt,
          scores: assignment.review.scores,
          weightedScore: calculateWeightedReviewScore(criteria, assignment.review.scores.map((score) => ({ criterionId: score.criterionId, value: score.value }))),
        } : null,
      })),
      privacyNotice: reviewMode === ScientificReviewMode.DOUBLE_BLIND
        ? 'A autoria e a instituição foram removidas desta visão pelo servidor para preservar a avaliação duplo-cega.'
        : reviewMode === ScientificReviewMode.SINGLE_BLIND
          ? 'Você pode visualizar a autoria; sua identidade não deve ser exposta ao autor nesta etapa.'
          : 'A avaliação está configurada como aberta.',
    };
  }

  async declareConflict(userId: string, email: string, eventId: string, assignmentId: string, dto: DeclareScientificReviewConflictInput) {
    const { event, person, scope } = await this.requireReviewerIdentity(userId, email, eventId);
    const assignment = await this.requireReviewerAssignment(scope, person.id, assignmentId);
    if (!canMutateReview(assignment.status)) throw new BadRequestException('Esta avaliação já foi encerrada e não pode ser alterada.');
    const reason = this.optional(dto.reason, 1000);
    if (dto.hasConflict && !reason) throw new BadRequestException('Descreva o conflito de interesse para que a comissão possa tratá-lo.');
    await this.prisma.$transaction(async (tx) => {
      await tx.scientificReviewAssignment.update({
        where: { id: assignment.id },
        data: {
          conflictStatus: dto.hasConflict ? ScientificReviewConflictStatus.CONFLICT : ScientificReviewConflictStatus.CLEAR,
          conflictReason: dto.hasConflict ? reason : null,
        },
      });
      await this.audit(tx, event, userId, 'scientific.review_conflict_declared', 'ScientificReviewAssignment', assignment.id, {
        conflictStatus: dto.hasConflict ? ScientificReviewConflictStatus.CONFLICT : ScientificReviewConflictStatus.CLEAR,
      });
    });
    return this.getReviewerWorkspace(userId, email, eventId);
  }

  async saveDraft(userId: string, email: string, eventId: string, assignmentId: string, dto: SaveScientificReviewInput) {
    const { event, person, scope } = await this.requireReviewerIdentity(userId, email, eventId);
    const assignment = await this.requireReviewerAssignment(scope, person.id, assignmentId);
    if (!canMutateReview(assignment.status)) throw new BadRequestException('Esta avaliação já foi encerrada e não pode ser alterada.');
    if (assignment.conflictStatus !== ScientificReviewConflictStatus.CLEAR) {
      throw new BadRequestException('Declare ausência de conflito de interesse antes de preencher o parecer.');
    }
    const criteria = await this.requireActiveCriteria(scope);
    this.validateDraftScores(criteria, dto.scores);
    await this.persistReview(event, userId, assignment, dto, false);
    return this.getReviewerWorkspace(userId, email, eventId);
  }

  async submitReview(userId: string, email: string, eventId: string, assignmentId: string, dto: SaveScientificReviewInput) {
    const { event, person, scope } = await this.requireReviewerIdentity(userId, email, eventId);
    const assignment = await this.requireReviewerAssignment(scope, person.id, assignmentId);
    if (!canMutateReview(assignment.status) || !canTransitionReviewAssignment(assignment.status, ScientificReviewAssignmentStatus.SUBMITTED)) {
      throw new BadRequestException('Esta avaliação não pode mais ser enviada.');
    }
    const criteria = await this.requireActiveCriteria(scope);
    const errors = validateReviewForSubmit(
      criteria,
      dto.scores.map((score) => ({ criterionId: score.criterionId, value: score.value })),
      assignment.conflictStatus,
      dto.recommendation ?? null,
    );
    if (errors.length) throw new BadRequestException({ code: 'REVIEW_INCOMPLETE', message: 'Revise o parecer antes de enviar.', errors });
    await this.persistReview(event, userId, assignment, dto, true);
    return this.getReviewerWorkspace(userId, email, eventId);
  }

  private async persistReview(
    event: { id: string; organizationId: string | null },
    userId: string,
    assignment: { id: string; eventId: string; organizationId: string; status: ScientificReviewAssignmentStatus },
    dto: SaveScientificReviewInput,
    submit: boolean,
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.scientificReview.upsert({
        where: { assignmentId_eventId_organizationId: { assignmentId: assignment.id, eventId: assignment.eventId, organizationId: assignment.organizationId } },
        create: {
          organizationId: assignment.organizationId,
          eventId: assignment.eventId,
          assignmentId: assignment.id,
          recommendation: dto.recommendation ?? null,
          authorComment: this.optional(dto.authorComment, 6000),
          confidentialComment: this.optional(dto.confidentialComment, 6000),
          submittedAt: submit ? now : null,
        },
        update: {
          recommendation: dto.recommendation ?? null,
          authorComment: this.optional(dto.authorComment, 6000),
          confidentialComment: this.optional(dto.confidentialComment, 6000),
          ...(submit ? { submittedAt: now } : {}),
        },
      });
      await tx.scientificReviewScore.deleteMany({ where: { reviewId: review.id, eventId: assignment.eventId, organizationId: assignment.organizationId } });
      if (dto.scores.length) {
        await tx.scientificReviewScore.createMany({
          data: dto.scores.map((score) => ({
            organizationId: assignment.organizationId,
            eventId: assignment.eventId,
            reviewId: review.id,
            criterionId: score.criterionId,
            value: score.value,
            comment: this.optional(score.comment, 2000),
          })),
        });
      }
      await tx.scientificReviewAssignment.update({
        where: { id: assignment.id },
        data: submit
          ? { status: ScientificReviewAssignmentStatus.SUBMITTED, submittedAt: now, startedAt: assignment.status === ScientificReviewAssignmentStatus.ASSIGNED ? now : undefined }
          : { status: ScientificReviewAssignmentStatus.IN_PROGRESS, startedAt: assignment.status === ScientificReviewAssignmentStatus.ASSIGNED ? now : undefined },
      });
      await this.audit(tx, event, userId, submit ? 'scientific.review_submitted' : 'scientific.review_draft_saved', 'ScientificReviewAssignment', assignment.id, {
        recommendation: dto.recommendation ?? null,
        scoreCount: dto.scores.length,
      });
    });
  }

  private async requireScientificEventForEditor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (!event.organizationId) throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) throw new BadRequestException('A avaliação científica está disponível apenas para eventos técnico-científicos.');
    return event;
  }

  private async requireMutableScientificEventForEditor(userId: string, eventId: string) {
    const event = await this.requireScientificEventForEditor(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async requireReviewerIdentity(userId: string, email: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT || !event.organizationId) throw new NotFoundException('Evento científico não encontrado.');
    const normalizedEmail = email.trim().toLowerCase();
    const person = await this.prisma.scientificPerson.findFirst({
      where: { eventId, organizationId: event.organizationId, email: { equals: normalizedEmail, mode: 'insensitive' }, status: 'ACTIVE' },
    });
    if (!person) throw new NotFoundException('Nenhuma atribuição de avaliação foi encontrada para sua conta neste evento.');
    const hasAssignment = await this.prisma.scientificReviewAssignment.findFirst({ where: { eventId, organizationId: event.organizationId, reviewerPersonId: person.id } });
    if (!hasAssignment) throw new NotFoundException('Nenhuma atribuição de avaliação foi encontrada para sua conta neste evento.');
    return { event, person, scope: { eventId, organizationId: event.organizationId } as Scope, actorUserId: userId };
  }

  private async requireReviewerAssignment(scope: Scope, reviewerPersonId: string, assignmentId: string) {
    const assignment = await this.prisma.scientificReviewAssignment.findFirst({ where: { ...scope, id: assignmentId, reviewerPersonId } });
    if (!assignment) throw new NotFoundException('Avaliação não encontrada para sua conta neste evento.');
    return assignment;
  }

  private async requireActiveCriteria(scope: Scope) {
    const criteria = await this.prisma.scientificReviewCriterion.findMany({ where: { ...scope, active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
    if (!criteria.length) throw new BadRequestException('A comissão ainda não configurou critérios ativos para esta avaliação.');
    return criteria;
  }

  private validateDraftScores(criteria: { id: string; minScore: number; maxScore: number }[], scores: ScientificReviewScoreInput[]) {
    const byId = new Map(criteria.map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const score of scores) {
      if (seen.has(score.criterionId)) throw new BadRequestException('Cada critério deve possuir apenas uma nota no parecer.');
      seen.add(score.criterionId);
      const criterion = byId.get(score.criterionId);
      if (!criterion) throw new BadRequestException('Existe uma nota vinculada a um critério que não pertence a esta avaliação.');
      if (!Number.isFinite(score.value) || score.value < criterion.minScore || score.value > criterion.maxScore) {
        throw new BadRequestException(`A nota deve ficar entre ${criterion.minScore} e ${criterion.maxScore}.`);
      }
    }
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
    await tx.auditLog.create({ data: { organizationId: event.organizationId!, eventId: event.id, actorUserId, action, entityType, entityId, metadata } });
  }
}
