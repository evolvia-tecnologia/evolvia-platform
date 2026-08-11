import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CapabilityStatus,
  EventFormat,
  EventStatus,
  MembershipStatus,
  Prisma,
  RegistrationMode,
  WizardSessionStatus,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { SaveEventWizardDto, StartEventWizardDto } from './dto';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { slugify } from './slug';
import {
  CAPABILITY_CATALOG,
  WIZARD_FLOW_VERSION,
  capabilityStatus,
  getRecommendedCapabilities,
  getWizardCompletion,
  getWizardCompletionIssues,
  isCapabilityRequired,
  isWizardStep,
  normalizeWizardAnswers,
  publicWizardSession,
  type WizardAnswers,
} from './wizard-policy';

@Injectable()
export class EventWizardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async start(userId: string, dto: StartEventWizardDto) {
    const organizationId = await this.resolveOrganization(userId, dto.organizationId);
    const eventType = dto.eventType.trim();
    const answers = normalizeWizardAnswers({
      organizationId,
      eventType,
      capabilitiesCustomized: false,
    });

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          ownerId: userId,
          createdById: userId,
          organizationId,
          name: 'Novo evento',
          slug: `rascunho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          eventType,
          profileCode: answers.profileCode,
          format: EventFormat.IN_PERSON,
          registrationMode: RegistrationMode.FREE,
          status: EventStatus.DRAFT,
        },
      });

      await tx.eventWizardSession.create({
        data: {
          eventId: created.id,
          flowVersion: WIZARD_FLOW_VERSION,
          currentStep: 'format',
          answers: answers as Prisma.InputJsonValue,
          completionPercent: getWizardCompletion(answers),
          status: WizardSessionStatus.ACTIVE,
        },
      });

      await this.syncCapabilities(tx, created.id, answers.capabilities ?? []);

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventId: created.id,
          action: 'event.wizard_started',
          entityType: 'EventWizardSession',
          entityId: created.id,
          metadata: { flowVersion: WIZARD_FLOW_VERSION, profileCode: answers.profileCode },
        },
      });

      return created;
    });

    return this.get(userId, event.id);
  }

  async get(userId: string, eventId: string) {
    const event = await this.requireReadableEvent(userId, eventId);
    let session = await this.prisma.eventWizardSession.findUnique({
      where: { eventId_flowVersion: { eventId, flowVersion: WIZARD_FLOW_VERSION } },
    });

    if (!session) session = await this.bootstrapExistingEvent(userId, event);

    const answers = normalizeWizardAnswers(session.answers);
    const selected = new Set(answers.capabilities ?? []);

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        profileCode: event.profileCode,
        organizationId: event.organizationId,
        organization: event.organization,
        updatedAt: event.updatedAt,
      },
      session: publicWizardSession(session),
      answers,
      capabilityCatalog: CAPABILITY_CATALOG.map((item) => ({
        ...item,
        required: item.required === true || isCapabilityRequired(item.code, answers.profileCode),
        selected: selected.has(item.code),
        recommended: getRecommendedCapabilities(
          answers.profileCode,
          answers.registrationMode,
        ).includes(item.code),
      })),
    };
  }

  async save(userId: string, eventId: string, dto: SaveEventWizardDto) {
    if (!isWizardStep(dto.currentStep)) throw new BadRequestException('Etapa do Wizard inválida.');

    const event = await this.requireReadableEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    const answers = normalizeWizardAnswers(dto.answers);

    await this.prisma.$transaction(async (tx) => {
      await this.persistEventData(tx, event.id, answers);
      await this.syncCapabilities(tx, event.id, answers.capabilities ?? []);

      const updated = await tx.eventWizardSession.updateMany({
        where: {
          eventId,
          flowVersion: WIZARD_FLOW_VERSION,
          revision: dto.revision,
          status: { in: [WizardSessionStatus.ACTIVE, WizardSessionStatus.COMPLETED] },
        },
        data: {
          currentStep: dto.currentStep,
          answers: answers as Prisma.InputJsonValue,
          completionPercent: getWizardCompletion(answers),
          status: WizardSessionStatus.ACTIVE,
          lastSavedAt: new Date(),
          revision: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Este rascunho foi atualizado em outra sessão. Recarregue para continuar com a versão mais recente.',
        });
      }
    });

    return this.get(userId, eventId);
  }

  async complete(userId: string, eventId: string, dto: SaveEventWizardDto) {
    const event = await this.requireReadableEvent(userId, eventId);
    const nextStatus = this.mutationPolicy.statusAfterFoundationCompletion(event.status);
    const answers = normalizeWizardAnswers(dto.answers);
    const issues = getWizardCompletionIssues(answers);
    if (issues.length > 0) throw new BadRequestException(issues);

    await this.prisma.$transaction(async (tx) => {
      await this.persistEventData(tx, event.id, answers);
      await this.syncCapabilities(tx, event.id, answers.capabilities ?? []);

      const updated = await tx.eventWizardSession.updateMany({
        where: {
          eventId,
          flowVersion: WIZARD_FLOW_VERSION,
          revision: dto.revision,
          status: { in: [WizardSessionStatus.ACTIVE, WizardSessionStatus.COMPLETED] },
        },
        data: {
          currentStep: 'review',
          answers: answers as Prisma.InputJsonValue,
          completionPercent: 100,
          status: WizardSessionStatus.COMPLETED,
          lastSavedAt: new Date(),
          revision: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Este rascunho foi atualizado em outra sessão. Recarregue para concluir com segurança.',
        });
      }

      if (nextStatus !== event.status) {
        await tx.event.update({ where: { id: event.id }, data: { status: nextStatus } });
      }

      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.wizard_completed',
          entityType: 'EventWizardSession',
          entityId: event.id,
          metadata: {
            flowVersion: WIZARD_FLOW_VERSION,
            profileCode: answers.profileCode,
            previousStatus: event.status,
            resultingStatus: nextStatus,
            capabilities: answers.capabilities ?? [],
          },
        },
      });
    });

    return this.get(userId, eventId);
  }

  private async resolveOrganization(userId: string, requestedId?: string) {
    if (requestedId) {
      await this.authorization.requireRole(userId, requestedId, EVENT_EDITOR_ROLES);
      return requestedId;
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        role: { in: [...EVENT_EDITOR_ROLES] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) throw new NotFoundException('Nenhuma organização disponível para criar o evento.');
    return membership.organizationId;
  }

  private async requireReadableEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        capabilities: {
          where: { status: CapabilityStatus.ACTIVE },
          select: { code: true },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!event) throw new NotFoundException('Evento não encontrado.');

    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    return event;
  }

  private async bootstrapExistingEvent(
    userId: string,
    event: Awaited<ReturnType<EventWizardService['requireReadableEvent']>>,
  ) {
    const existingCodes = event.capabilities.map((capability) => capability.code);
    const answers = normalizeWizardAnswers({
      organizationId: event.organizationId ?? undefined,
      eventType: event.eventType,
      profileCode: event.profileCode ?? undefined,
      format: event.format,
      name: event.name,
      startDate: event.startDate?.toISOString() ?? null,
      endDate: event.endDate?.toISOString() ?? null,
      datesPending: !event.startDate,
      venue: event.venue,
      venuePending: !event.venue,
      registrationMode: event.registrationMode,
      capabilities: existingCodes.length > 0
        ? existingCodes
        : getRecommendedCapabilities(event.profileCode ?? undefined, event.registrationMode),
      capabilitiesCustomized: existingCodes.length > 0,
    });
    const completed = event.status !== EventStatus.DRAFT;

    return this.prisma.$transaction(async (tx) => {
      // A leitura de um evento legado pode criar apenas a sessão de apoio do Wizard.
      // Capabilities nunca são alteradas por GET, especialmente em eventos publicados
      // ou encerrados; a persistência ocorre somente em save/complete com estado mutável.
      const session = await tx.eventWizardSession.upsert({
        where: { eventId_flowVersion: { eventId: event.id, flowVersion: WIZARD_FLOW_VERSION } },
        create: {
          eventId: event.id,
          flowVersion: WIZARD_FLOW_VERSION,
          currentStep: completed ? 'review' : 'profile',
          answers: answers as Prisma.InputJsonValue,
          completionPercent: completed ? 100 : getWizardCompletion(answers),
          status: completed ? WizardSessionStatus.COMPLETED : WizardSessionStatus.ACTIVE,
        },
        update: {},
      });

      if (event.organizationId) {
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: 'event.wizard_bootstrapped',
            entityType: 'EventWizardSession',
            entityId: session.id,
            metadata: { flowVersion: WIZARD_FLOW_VERSION, profileCode: answers.profileCode },
          },
        });
      }
      return session;
    });
  }

  private async persistEventData(tx: Prisma.TransactionClient, eventId: string, answers: WizardAnswers) {
    const data: Prisma.EventUpdateInput = {};
    if (answers.eventType) data.eventType = answers.eventType;
    if (answers.profileCode) data.profileCode = answers.profileCode;
    if (answers.format) data.format = answers.format;
    if (answers.name) {
      data.name = answers.name;
      const base = slugify(answers.name) || 'evento';
      const current = await tx.event.findUnique({ where: { id: eventId }, select: { slug: true } });
      if (current?.slug.startsWith('rascunho-')) data.slug = `${base}-${eventId.slice(-7).toLowerCase()}`;
    }
    if (answers.startDate || answers.datesPending) data.startDate = answers.startDate ? new Date(answers.startDate) : null;
    if (answers.endDate || answers.datesPending) data.endDate = answers.endDate ? new Date(answers.endDate) : null;
    if (answers.venue !== undefined || answers.venuePending) data.venue = answers.venue ?? null;
    if (answers.registrationMode) data.registrationMode = answers.registrationMode;
    await tx.event.update({ where: { id: eventId }, data });
  }

  private async syncCapabilities(tx: Prisma.TransactionClient, eventId: string, selectedCodes: string[]) {
    const selected = new Set(selectedCodes);
    await Promise.all(
      CAPABILITY_CATALOG.map((definition) =>
        tx.eventCapability.upsert({
          where: { eventId_code: { eventId, code: definition.code } },
          create: {
            eventId,
            code: definition.code,
            status: capabilityStatus(selected.has(definition.code)),
            schemaVersion: 1,
            config: {},
          },
          update: { status: capabilityStatus(selected.has(definition.code)) },
        }),
      ),
    );
  }
}
