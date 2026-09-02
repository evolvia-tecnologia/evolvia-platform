import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventProfileCode, Prisma, ScientificReviewMode, ScientificSubmissionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  pickScientificNumericRules,
  resolveScientificNumericRules,
  SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
} from './scientific-submission-numeric-rules';
import { requiresImmutableSubmittedVersion } from './scientific-submission-policy';
import { normalizeScientificText } from './scientific-structure-policy';

export type ConfigureScientificSubmissionsInput = {
  requireArea?: boolean;
  requireSubarea?: boolean;
  requireFile?: boolean;
  maxSubmissionsPerAuthor?: number;
  minAuthors?: number;
  maxAuthors?: number | null;
  requirePresenter?: boolean;
  requireCorrespondingAuthor?: boolean;
  requireAuthorInstitution?: boolean;
  titleMaxLength?: number;
  minKeywords?: number;
  maxKeywords?: number;
  presentationFormats?: Array<{ code: string; label: string }>;
  reviewMode?: ScientificReviewMode;
  allowCorrections?: boolean;
};

export type CreateScientificSubmissionModalityInput = {
  name: string;
  description?: string;
  rules?: Record<string, unknown>;
};

/**
 * Serviço administrativo do Gate A6.
 *
 * Esta superfície pertence ao organizador e, por contrato, NÃO cria trabalhos,
 * NÃO altera autoria e NÃO submete/corrige versões. Essas ações pertencem ao
 * portal do autor, que exige identidade própria de participante antes de ser exposto.
 */
