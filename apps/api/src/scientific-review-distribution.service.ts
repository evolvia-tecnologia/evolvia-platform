import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificReviewAssignmentStatus,
  ScientificReviewConflictStatus,
  ScientificSubmissionStatus,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  DistributionReviewer,
  DistributionWork,
  distributionLabel,
  planAssistedReviewDistribution,
  registrationEmail,
  REVIEW_DISTRIBUTION_MAX,
} from './scientific-review-distribution.policy';

const SCAN = 80;
const BATCH_CONFLICT = 'A distribuição encontrou uma atribuição criada ao mesmo tempo. Chame de novo.';

type Scope = { id: string; organizationId: string };
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ScientificReviewDistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async preview(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const loaded = await this.load(this.prisma, event);
    return this.present(loaded);
  }

  async apply(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockedEvents = await tx.$queryRaw<Array<{ status: string; profileCode: string }>>(Prisma.sql`
          SELECT "status", "profileCode" FROM "Event"
          WHERE "id" = ${event.id} AND "organizationId" = ${event.organizationId}
          FOR UPDATE
        `);
        const lockedEvent = lockedEvents[0];
        if (!lockedEvent) throw new NotFoundException('Evento não encontrado.');
        if (lockedEvent.status === 'CANCELLED') {
          throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
        }
        if (lockedEvent.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
          throw new BadRequestException('A distribuição da avaliação está disponível apenas para eventos técnico-científicos.');
        }
        const loaded = await this.load(tx, event);
        const { plans, pending, cap } = loaded.plan;
        if (plans.length === 0) return { assignedCount: 0, pending, cap };
        const ids = [...new Set(plans.map((item) => item.submissionId))].sort();
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "ScientificSubmission"
          WHERE "id" IN (${Prisma.join(ids)})
            AND "eventId" = ${event.id}
            AND "organizationId" = ${event.organizationId}
          ORDER BY "id" ASC
          FOR UPDATE
        `);
        const fresh = await this.load(tx, event, ids);
        fresh.plan.pending = fresh.plan.pending || pending;
        const lockedIds = new Set(ids);
        if (fresh.plan.plans.some((item) => !lockedIds.has(item.submissionId))) {
          throw new ConflictException(BATCH_CONFLICT);
        }
        if (fresh.plan.plans.length === 0) return { assignedCount: 0, pending: fresh.plan.pending, cap: fresh.plan.cap };
        const started = new Set<string>();
        for (const item of fresh.plan.plans) {
          const work = fresh.works.find((candidate) => candidate.submissionId === item.submissionId);
          const assignment = await tx.scientificReviewAssignment.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              submissionId: item.submissionId,
              versionId: item.versionId,
              reviewerPersonId: item.reviewerPersonId,
              assignmentRound: 1,
              conflictStatus: ScientificReviewConflictStatus.PENDING,
            },
            select: { id: true },
          });
          if (work?.status === ScientificSubmissionStatus.SUBMITTED && !started.has(item.submissionId)) {
            await tx.scientificSubmission.update({
              where: { id: item.submissionId },
              data: { status: ScientificSubmissionStatus.UNDER_REVIEW },
            });
            started.add(item.submissionId);
            await tx.auditLog.create({
              data: {
                organizationId: event.organizationId,
                eventId: event.id,
                actorUserId: userId,
                action: 'scientific.submission_review_started',
                entityType: 'ScientificSubmission',
                entityId: item.submissionId,
                metadata: { versionId: item.versionId, assignmentId: assignment.id } as Prisma.InputJsonObject,
              },
            });
          }
          await tx.auditLog.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              actorUserId: userId,
              action: 'scientific.review_assignment_created',
              entityType: 'ScientificReviewAssignment',
              entityId: assignment.id,
              metadata: {
                submissionId: item.submissionId,
                versionId: item.versionId,
                reviewerPersonId: item.reviewerPersonId,
                assignmentRound: 1,
              } as Prisma.InputJsonObject,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'scientific.review_batch_assigned',
            entityType: 'Event',
            entityId: event.id,
            metadata: {
              assignedCount: fresh.plan.plans.length,
              pending: fresh.plan.pending,
              cap: fresh.plan.cap,
            } as Prisma.InputJsonObject,
          },
        });
        return { assignedCount: fresh.plan.plans.length, pending: fresh.plan.pending, cap: fresh.plan.cap };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (
        ['P2002', 'P2034'].includes(error.code)
        || (error.code === 'P2010' && error.meta?.code === '40001')
      )) {
        throw new ConflictException(BATCH_CONFLICT);
      }
      throw error;
    }
  }

  private present(loaded: Awaited<ReturnType<ScientificReviewDistributionService['load']>>) {
    const titles = new Map(loaded.works.map((work) => [work.submissionId, work.title]));
    const names = new Map(loaded.reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
    return {
      cap: loaded.plan.cap,
      pending: loaded.plan.pending,
      suggestions: loaded.plan.plans.map((plan) => ({
        submissionId: plan.submissionId,
        versionId: plan.versionId,
        title: distributionLabel(titles.get(plan.submissionId) ?? ''),
        reviewerPersonId: plan.reviewerPersonId,
        reviewerName: distributionLabel(names.get(plan.reviewerPersonId) ?? ''),
      })),
    };
  }

  private async load(db: Db, event: Scope, submissionIds?: string[]) {
    const [people, config] = await Promise.all([
      db.scientificPerson.findMany({
        where: { eventId: event.id, organizationId: event.organizationId, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      db.scientificSubmissionConfig.findUnique({
        where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId } },
        select: { reviewersPerSubmission: true },
      }),
    ]);
    const assignmentCounts = people.length ? await db.scientificReviewAssignment.groupBy({
      by: ['reviewerPersonId'],
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        status: { not: ScientificReviewAssignmentStatus.CANCELLED },
        reviewerPersonId: { in: people.map((person) => person.id) },
      },
      _count: { _all: true },
    }) : [];
    const loads = new Map(assignmentCounts.map((item) => [item.reviewerPersonId, item._count._all]));
    const reviewers: Array<DistributionReviewer & { name: string }> = people.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      assignmentCount: loads.get(person.id) ?? 0,
    }));
    const cap = config?.reviewersPerSubmission ?? null;
    const works: Array<DistributionWork & { title: string; status: ScientificSubmissionStatus }> = [];
    let cursor: string | undefined;
    let scanned = 0;
    while (scanned < 5000) {
      const pageSize = Math.min(SCAN, 5000 - scanned);
      const rows = await db.scientificSubmission.findMany({
        where: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: { in: [ScientificSubmissionStatus.SUBMITTED, ScientificSubmissionStatus.UNDER_REVIEW] },
          ...(submissionIds || cursor ? { id: {
            ...(submissionIds ? { in: submissionIds } : {}),
            ...(cursor ? { gt: cursor } : {}),
          } } : {}),
        },
        orderBy: { id: 'asc' },
        take: pageSize + 1,
        select: {
          id: true,
          title: true,
          status: true,
          currentVersion: true,
          ownerReservation: { select: { registrationData: true } },
          authors: { select: { personId: true, person: { select: { email: true } } } },
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true, versionNumber: true } },
          reviewAssignments: { select: { reviewerPersonId: true, versionId: true, status: true } },
        },
      });
      const hasAnother = rows.length > pageSize;
      const slice = hasAnother ? rows.slice(0, pageSize) : rows;
      scanned += slice.length;
      for (const row of slice) {
        const version = row.versions[0];
        if (!version || version.versionNumber !== row.currentVersion) continue;
        const onVersion = row.reviewAssignments.filter((item) => item.versionId === version.id);
        works.push({
          submissionId: row.id,
          versionId: version.id,
          title: row.title,
          status: row.status,
          authorPersonIds: row.authors.map((author) => author.personId),
          authorEmails: [...row.authors.map((author) => author.person.email), registrationEmail(row.ownerReservation?.registrationData)],
          activeReviewerIds: onVersion.map((item) => item.reviewerPersonId),
          assignedCount: onVersion.filter((item) => item.status !== ScientificReviewAssignmentStatus.CANCELLED).length,
        });
      }
      const plan = planAssistedReviewDistribution({ works, reviewers, cap, limit: REVIEW_DISTRIBUTION_MAX });
      if (plan.plans.length >= REVIEW_DISTRIBUTION_MAX || !hasAnother) {
        return { works, reviewers, plan: { ...plan, pending: plan.pending || hasAnother, cap } };
      }
      cursor = slice[slice.length - 1]?.id;

      if (!cursor) break;
    }
    throw new ConflictException('A distribuição examinou 5000 trabalhos sem concluir a busca. Nenhuma atribuição parcial foi gravada.');
  }

  private async eventFor(userId: string, eventId: string): Promise<Scope> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, profileCode: true, status: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A distribuição da avaliação está disponível apenas para eventos técnico-científicos.');
    }
    if (event.status === 'CANCELLED') throw new ConflictException('A avaliação científica não pode mudar em um evento cancelado.');
    return { id: event.id, organizationId: event.organizationId };
  }
}


