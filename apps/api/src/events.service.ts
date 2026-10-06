import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EventStatus, MembershipStatus, Prisma, WizardSessionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { CreateEventDto } from './dto';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { eventPublicSlug } from './slug';
import { normalizeEventTimeZone } from './time-zone-policy';
import {
  WIZARD_FLOW_VERSION,
  getWizardCompletion,
  inferEventProfileCode,
  normalizeWizardAnswers,
  parseSubjectAreas,
} from './wizard-policy';

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
