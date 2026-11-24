import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EventStatus, MembershipStatus, Prisma, WizardSessionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CreateEventDto } from './dto';
import { type FormatoDoEvento, planejarAlteracaoDeAgenda } from './event-schedule-policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { eventPublicSlug } from './slug';
import { normalizeEventTimeZone } from './time-zone-policy';
import { getWizardSaveIssues } from './wizard-save-policy';
import {
  WIZARD_FLOW_VERSION,
  getWizardCompletion,
  inferEventProfileCode,
  normalizeWizardAnswers,
  parseSubjectAreas,
} from './wizard-policy';

/** Campos aceitos por `updateSchedule`. Qualquer outro é recusado. */
const CAMPOS_DA_AGENDA = ['expectedUpdatedAt', 'motivo', 'startDate', 'endDate', 'timeZone', 'venue'] as const;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, organizationId?: string) {
    let organizationIds: string[] | undefined;

    if (organizationId) {
      await this.authorization.requireMembership(userId, organizationId);
      organizationIds = [organizationId];
    } else {
      const memberships = await this.prisma.organizationMembership.findMany({
        where: { userId, status: MembershipStatus.ACTIVE },
        select: { organizationId: true },
      });
      organizationIds = memberships.map((membership) => membership.organizationId);
    }

    const events = await this.prisma.event.findMany({
      where: organizationId
        ? { organizationId }
        : {
            OR: [
              { organizationId: { in: organizationIds } },
              { organizationId: null, ownerId: userId },
            ],
          },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        wizardSessions: {
          where: { flowVersion: 'v2' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            flowVersion: true,
            currentStep: true,
            completionPercent: true,
            status: true,
            lastSavedAt: true,
          },
        },
        capabilities: {
          where: { status: 'ACTIVE' },
          select: { code: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return events.map(({ wizardSessions, capabilities, ...event }) => {
      const wizard = wizardSessions[0] ?? null;
      return {
        ...event,
        wizard: wizard
          ? {
              ...wizard,
              completionPercent: wizard.status === 'COMPLETED' ? 100 : wizard.completionPercent,
            }
          : null,
        capabilityCodes: capabilities.map((capability) => capability.code),
      };
    });
  }

  async create(userId: string, dto: CreateEventDto) {
    let organizationId = dto.organizationId;

    if (organizationId) {
      await this.authorization.requireRole(userId, organizationId, EVENT_EDITOR_ROLES);
    } else {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          status: MembershipStatus.ACTIVE,
          role: { in: [...EVENT_EDITOR_ROLES] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!membership) throw new NotFoundException('Nenhuma organização disponível para criar o evento.');
      organizationId = membership.organizationId;
    }

    const eventType = dto.eventType.trim();
    const timeZone = dto.timeZone ? normalizeEventTimeZone(dto.timeZone) : undefined;
    if (dto.timeZone && !timeZone) throw new BadRequestException('Fuso horário do evento inválido.');
    let subjectAreas: string[] = [];
    if (dto.subjectAreas !== undefined) {
      const parsed = parseSubjectAreas(dto.subjectAreas);
      if ('error' in parsed) throw new BadRequestException(parsed.error);
      subjectAreas = parsed.subjectAreas;
    }
    const publicSlug = eventPublicSlug(dto.name, randomBytes(6).toString('hex'));
    // O identificador é criado uma vez; alterações editoriais não mudam links divulgados.
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ownerId: userId,
          createdById: userId,
          organizationId,
          name: dto.name.trim(),
          slug: publicSlug,
          eventType,
          subjectAreas,
          profileCode: inferEventProfileCode(eventType),
          format: dto.format,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          timeZone: timeZone ?? null,
          venue: dto.venue?.trim() || null,
          registrationMode: dto.registrationMode,
          status: 'SETUP',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.created',
          entityType: 'Event',
          entityId: event.id,
          metadata: { profileCode: event.profileCode, subjectAreas },
        },
      });
      return event;
    });
  }

  /**
   * Agenda de evento JÁ PUBLICADO: datas, fuso e local. Contrato #661 (C-05).
   *
   * Delimitado de propósito. `assertFoundationMutable` NÃO foi ampliada: os
   * demais campos e os demais estados seguem com a regra de hoje, e este
   * comando recusa qualquer estado que não seja PUBLISHED, nomeando o estado.
   *
   * Escreve em UMA tabela, `Event`, mais a auditoria. Lote, inscrição,
   * submissão, programação e financeiro não são tocados — por construção, não
   * por intenção.
   */
  async updateSchedule(userId: string, eventId: string, input: unknown) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, ownerId: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    const organizationId = event.organizationId;
    if (!organizationId) {
      throw new BadRequestException('O evento precisa estar vinculado a uma organização.');
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Pedido inválido.');
    }
    const corpo = input as Record<string, unknown>;

    // Campo desconhecido é RECUSADO, não ignorado. Sem isto, quem mandasse
    // `status` junto veria 200 e concluiria que mudou o estado do evento.
    const desconhecidos = Object.keys(corpo).filter(
      (chave) => !(CAMPOS_DA_AGENDA as readonly string[]).includes(chave),
    );
    if (desconhecidos.length > 0) {
      throw new BadRequestException(
        `Esta alteração aceita apenas datas, fuso e local. Campo não aceito: ${desconhecidos.sort().join(', ')}.`,
      );
    }

    const esperado = typeof corpo.expectedUpdatedAt === 'string' ? corpo.expectedUpdatedAt : null;
    if (!esperado) {
      throw new BadRequestException(
        'Informe expectedUpdatedAt com o valor recebido na última leitura do evento.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Mesma trava que `updateSubjectAreas` usa: serializa com o save/complete
      // do Wizard e com outra chamada desta rota.
      const [atual] = await tx.$queryRaw<Array<{
        status: EventStatus;
        startDate: Date | null;
        endDate: Date | null;
        timeZone: string | null;
        venue: string | null;
        format: FormatoDoEvento;
        updatedAt: Date;
      }>>`
        SELECT "status", "startDate", "endDate", "timeZone", "venue", "format", "updatedAt"
        FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
      if (!atual) throw new NotFoundException('Evento não encontrado.');

      if (atual.status !== EventStatus.PUBLISHED) {
        throw new ConflictException({
          code: 'INVALID_EVENT_STATE',
          message: 'Esta alteração vale apenas para evento publicado. Use a configuração do evento enquanto ele não estiver publicado.',
          context: { eventStatus: atual.status },
        });
      }

      // Confirmação otimista por cima da trava: a trava serializa, mas só o
      // `expectedUpdatedAt` conta ao organizador que a tela dele estava velha.
      // É o caso das duas abas.
      if (atual.updatedAt.toISOString() !== esperado) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Este evento foi alterado em outra sessão. Recarregue para ver os valores atuais antes de salvar.',
        });
      }

      const plano = planejarAlteracaoDeAgenda(
        {
          startDate: atual.startDate,
          endDate: atual.endDate,
          timeZone: atual.timeZone,
          venue: atual.venue,
          format: atual.format,
        },
        {
          startDate: corpo.startDate as string | null | undefined,
          endDate: corpo.endDate as string | null | undefined,
          timeZone: corpo.timeZone as string | null | undefined,
          venue: corpo.venue as string | null | undefined,
          motivo: corpo.motivo,
        },
      );
      if (!plano.ok) throw new BadRequestException(plano.erros);

      // O intervalo é avaliado sobre o RESULTADO, não sobre o que veio no
      // corpo: mandar só o término compara com o início já gravado. Mesma regra
      // do Wizard, chamada e não copiada.
      const intervalo = getWizardSaveIssues(plano.depois);
      if (intervalo.length > 0) throw new BadRequestException(intervalo);

      const atualizado = await tx.event.update({
        where: { id: event.id },
        data: {
          startDate: plano.depois.startDate ? new Date(plano.depois.startDate) : null,
          endDate: plano.depois.endDate ? new Date(plano.depois.endDate) : null,
          timeZone: plano.depois.timeZone,
          venue: plano.depois.venue,
        },
        select: { startDate: true, endDate: true, timeZone: true, venue: true, updatedAt: true },
      });

      // Mesma sincronização de `updateSubjectAreas`: o GET do Wizard usa `??`
      // sobre a sessão; limpar término/local no Event sem gravar null na sessão
      // ressuscita o valor antigo ao reabrir a configuração.
      const session = await tx.eventWizardSession.findUnique({
        where: { eventId_flowVersion: { eventId: event.id, flowVersion: WIZARD_FLOW_VERSION } },
        select: { id: true, answers: true, revision: true, status: true },
      });
      let wizardRevision: number | null = null;
      if (session) {
        const stored =
          session.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
            ? (session.answers as Prisma.JsonObject)
            : {};
        const answers: Prisma.JsonObject = {
          ...stored,
          startDate: atualizado.startDate?.toISOString() ?? null,
          endDate: atualizado.endDate?.toISOString() ?? null,
          timeZone: atualizado.timeZone,
          venue: atualizado.venue,
        };
        const synced = await tx.eventWizardSession.updateMany({
          where: { id: session.id, revision: session.revision },
          data: {
            answers,
            revision: { increment: 1 },
            ...(session.status === WizardSessionStatus.ACTIVE
              ? { completionPercent: getWizardCompletion(normalizeWizardAnswers(answers)) }
              : {}),
          },
        });
        if (synced.count !== 1) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message:
              'Este evento foi atualizado em outra sessão. Recarregue para ver os valores atuais antes de salvar.',
          });
        }
        wizardRevision = session.revision + 1;
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.schedule_updated',
          entityType: 'Event',
          entityId: event.id,
          metadata: {
            motivo: plano.motivo,
            alterados: plano.alterados,
            antes: plano.antes,
            depois: plano.depois,
            wizardRevision,
          } as Prisma.InputJsonObject,
        },
      });

      // `updatedAt` volta para a tela usar como próximo `expectedUpdatedAt`, e
      // `alterados` permite confirmar o que mudou sem adivinhar.
      return {
        startDate: atualizado.startDate?.toISOString() ?? null,
        endDate: atualizado.endDate?.toISOString() ?? null,
        timeZone: atualizado.timeZone,
        venue: atualizado.venue,
        updatedAt: atualizado.updatedAt.toISOString(),
        alterados: plano.alterados,
        wizardRevision,
      };
    });
  }

  async updateSubjectAreas(userId: string, eventId: string, input: unknown) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, ownerId: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    const parsed = parseSubjectAreas(
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as { subjectAreas?: unknown }).subjectAreas
        : undefined,
    );
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    const { subjectAreas } = parsed;

    return this.prisma.$transaction(async (tx) => {
      // O save/complete do Wizard atualiza o Event antes da sessão; travar a mesma
      // linha aqui serializa as duas escritas e o CAS da revisão recusa o rascunho antigo.
      const [locked] = await tx.$queryRaw<{ status: EventStatus }[]>`
        SELECT "status" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
      if (!locked) throw new NotFoundException('Evento não encontrado.');
      if (locked.status === EventStatus.CANCELLED) {
        throw new ConflictException('Um evento cancelado não entra na busca por área.');
      }

      const updated = await tx.event.update({
        where: { id: event.id },
        data: { subjectAreas },
        select: { subjectAreas: true },
      });

      const session = await tx.eventWizardSession.findUnique({
        where: { eventId_flowVersion: { eventId: event.id, flowVersion: WIZARD_FLOW_VERSION } },
        select: { id: true, answers: true, revision: true, status: true },
      });
      let wizardRevision: number | null = null;
      if (session) {
        const stored = session.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
          ? session.answers as Prisma.JsonObject
          : {};
        const answers: Prisma.JsonObject = { ...stored, subjectAreas };
        const synced = await tx.eventWizardSession.updateMany({
          where: { id: session.id, revision: session.revision },
          data: {
            answers,
            revision: { increment: 1 },
            ...(session.status === WizardSessionStatus.ACTIVE
              ? { completionPercent: getWizardCompletion(normalizeWizardAnswers(answers)) }
              : {}),
          },
        });
        if (synced.count !== 1) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Este evento foi atualizado em outra sessão. Recarregue para salvar a área de atuação.',
          });
        }
        wizardRevision = session.revision + 1;
      }

      if (event.organizationId) {
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: 'event.subject_areas_updated',
            entityType: 'Event',
            entityId: event.id,
            metadata: { subjectAreas, wizardRevision },
          },
        });
      }
      return { subjectAreas: updated.subjectAreas, wizardRevision };
    });
  }
}
