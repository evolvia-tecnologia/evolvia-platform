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
        review: true,
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
      const review = await tx.scientificReview.create({
        data: {
          eventId: access.eventId, organizationId: access.organizationId, assignmentId: assignment.id,
          recommendation: config?.coordinatorDecidesStatus ? null : opinion.recommendation,
          overallScore: config?.evaluationStyle === 'SYNTHETIC' ? opinion.overallScore : null,
          authorComment: opinion.authorComment || null,
          confidentialComment: opinion.confidentialComment || null,
          submittedAt: now,
        },
      });
      if (config?.evaluationStyle !== 'SYNTHETIC') {
        await tx.scientificReviewScore.createMany({
          data: opinion.scores.map((score) => ({
            eventId: access.eventId, organizationId: access.organizationId, reviewId: review.id,
            criterionId: score.criterionId, value: score.value,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: access.organizationId, eventId: access.eventId, action: 'scientific.review_submitted',
          entityType: 'ScientificReview', entityId: review.id, metadata: { assignmentId: assignment.id } as Prisma.InputJsonObject,
        },
      });
    });
    return { id: assignment.id, status: 'SUBMITTED', conflictStatus: 'CLEAR' };
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
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { id: submissionId, eventId, organizationId: event.organizationId },
      select: { id: true, status: true },
    });
    if (!submission) throw new NotFoundException('Trabalho não encontrado.');
    if (!canTransitionSubmission(submission.status, status)) {
      throw new BadRequestException('Este trabalho ainda não pode receber essa decisão.');
    }
    const reviews = await this.prisma.scientificReviewAssignment.count({
      where: { eventId, organizationId: event.organizationId, submissionId, status: ScientificReviewAssignmentStatus.SUBMITTED, conflictStatus: ScientificReviewConflictStatus.CLEAR },
    });
    if (reviews < 1) throw new BadRequestException('Ainda não há parecer enviado para decidir este trabalho.');
    const config = await this.prisma.scientificSubmissionConfig.findUnique({
      where: { eventId_organizationId: { eventId, organizationId: event.organizationId } },
      select: { coordinatorDecidesStatus: true },
    });
    if (config?.coordinatorDecidesStatus) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      const chair = user ? await this.prisma.scientificCommitteeMembership.findFirst({
        where: { eventId, organizationId: event.organizationId, isChair: true, person: { email: { equals: user.email, mode: 'insensitive' } } },
        select: { id: true },
      }) : null;
      if (!chair) throw new ForbiddenException('Só o coordenador científico pode registrar a decisão deste trabalho.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.scientificSubmission.update({ where: { id: submission.id }, data: { status: status as ScientificSubmissionStatus } });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!, eventId, actorUserId: userId, action: 'scientific.submission_decided',
          entityType: 'ScientificSubmission', entityId: submission.id, metadata: { status } as Prisma.InputJsonObject,
        },
      });
    });
    return { id: submission.id, status };
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
}
