import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EventEvaluationPolicyError, EventEvaluationQuestion, evaluationPayloadHash, normalizeEvaluationAnswers, normalizeEvaluationConfig } from './event-evaluation.policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { ParticipantAreaService } from './participant-area.service';
import { PrismaService } from './prisma.service';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,120}$/u;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class EventEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly participantArea: ParticipantAreaService,
  ) {}

  private async eventScope(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, name: true } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { eventId: event.id, organizationId: event.organizationId, name: event.name };
  }

  async management(userId: string, eventId: string) {
    const scope = await this.eventScope(userId, eventId);
    const tenant = { eventId: scope.eventId, organizationId: scope.organizationId };
    const [config, responseCount] = await Promise.all([
      this.prisma.eventEvaluationConfig.findUnique({ where: { eventId_organizationId: tenant } }),
      this.prisma.eventEvaluationResponse.count({ where: tenant }),
    ]);
    return { event: { id: scope.eventId, name: scope.name }, config, responseCount };
  }

  async configure(userId: string, eventId: string, raw: unknown) {
    const scope = await this.eventScope(userId, eventId);
    const tenant = { eventId: scope.eventId, organizationId: scope.organizationId };
    let input;
    try { input = normalizeEvaluationConfig(raw); }
    catch (error) { throw new BadRequestException(error instanceof EventEvaluationPolicyError ? error.message : 'Configuração inválida.'); }
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.eventEvaluationConfig.findUnique({ where: { eventId_organizationId: tenant }, select: { revision: true } });
      const config = await tx.eventEvaluationConfig.upsert({
        where: { eventId_organizationId: tenant },
        create: { ...tenant, active: input.active, title: input.title, questions: input.questions as unknown as Prisma.InputJsonValue },
        update: { active: input.active, title: input.title, questions: input.questions as unknown as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId, eventId: scope.eventId, actorUserId: userId,
          action: 'event.evaluation_configured', entityType: 'EventEvaluationConfig', entityId: config.id,
          metadata: { active: input.active, questionCount: input.questions.length, revision: (previous?.revision ?? 0) + 1 } as Prisma.InputJsonObject,
        },
      });
    });
    return this.management(userId, eventId);
  }

  async questionnaire(slug: string, authorization?: string) {
    const scope = await this.participantArea.requireConfirmedScope(slug, authorization);
    const config = await this.prisma.eventEvaluationConfig.findUnique({ where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } } });
    if (!config?.active) throw new ForbiddenException('A avaliação deste evento não está aberta.');
    const existing = await this.prisma.eventEvaluationResponse.findUnique({
      where: { eventId_reservationId: { eventId: scope.eventId, reservationId: scope.reservationId } },
      select: { submittedAt: true },
    });
    return { title: config.title, questions: config.questions, submittedAt: existing?.submittedAt.toISOString() ?? null };
  }

  async answer(slug: string, authorization: string | undefined, idempotencyKey: string | undefined, raw: unknown) {
    const scope = await this.participantArea.requireConfirmedScope(slug, authorization);
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw new BadRequestException('Informe uma Idempotency-Key válida.');
    const config = await this.prisma.eventEvaluationConfig.findUnique({ where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } } });
    if (!config?.active) throw new ForbiddenException('A avaliação deste evento não está aberta.');
    const questions = config.questions as unknown as EventEvaluationQuestion[];
    let answers;
    try { answers = normalizeEvaluationAnswers(raw, questions); }
    catch (error) { throw new BadRequestException(error instanceof EventEvaluationPolicyError ? error.message : 'Respostas inválidas.'); }
    const payloadHash = evaluationPayloadHash(answers);
    const keyHash = digest(idempotencyKey);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.eventEvaluationResponse.findUnique({
          where: { reservationId_idempotencyKeyHash: { reservationId: scope.reservationId, idempotencyKeyHash: keyHash } },
        });
        if (replay) {
          if (replay.payloadHash !== payloadHash) throw new ConflictException('Esta chave já foi usada com outras respostas.');
          return { submittedAt: replay.submittedAt.toISOString(), replay: true };
        }
        const prior = await tx.eventEvaluationResponse.findUnique({
          where: { eventId_reservationId: { eventId: scope.eventId, reservationId: scope.reservationId } },
          select: { id: true },
        });
        if (prior) throw new ConflictException('A avaliação desta inscrição já foi enviada.');
        const response = await tx.eventEvaluationResponse.create({
          data: { ...scope, answers: answers as Prisma.InputJsonValue, payloadHash, idempotencyKeyHash: keyHash },
        });
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId, eventId: scope.eventId,
            action: 'event.evaluation_submitted', entityType: 'EventEvaluationResponse', entityId: response.id,
            metadata: { questionCount: Object.keys(answers).length } as Prisma.InputJsonObject,
          },
        });
        return { submittedAt: response.submittedAt.toISOString(), replay: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.eventEvaluationResponse.findUnique({
          where: { reservationId_idempotencyKeyHash: { reservationId: scope.reservationId, idempotencyKeyHash: keyHash } },
          select: { payloadHash: true, submittedAt: true },
        });
        if (replay?.payloadHash === payloadHash) return { submittedAt: replay.submittedAt.toISOString(), replay: true };
        throw new ConflictException(replay ? 'Esta chave já foi usada com outras respostas.' : 'A avaliação desta inscrição já foi enviada.');
      }
      throw error;
    }
  }

  async responses(userId: string, eventId: string) {
    const scope = await this.eventScope(userId, eventId);
    const tenant = { eventId: scope.eventId, organizationId: scope.organizationId };
    const config = await this.prisma.eventEvaluationConfig.findUnique({ where: { eventId_organizationId: tenant } });
    if (!config) return { title: null, questions: [], rows: [] };
    const rows = await this.prisma.eventEvaluationResponse.findMany({
      where: tenant, orderBy: { submittedAt: 'asc' },
      select: { id: true, answers: true, submittedAt: true },
    });
    return {
      title: config.title,
      questions: config.questions,
      rows: rows.map((row) => ({ id: row.id, answers: row.answers, submittedAt: row.submittedAt.toISOString() })),
    };
  }
}