@Injectable()
export class ScientificSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async getManagement(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const [config, modalities, submissions] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({
        where: { eventId_organizationId: scope },
      }),
      this.prisma.scientificSubmissionModality.findMany({
        where: scope,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.scientificSubmission.findMany({
        where: scope,
        include: {
          modality: true,
          authors: { include: { person: true }, orderBy: { sortOrder: 'asc' } },
          versions: { orderBy: { versionNumber: 'desc' } },
          taxonomyArea: true,
          taxonomySubarea: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const defaultPresentationFormats = [
      { code: 'ORAL', label: 'Oral' },
      { code: 'POSTER', label: 'Pôster' },
      { code: 'EPOSTER', label: 'Pôster digital / ePoster' },
    ];
    const effectiveConfig = config ? {
      ...config,
      presentationFormats: this.readPresentationFormats(config.presentationFormats, defaultPresentationFormats),
    } : {
      requireArea: false,
      requireSubarea: false,
      requireFile: false,
      ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
      requirePresenter: true,
      requireCorrespondingAuthor: true,
      requireAuthorInstitution: true,
      presentationFormats: defaultPresentationFormats,
      reviewMode: ScientificReviewMode.SINGLE_BLIND,
      allowCorrections: true,
    };

    return {
      event: { id: event.id, name: event.name, status: event.status, organizationId: event.organizationId },
      config: effectiveConfig,
      modalities,
      submissions,
      summary: {
        total: submissions.length,
        drafts: submissions.filter((item) => item.status === ScientificSubmissionStatus.DRAFT || item.status === ScientificSubmissionStatus.INCOMPLETE).length,
        submitted: submissions.filter((item) => requiresImmutableSubmittedVersion(item.status)).length,
      },
      actorBoundary: {
        management: 'ORGANIZER',
        authorActionsAvailableHere: false,
        message: 'O organizador configura e acompanha o processo. Criar, editar, corrigir e submeter trabalhos é responsabilidade do autor em área própria.',
      },
      nextAction: modalities.some((item) => item.active)
        ? 'Revise as regras e modalidades. Os autores criarão e submeterão os trabalhos em uma área própria, separada do painel administrativo.'
        : 'Cadastre ao menos uma modalidade antes de disponibilizar o processo de submissão aos autores.',
    };
  }

  async configure(userId: string, eventId: string, dto: ConfigureScientificSubmissionsInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    if (dto.requireSubarea && !dto.requireArea) {
      throw new BadRequestException('Para exigir subárea, a área científica também precisa estar habilitada como obrigatória.');
    }
    const presentationFormats = dto.presentationFormats === undefined
      ? undefined
      : this.normalizePresentationFormats(dto.presentationFormats);
    const existing = await this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } });
    const numeric = resolveScientificNumericRules(
      pickScientificNumericRules(existing),
      pickScientificNumericRules(dto),
    );
    if (!numeric.ok) {
      throw new BadRequestException({
        message: numeric.errors[0].message,
        fields: numeric.errors,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const config = await tx.scientificSubmissionConfig.upsert({
        where: { eventId_organizationId: scope },
        create: {
          ...scope,
          requireArea: dto.requireArea ?? false,
          requireSubarea: dto.requireSubarea ?? false,
          requireFile: dto.requireFile ?? false,
          ...numeric.rules,
          requirePresenter: dto.requirePresenter ?? true,
          requireCorrespondingAuthor: dto.requireCorrespondingAuthor ?? true,
          requireAuthorInstitution: dto.requireAuthorInstitution ?? true,
          presentationFormats: presentationFormats as Prisma.InputJsonArray | undefined,
          reviewMode: dto.reviewMode ?? ScientificReviewMode.SINGLE_BLIND,
          allowCorrections: dto.allowCorrections ?? true,
        },
        update: {
          ...(dto.requireArea !== undefined ? { requireArea: dto.requireArea } : {}),
          ...(dto.requireSubarea !== undefined ? { requireSubarea: dto.requireSubarea } : {}),
          ...(dto.requireFile !== undefined ? { requireFile: dto.requireFile } : {}),
          ...numeric.rules,
          ...(dto.requirePresenter !== undefined ? { requirePresenter: dto.requirePresenter } : {}),
          ...(dto.requireCorrespondingAuthor !== undefined ? { requireCorrespondingAuthor: dto.requireCorrespondingAuthor } : {}),
          ...(dto.requireAuthorInstitution !== undefined ? { requireAuthorInstitution: dto.requireAuthorInstitution } : {}),
          ...(presentationFormats !== undefined ? { presentationFormats: presentationFormats as Prisma.InputJsonArray } : {}),
          ...(dto.reviewMode !== undefined ? { reviewMode: dto.reviewMode } : {}),
          ...(dto.allowCorrections !== undefined ? { allowCorrections: dto.allowCorrections } : {}),
        },
      });
      await this.audit(tx, event, userId, 'scientific.submission_config_updated', 'ScientificSubmissionConfig', config.id, {
        changedFields: Object.keys(dto),
      });
    });
    return this.getManagement(userId, eventId);
  }

  async createModality(userId: string, eventId: string, dto: CreateScientificSubmissionModalityInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const name = normalizeScientificText(dto.name, 120);
    const code = this.slug(name);
    try {
      await this.prisma.$transaction(async (tx) => {
        const modality = await tx.scientificSubmissionModality.create({
          data: {
            ...scope,
            code,
            name,
            description: this.optional(dto.description, 600),
            rules: (dto.rules ?? undefined) as Prisma.InputJsonObject | undefined,
          },
        });
        await this.audit(tx, event, userId, 'scientific.submission_modality_created', 'ScientificSubmissionModality', modality.id, { code });
      });
    } catch (reason) {
      if (this.isUnique(reason)) throw new BadRequestException('Já existe uma modalidade com este nome neste evento.');
      throw reason;
    }
    return this.getManagement(userId, eventId);
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('As configurações de submissão científica estão disponíveis apenas para eventos técnico-científicos.');
    }
    if (!event.organizationId) throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    return event;
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private optional(value: string | undefined, maxLength: number) {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private normalizePresentationFormats(items: Array<{ code: string; label: string }>) {
    if (!items.length || items.length > 20) throw new BadRequestException('Informe entre 1 e 20 formas de apresentação.');
    const seen = new Set<string>();
    return items.map((item) => {
      const label = normalizeScientificText(item.label, 80);
      const code = this.slug(item.code || label).toUpperCase().replace(/-/g, '_');
      if (!code || seen.has(code)) throw new BadRequestException('As formas de apresentação devem possuir códigos únicos.');
      seen.add(code);
      return { code, label };
    });
  }

  private readPresentationFormats(value: Prisma.JsonValue | null, fallback: Array<{ code: string; label: string }>) {
    if (!Array.isArray(value)) return fallback;
    const items = value.filter((item): item is { code: string; label: string } =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
      && 'code' in item && 'label' in item
      && typeof item.code === 'string' && typeof item.label === 'string');
    return items.length ? items : fallback;
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
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId!,
        eventId: event.id,
        actorUserId,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }
}
