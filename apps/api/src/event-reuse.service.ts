import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, Prisma, WizardSessionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { eventReuseHash, parseEventReuseInput, requireEventReuseKey } from './event-reuse.policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { eventPublicSlug } from './slug';
import { WIZARD_FLOW_VERSION, getWizardCompletion, normalizeWizardAnswers } from './wizard-policy';

const REUSE_EXCLUSIONS = [
  'participantes e inscrições',
  'pagamentos, cobranças e reembolsos',
  'submissões, avaliações e arquivos científicos',
  'pessoas, palestrantes e convites',
  'check-in, presença e credenciais',
  'mensagens, webhooks e chaves',
  'mídias privadas e dados financeiros',
] as const;

type ReuseAuditMetadata = {
  sourceEventId?: string;
  payloadHash?: string;
  idempotencyKeyHash?: string;
};

@Injectable()
export class EventReuseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async reuse(userId: string, sourceEventId: string, rawKey: unknown, rawInput: unknown) {
    const idempotencyKey = requireEventReuseKey(rawKey);
    const input = parseEventReuseInput(rawInput);
    const source = await this.prisma.event.findUnique({
      where: { id: sourceEventId },
      include: {
        capabilities: {
          where: { status: CapabilityStatus.ACTIVE },
          select: { code: true, schemaVersion: true },
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!source?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const organizationId = source.organizationId;
    await this.authorization.requireRole(userId, organizationId, EVENT_EDITOR_ROLES);
    if (input.confirmationName !== source.name) {
      throw new ConflictException('Digite exatamente o nome do evento de origem para confirmar.');
    }

    const keyHash = eventReuseHash(idempotencyKey);
    const payloadHash = eventReuseHash({
      sourceEventId,
      name: input.name,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
      timeZone: input.timeZone,
      copyVenue: input.copyVenue,
      copyCapabilities: input.copyCapabilities,
    });

    return this.prisma.$transaction(async (tx) => {
      const lockScope = `event-reuse:${organizationId}:${userId}:${keyHash}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockScope}))`;
      const previous = await tx.auditLog.findFirst({
        where: {
          organizationId,
          actorUserId: userId,
          action: 'event.reused',
          metadata: { path: ['idempotencyKeyHash'], equals: keyHash },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (previous) {
        const metadata = previous.metadata as ReuseAuditMetadata | null;
        if (metadata?.sourceEventId !== sourceEventId || metadata?.payloadHash !== payloadHash) {
          throw new ConflictException('A chave de idempotência já foi usada com outros dados.');
        }
        const event = previous.entityId
          ? await tx.event.findFirst({ where: { id: previous.entityId, organizationId } })
          : null;
        if (!event) throw new ConflictException('A reutilização anterior não pôde ser recuperada.');
        return { event, replay: true, exclusions: REUSE_EXCLUSIONS };
      }

      const copiedCodes = input.copyCapabilities ? source.capabilities.map((item) => item.code) : [];
      const answers = normalizeWizardAnswers({
        eventType: source.eventType,
        profileCode: source.profileCode ?? undefined,
        format: source.format,
        name: input.name,
        startDate: input.startDate.toISOString(),
        endDate: input.endDate.toISOString(),
        timeZone: input.timeZone,
        datesPending: false,
        estimatedAudience: source.estimatedAudience ?? undefined,
        audiencePending: source.estimatedAudience == null,
        venue: input.copyVenue ? source.venue ?? undefined : undefined,
        venuePending: !input.copyVenue || !source.venue,
        registrationMode: source.registrationMode,
        capabilities: copiedCodes,
        capabilitiesCustomized: true,
        subjectAreas: source.subjectAreas,
      });
      const normalizedCapabilities = answers.capabilities ?? [];
      const capabilityVersions = new Map(source.capabilities.map((item) => [item.code, item.schemaVersion]));
      const publicCode = eventReuseHash({ sourceEventId, keyHash, payloadHash }).slice(0, 12);
      const event = await tx.event.create({
        data: {
          ownerId: userId,
          createdById: userId,
          organizationId,
          name: input.name,
          slug: eventPublicSlug(input.name, publicCode),
          eventType: source.eventType,
          subjectAreas: source.subjectAreas,
          profileCode: source.profileCode,
          format: source.format,
          startDate: input.startDate,
          endDate: input.endDate,
          timeZone: input.timeZone,
          venue: input.copyVenue ? source.venue : null,
          estimatedAudience: source.estimatedAudience,
          registrationMode: source.registrationMode,
          status: 'SETUP',
          capabilities: {
            create: normalizedCapabilities.map((code) => ({
              code,
              status: CapabilityStatus.ACTIVE,
              schemaVersion: capabilityVersions.get(code) ?? 1,
            })),
          },
          wizardSessions: {
            create: {
              flowVersion: WIZARD_FLOW_VERSION,
              currentStep: 'review',
              answers: answers as Prisma.InputJsonValue,
              completionPercent: getWizardCompletion(answers),
              status: WizardSessionStatus.ACTIVE,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.reused',
          entityType: 'Event',
          entityId: event.id,
          metadata: {
            sourceEventId,
            idempotencyKeyHash: keyHash,
            payloadHash,
            copiedVenue: input.copyVenue,
            capabilityCodes: normalizedCapabilities,
            exclusions: [...REUSE_EXCLUSIONS],
          },
        },
      });
      return { event, replay: false, exclusions: REUSE_EXCLUSIONS };
    });
  }
}
