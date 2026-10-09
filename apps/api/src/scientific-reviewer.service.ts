import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventStatus, Prisma, ScientificReviewAssignmentStatus, ScientificReviewConflictStatus, ScientificSubmissionStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { AuthorSubmissionPolicyError } from './scientific-author-policy';
import { canReviewerSeeAuthorIdentity, validateReviewForSubmit } from './scientific-review-policy';
import { canTransitionSubmission } from './scientific-submission-policy';
import { normalizeReviewerOpinion, normalizeScientificDecision } from './scientific-reviewer-policy';

const INVALID = 'Sessão do avaliador inválida ou expirada.';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class ScientificReviewerService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async issueAccess(userId: string, eventId: string, personId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.status === EventStatus.CANCELLED) throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
    const person = await this.prisma.scientificPerson.findFirst({
      where: { id: personId, eventId, organizationId: event.organizationId, status: 'ACTIVE' },
      select: { id: true, email: true },
    });
    if (!person?.email) throw new BadRequestException('O avaliador precisa ter e-mail neste evento.');
    const assigned = await this.prisma.scientificReviewAssignment.count({
      where: { eventId, organizationId: event.organizationId, reviewerPersonId: person.id, status: { not: ScientificReviewAssignmentStatus.CANCELLED } },
    });
    if (assigned < 1) throw new BadRequestException('Distribua um trabalho antes de gerar o acesso do avaliador.');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.scientificReviewerAccess.updateMany({
        where: { eventId, organizationId: event.organizationId!, personId: person.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.scientificReviewerAccess.create({
        data: { eventId, organizationId: event.organizationId!, personId: person.id, tokenHash: digest(token), expiresAt },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!, eventId, actorUserId: userId,
          action: 'scientific.reviewer_access_issued', entityType: 'ScientificPerson', entityId: person.id,
          metadata: { expiresAt: expiresAt.toISOString() } as Prisma.InputJsonObject,
        },
      });
    });
    return { expiresAt: expiresAt.toISOString(), accessPath: `/evento/${event.slug}/avaliador#acesso=${token}` };
  }

  async area(slug: string, authorization?: string) {
    const access = await this.access(slug, authorization);
    const config = await this.prisma.scientificSubmissionConfig.findUnique({
      where: { eventId_organizationId: { eventId: access.eventId, organizationId: access.organizationId } },
    });
    const criteria = await this.prisma.scientificReviewCriterion.findMany({
      where: { eventId: access.eventId, organizationId: access.organizationId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, description: true, required: true, minScore: true, maxScore: true, weight: true },
    });
    const assignments = await this.prisma.scientificReviewAssignment.findMany({
      where: { eventId: access.eventId, organizationId: access.organizationId, reviewerPersonId: access.personId, status: { not: 'CANCELLED' } },
      include: {
        submission: { include: { authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } } } },
        version: true,
        review: { include: { scores: { select: { criterionId: true, value: true } } } },
        revisions: { orderBy: { versionNumber: 'asc' }, select: { versionNumber: true, submittedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const showAuthors = canReviewerSeeAuthorIdentity(config?.reviewMode ?? 'SINGLE_BLIND');
    return {
      reviewerName: access.personName,
      reviewMode: config?.reviewMode ?? 'SINGLE_BLIND',
      coordinatorDecidesStatus: config?.coordinatorDecidesStatus ?? false,
      evaluationStyle: config?.evaluationStyle ?? 'ANALYTIC',
      criteria,
      assignments: assignments.map((item) => ({
        id: item.id,
        status: item.status,
        conflictStatus: item.conflictStatus,
        dueAt: item.dueAt?.toISOString() ?? null,
        submittedAt: item.submittedAt?.toISOString() ?? null,
        recommendation: item.review?.recommendation ?? null,
        overallScore: item.review?.overallScore ?? null,
        opinion: item.review ? {
          recommendation: item.review.recommendation,
          overallScore: item.review.overallScore,
          authorComment: item.review.authorComment ?? '',
          confidentialComment: item.review.confidentialComment ?? '',
          scores: item.review.scores.map((score) => ({ criterionId: score.criterionId, value: score.value })),
        } : null,
        revisions: item.revisions.map((revision) => ({ versionNumber: revision.versionNumber, submittedAt: revision.submittedAt.toISOString() })),
        submission: {
          title: item.version.title,
          abstractText: item.version.abstractText,
          authors: showAuthors ? item.submission.authors.map((author) => author.person.name) : [],
        },
      })),
    };
  }

  async submit(slug: string, authorization: string | undefined, assignmentId: string, rawInput: unknown) {
    if (!/^[a-z0-9]{10,40}$/u.test(assignmentId)) throw new BadRequestException('Atribuição inválida.');
    const access = await this.access(slug, authorization);
    let opinion: ReturnType<typeof normalizeReviewerOpinion>;
    try { opinion = normalizeReviewerOpinion(rawInput); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const assignment = await this.prisma.scientificReviewAssignment.findFirst({
      where: { id: assignmentId, eventId: access.eventId, organizationId: access.organizationId, reviewerPersonId: access.personId },
      include: { submission: { select: { authors: { select: { personId: true } } } } },
    });
    if (!assignment || assignment.status === ScientificReviewAssignmentStatus.CANCELLED) throw new NotFoundException('Atribuição não encontrada.');
    if (assignment.status === ScientificReviewAssignmentStatus.SUBMITTED) throw new ConflictException('Este parecer já foi enviado.');
    if (opinion.conflictStatus === 'CLEAR' && (assignment.conflictStatus === ScientificReviewConflictStatus.CONFLICT
      || assignment.submission.authors.some((author) => author.personId === access.personId))) {
      throw new ConflictException('Este trabalho tem conflito de interesse e não pode receber seu parecer.');
    }
    const writableAssignment = {
      id: assignment.id, eventId: access.eventId, organizationId: access.organizationId, reviewerPersonId: access.personId,
      status: { notIn: [ScientificReviewAssignmentStatus.CANCELLED, ScientificReviewAssignmentStatus.SUBMITTED] },
      conflictStatus: { not: ScientificReviewConflictStatus.CONFLICT },
    };
    if (opinion.conflictStatus === 'CONFLICT') {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.scientificReviewAssignment.updateMany({
          where: writableAssignment,
          data: { conflictStatus: ScientificReviewConflictStatus.CONFLICT, conflictReason: opinion.conflictReason, startedAt: assignment.startedAt ?? new Date() },
        });
        if (claimed.count !== 1) throw new ConflictException('A atribuição mudou. Atualize a área do avaliador.');
        await tx.auditLog.create({
          data: {
            organizationId: access.organizationId, eventId: access.eventId,
            action: 'scientific.review_conflict_declared', entityType: 'ScientificReviewAssignment', entityId: assignment.id,
            metadata: { conflictStatus: 'CONFLICT' } as Prisma.InputJsonObject,
          },
        });
      });
      return { id: assignment.id, status: assignment.status, conflictStatus: 'CONFLICT' };
    }
    const config = await this.prisma.scientificSubmissionConfig.findUnique({
      where: { eventId_organizationId: { eventId: access.eventId, organizationId: access.organizationId } },
    });
    const criteria = config?.evaluationStyle === 'SYNTHETIC' ? [] : await this.prisma.scientificReviewCriterion.findMany({
      where: { eventId: access.eventId, organizationId: access.organizationId, active: true },
    });
    const scores = config?.evaluationStyle === 'SYNTHETIC'
      ? [{ criterionId: 'synthetic', value: opinion.overallScore ?? Number.NaN }]
      : opinion.scores;
    const errors = validateReviewForSubmit(criteria, scores, 'CLEAR', opinion.recommendation, {
      coordinatorDecidesStatus: config?.coordinatorDecidesStatus ?? false,
      style: config?.evaluationStyle ?? 'ANALYTIC',
    });
    if (errors.length > 0) throw new BadRequestException(errors[0]?.message ?? 'Parecer incompleto.');
    if (config?.evaluationStyle !== 'SYNTHETIC' && opinion.overallScore != null) {
      throw new BadRequestException('Este evento usa critérios, não uma nota única.');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.scientificReviewAssignment.updateMany({
        where: writableAssignment,
        data: { status: ScientificReviewAssignmentStatus.SUBMITTED, conflictStatus: ScientificReviewConflictStatus.CLEAR, submittedAt: now, startedAt: assignment.startedAt ?? now },
      });
      if (claimed.count !== 1) throw new ConflictException('A atribuição mudou. Atualize a área do avaliador.');
      const reviewData = {
        recommendation: config?.coordinatorDecidesStatus ? null : opinion.recommendation,
        overallScore: config?.evaluationStyle === 'SYNTHETIC' ? opinion.overallScore : null,
        authorComment: opinion.authorComment || null,
        confidentialComment: opinion.confidentialComment || null,
        submittedAt: now,
      };
      // Prisma names this compound input like ScientificReviewAssignment's id key, so findUnique cannot address it.
      const existingReview = await tx.scientificReview.findFirst({
        where: { assignmentId: assignment.id, eventId: access.eventId, organizationId: access.organizationId },
        select: { id: true },
      });
      const review = existingReview
        ? await tx.scientificReview.update({ where: { id: existingReview.id }, data: reviewData })
        : await tx.scientificReview.create({
          data: { eventId: access.eventId, organizationId: access.organizationId, assignmentId: assignment.id, ...reviewData },
        });
      if (config?.evaluationStyle !== 'SYNTHETIC') {
        if (existingReview) {
          await tx.scientificReviewScore.deleteMany({
            where: { reviewId: review.id, eventId: access.eventId, organizationId: access.organizationId },
          });
        }
        await tx.scientificReviewScore.createMany({
          data: opinion.scores.map((score) => ({
            eventId: access.eventId, organizationId: access.organizationId, reviewId: review.id,
            criterionId: score.criterionId, value: score.value,
          })),
        });
      }
      const archived = await tx.scientificReviewRevision.aggregate({
        where: { assignmentId: assignment.id, eventId: access.eventId, organizationId: access.organizationId },
        _max: { versionNumber: true },
      });
      const versionNumber = (archived._max.versionNumber ?? 0) + 1;
      const archivedScores = config?.evaluationStyle === 'SYNTHETIC'
        ? []
        : opinion.scores.map((score) => ({ criterionId: score.criterionId, value: score.value }));
      await tx.scientificReviewRevision.create({
        data: {
          eventId: access.eventId, organizationId: access.organizationId, assignmentId: assignment.id, versionNumber,
          recommendation: reviewData.recommendation, overallScore: reviewData.overallScore,
          authorComment: reviewData.authorComment, confidentialComment: reviewData.confidentialComment,
          rubric: this.rubricSnapshot(config?.evaluationStyle ?? 'ANALYTIC', criteria),
          scores: archivedScores,
          submittedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: access.organizationId, eventId: access.eventId, action: 'scientific.review_submitted',
          entityType: 'ScientificReview', entityId: review.id,
          metadata: { assignmentId: assignment.id, versionNumber } as Prisma.InputJsonObject,
        },
      });
    });
    return { id: assignment.id, status: 'SUBMITTED', conflictStatus: 'CLEAR' };
  }

  async reopen(userId: string, eventId: string, assignmentId: string) {
    if (!/^[a-z0-9]{10,40}$/u.test(assignmentId)) throw new NotFoundException('Atribuição não encontrada.');
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.status === EventStatus.CANCELLED) throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
    const organizationId = event.organizationId;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.scientificReviewAssignment.findUnique({
          where: { id_eventId_organizationId: { id: assignmentId, eventId, organizationId } },
          include: {
            review: { include: { scores: true } },
            revisions: { select: { versionNumber: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        });
        if (!assignment || assignment.status === ScientificReviewAssignmentStatus.CANCELLED) throw new NotFoundException('Atribuição não encontrada.');
        if (assignment.status !== ScientificReviewAssignmentStatus.SUBMITTED || !assignment.review?.submittedAt) {
          throw new ConflictException('Só um parecer já enviado pode ser retomado.');
        }
        // Claiming before archiving makes a concurrent reopen fail on the status guard instead of the version index.
        const claimed = await tx.scientificReviewAssignment.updateMany({
          where: { id: assignment.id, eventId, organizationId, status: ScientificReviewAssignmentStatus.SUBMITTED },
          data: { status: ScientificReviewAssignmentStatus.IN_PROGRESS, submittedAt: null },
        });
        if (claimed.count !== 1) throw new ConflictException('A atribuição mudou. Atualize a comissão.');
        let versionNumber = assignment.revisions[0]?.versionNumber ?? 0;
        if (versionNumber === 0) {
          const criteria = assignment.review.scores.length
            ? await tx.scientificReviewCriterion.findMany({
              where: { eventId, organizationId, OR: [{ active: true }, { id: { in: assignment.review.scores.map((score) => score.criterionId) } }] },
            })
            : await tx.scientificReviewCriterion.findMany({ where: { eventId, organizationId, active: true } });
          const config = await tx.scientificSubmissionConfig.findUnique({
            where: { eventId_organizationId: { eventId, organizationId } },
            select: { evaluationStyle: true },
          });
          versionNumber = 1;
          await tx.scientificReviewRevision.create({
            data: {
              eventId, organizationId, assignmentId: assignment.id, versionNumber,
              recommendation: assignment.review.recommendation, overallScore: assignment.review.overallScore,
              authorComment: assignment.review.authorComment, confidentialComment: assignment.review.confidentialComment,
              rubric: this.rubricSnapshot(config?.evaluationStyle ?? 'ANALYTIC', criteria),
              scores: assignment.review.scores.map((score) => ({ criterionId: score.criterionId, value: score.value })),
              submittedAt: assignment.review.submittedAt,
            },
          });
        }
        const boardSize = await tx.scientificReviewAssignment.count({
          where: { eventId, organizationId, submissionId: assignment.submissionId, id: { not: assignment.id }, status: { not: ScientificReviewAssignmentStatus.CANCELLED } },
        });
        await tx.auditLog.create({
          data: {
            organizationId, eventId, actorUserId: userId, action: 'scientific.review_reopened',
            entityType: 'ScientificReviewAssignment', entityId: assignment.id,
            metadata: { assignmentId: assignment.id, submissionId: assignment.submissionId, versionNumber, boardSize } as Prisma.InputJsonObject,
          },
        });
        return { id: assignment.id, status: 'IN_PROGRESS' as const, versionNumber, boardSize };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('A atribuição mudou. Atualize a comissão.');
      }
      throw error;
    }
  }

  async decide(userId: string, eventId: string, submissionId: string, rawInput: unknown) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.status === EventStatus.CANCELLED) throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
    let status: ReturnType<typeof normalizeScientificDecision>;
    try { status = normalizeScientificDecision(rawInput); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const organizationId = event.organizationId;
    // Read the quorum and decision state in one serializable snapshot.
    // Concurrent review/configuration changes abort instead of authorizing a stale decision.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentEvent = await tx.event.findFirst({
          where: { id: eventId, organizationId },
          select: { status: true },
        });
        if (!currentEvent) throw new NotFoundException('Evento não encontrado.');
        if (currentEvent.status === EventStatus.CANCELLED) throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
        const submission = await tx.scientificSubmission.findFirst({
          where: { id: submissionId, eventId, organizationId },
          select: { id: true, status: true, currentVersion: true },
        });
        if (!submission) throw new NotFoundException('Trabalho não encontrado.');
        if (!canTransitionSubmission(submission.status, status)) {
          throw new BadRequestException('Este trabalho ainda não pode receber essa decisão.');
        }
        const config = await tx.scientificSubmissionConfig.findUnique({
          where: { eventId_organizationId: { eventId, organizationId } },
          select: { coordinatorDecidesStatus: true, reviewersPerSubmission: true },
        });
        // Legacy configurations without an explicit quorum retain the minimum of one.
        const requiredReviews = config?.reviewersPerSubmission ?? 1;
        if (!Number.isInteger(requiredReviews) || requiredReviews < 1 || requiredReviews > 10) {
          throw new BadRequestException('Configure uma quantidade válida de avaliadores por trabalho antes da decisão.');
        }
        const reviews = await tx.scientificReviewAssignment.count({
          where: { eventId, organizationId, submissionId, version: { versionNumber: submission.currentVersion }, status: ScientificReviewAssignmentStatus.SUBMITTED, conflictStatus: ScientificReviewConflictStatus.CLEAR },
        });
        if (reviews < requiredReviews) {
          throw new BadRequestException(`Pareceres recebidos: ${reviews}; necessários para decidir: ${requiredReviews}.`);
        }
        if (config?.coordinatorDecidesStatus) {
          const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
          const chair = user ? await tx.scientificCommitteeMembership.findFirst({
            where: { eventId, organizationId, isChair: true, person: { email: { equals: user.email, mode: 'insensitive' } } },
            select: { id: true },
          }) : null;
          if (!chair) throw new ForbiddenException('Só o coordenador científico pode registrar a decisão deste trabalho.');
        }
        const changed = await tx.scientificSubmission.updateMany({
          where: { id: submission.id, eventId, organizationId, status: submission.status },
          data: { status: status as ScientificSubmissionStatus },
        });
        if (changed.count !== 1) throw new ConflictException('O trabalho mudou durante a decisão. Atualize e tente novamente.');
        await tx.auditLog.create({
          data: {
            organizationId: organizationId, eventId, actorUserId: userId, action: 'scientific.submission_decided',
            entityType: 'ScientificSubmission', entityId: submission.id,
            metadata: { status, versionNumber: submission.currentVersion, receivedReviews: reviews, requiredReviews } as Prisma.InputJsonObject,
          },
        });
        return { id: submission.id, status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('A avaliação mudou durante a decisão. Atualize e tente novamente.');
      }
      throw error;
    }
  }

  private async access(slug: string, authorization?: string) {
    const token = /^[Bb][Ee][Aa][Rr][Ee][Rr] ([a-f0-9]{64})$/u.exec(authorization?.trim() ?? '')?.[1];
    if (!token) throw new UnauthorizedException(INVALID);
    const row = await this.prisma.scientificReviewerAccess.findUnique({
      where: { tokenHash: digest(token) },
      include: { person: { select: { id: true, name: true, status: true, eventId: true, organizationId: true } }, event: { select: { id: true, slug: true, status: true, organizationId: true } } },
    });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now() || row.person.status !== 'ACTIVE') throw new UnauthorizedException(INVALID);
    if (row.eventId !== row.event.id || row.organizationId !== row.event.organizationId || row.personId !== row.person.id
      || row.person.eventId !== row.eventId || row.person.organizationId !== row.organizationId) {
      throw new UnauthorizedException(INVALID);
    }
    if (!row.event.organizationId || row.event.slug.toLowerCase() !== slug.trim().toLowerCase() || row.event.status === EventStatus.CANCELLED) {
      throw new UnauthorizedException(INVALID);
    }
    return { eventId: row.event.id, organizationId: row.event.organizationId, personId: row.person.id, personName: row.person.name };
  }

  private rubricSnapshot(style: string, criteria: { id: string; code: string; label: string; minScore: number; maxScore: number; weight: number; required: boolean }[]) {
    return {
      style,
      criteria: criteria.map((item) => ({
        id: item.id, code: item.code, label: item.label, minScore: item.minScore, maxScore: item.maxScore, weight: item.weight, required: item.required,
      })),
    } as Prisma.InputJsonObject;
  }
}

