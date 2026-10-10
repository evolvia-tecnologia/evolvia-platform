import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScientificReviewAssignmentStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  SCIENTIFIC_RANKING_CODE,
  SCIENTIFIC_RANKING_LIMIT,
  RankingCriterion,
  RankingPhase,
  RankingRule,
  ScientificRankingPolicyError,
  normalizeRankingRule,
  rankWorks,
  readRankingRule,
} from './scientific-ranking.policy';

const ACTION = 'scientific.ranking_configured';

@Injectable()
export class ScientificRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const criteria = await this.criteria(event);
    const stored = readRankingRule(await this.storedConfig(event.id), criteria.map((item) => item.id));
    const rule = stored ?? this.defaultRule(criteria);
    const ranked = await this.ranked(event, criteria, rule);
    return {
      configured: stored !== null,
      cutoff: rule.cutoff,
      limit: SCIENTIFIC_RANKING_LIMIT,
      criteria: criteria.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
        phase: rule.phases[item.id] ?? 'CLASSIFICATORY',
      })),
      rows: ranked.rows,
      truncated: ranked.truncated,
    };
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    const criteria = await this.criteria(event);
    let rule: RankingRule;
    try { rule = normalizeRankingRule(input, criteria.map((item) => item.id)); }
    catch (error) {
      if (error instanceof ScientificRankingPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.eventCapability.upsert({
      where: { eventId_code: { eventId: event.id, code: SCIENTIFIC_RANKING_CODE } },
      create: {
        eventId: event.id,
        code: SCIENTIFIC_RANKING_CODE,
        status: 'ACTIVE',
        config: rule as Prisma.InputJsonObject,
        schemaVersion: 1,
      },
      update: { status: 'ACTIVE', config: rule as Prisma.InputJsonObject },
    });
    const phases = Object.values(rule.phases);
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: userId,
        action: ACTION,
        entityType: 'EventCapability',
        entityId: SCIENTIFIC_RANKING_CODE,
        metadata: {
          cutoff: rule.cutoff,
          eliminatory: phases.filter((phase) => phase === 'ELIMINATORY').length,
          classificatory: phases.filter((phase) => phase === 'CLASSIFICATORY').length,
          reason: 'configured',
        } as Prisma.InputJsonObject,
      },
    });
    return this.get(userId, eventId);
  }

  private defaultRule(criteria: { id: string }[]): RankingRule {
    return {
      cutoff: 6,
      phases: Object.fromEntries(criteria.map((item) => [item.id, 'CLASSIFICATORY' as RankingPhase])),
    };
  }

  private async criteria(event: { id: string; organizationId: string }) {
    return this.prisma.scientificReviewCriterion.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, active: true },
      select: { id: true, code: true, label: true, minScore: true, maxScore: true, weight: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      take: 40,
    });
  }

  private async storedConfig(eventId: string) {
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: SCIENTIFIC_RANKING_CODE } },
      select: { config: true },
    });
    return row?.config ?? null;
  }

  private async ranked(
    event: { id: string; organizationId: string },
    storedCriteria: { id: string; minScore: number; maxScore: number; weight: number; phase?: RankingPhase }[],
    rule: RankingRule,
  ) {
    const criteria: RankingCriterion[] = storedCriteria.map((item) => ({
      id: item.id,
      minScore: item.minScore,
      maxScore: item.maxScore,
      weight: item.weight,
      phase: rule.phases[item.id] ?? 'CLASSIFICATORY',
    }));
    const submissions = await this.prisma.scientificSubmission.findMany({
      where: { eventId: event.id, organizationId: event.organizationId },
      orderBy: { id: 'asc' },
      take: SCIENTIFIC_RANKING_LIMIT + 1,
      select: {
        id: true,
        title: true,
        status: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { id: true } },
      },
    });
    const page = submissions.slice(0, SCIENTIFIC_RANKING_LIMIT);
    const versionIds = page.flatMap((item) => item.versions.map((version) => version.id));
    const assignments = versionIds.length === 0 ? [] : await this.prisma.scientificReviewAssignment.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        status: ScientificReviewAssignmentStatus.SUBMITTED,
        versionId: { in: versionIds },
      },
      select: {
        submissionId: true,
        versionId: true,
        review: { select: { scores: { select: { criterionId: true, value: true } } } },
      },
    });
    const works = page.map((item) => {
      const versionId = item.versions[0]?.id;
      const reviews = assignments
        .filter((assignment) => assignment.submissionId === item.id && assignment.versionId === versionId && assignment.review)
        .map((assignment) => ({ scores: assignment.review?.scores ?? [] }));
      return { submissionId: item.id, title: item.title, status: item.status, reviews };
    });
    return { rows: rankWorks(rule, criteria, works), truncated: submissions.length > SCIENTIFIC_RANKING_LIMIT };
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId };
  }
}
