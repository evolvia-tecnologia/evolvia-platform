import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificReviewMode,
  ScientificSubmissionStatus,
  ScientificTaxonomyLevel,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  canTransitionSubmission,
  requiresImmutableSubmittedVersion,
  validateSubmissionForSubmit,
} from './scientific-submission-policy';
import { normalizeScientificText } from './scientific-structure-policy';

export type ConfigureScientificSubmissionsInput = {
  requireArea?: boolean;
  requireSubarea?: boolean;
  requireFile?: boolean;
  minAuthors?: number;
  maxAuthors?: number | null;
  reviewMode?: ScientificReviewMode;
  allowCorrections?: boolean;
};

export type CreateScientificSubmissionModalityInput = {
  name: string;
  description?: string;
  rules?: Record<string, unknown>;
};

export type CreateScientificSubmissionInput = {
  modalityId: string;
  title: string;
  abstractText?: string;
  keywords?: string[];
  taxonomyAreaId?: string;
  taxonomySubareaId?: string;
};

export type AddScientificSubmissionAuthorInput = {
  personId: string;
  sortOrder: number;
  isPresenter?: boolean;
  isCorresponding?: boolean;
};

export type SubmitScientificSubmissionInput = {
  fileKey?: string;
  contentHash?: string;
};

@Injectable()
export class ScientificSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const [config, modalities, submissions, people, taxonomy] = await Promise.all([
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
      this.prisma.scientificPerson.findMany({
        where: { ...scope, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      this.prisma.scientificTaxonomyNode.findMany({
        where: { ...scope, active: true },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      event: { id: event.id, name: event.name, status: event.status, organizationId: event.organizationId },
      config: config ?? {
        requireArea: false,
        requireSubarea: false,
        requireFile: false,
        minAuthors: 1,
        maxAuthors: null,
        reviewMode: ScientificReviewMode.SINGLE_BLIND,
        allowCorrections: true,
      },
      modalities,
      submissions,
      people,
      taxonomy,
      summary: {
        total: submissions.length,
        drafts: submissions.filter((item) => item.status === ScientificSubmissionStatus.DRAFT || item.status === ScientificSubmissionStatus.INCOMPLETE).length,
        submitted: submissions.filter((item) => requiresImmutableSubmittedVersion(item.status)).length,
      },
      nextAction: modalities.some((item) => item.active)
        ? submissions.length
          ? 'Revise os trabalhos e conclua os rascunhos antes do prazo de submissão.'
          : 'Crie o primeiro trabalho e adicione os autores em ordem.'
        : 'Cadastre ao menos uma modalidade de submissão antes de abrir o portal do autor.',
    };
  }

  async configure(userId: string, eventId: string, dto: ConfigureScientificSubmissionsInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const minAuthors = dto.minAuthors ?? 1;
    const maxAuthors = dto.maxAuthors === undefined ? null : dto.maxAuthors;
    if (minAuthors < 1) throw new BadRequestException('O mínimo de autores deve ser pelo menos 1.');
    if (maxAuthors !== null && maxAuthors < minAuthors) {
      throw new BadRequestException('O máximo de autores não pode ser menor que o mínimo.');
    }
    if (dto.requireSubarea && !dto.requireArea) {
      throw new BadRequestException('Para exigir subárea, a área científica também precisa estar habilitada como obrigatória.');
    }

    await this.prisma.$transaction(async (tx) => {
      const config = await tx.scientificSubmissionConfig.upsert({
        where: { eventId_organizationId: scope },
        create: {
          ...scope,
          requireArea: dto.requireArea ?? false,
          requireSubarea: dto.requireSubarea ?? false,
          requireFile: dto.requireFile ?? false,
          minAuthors,
          maxAuthors,
          reviewMode: dto.reviewMode ?? ScientificReviewMode.SINGLE_BLIND,
          allowCorrections: dto.allowCorrections ?? true,
        },
        update: {
          ...(dto.requireArea !== undefined ? { requireArea: dto.requireArea } : {}),
          ...(dto.requireSubarea !== undefined ? { requireSubarea: dto.requireSubarea } : {}),
          ...(dto.requireFile !== undefined ? { requireFile: dto.requireFile } : {}),
          ...(dto.minAuthors !== undefined ? { minAuthors: dto.minAuthors } : {}),
          ...(dto.maxAuthors !== undefined ? { maxAuthors: dto.maxAuthors } : {}),
          ...(dto.reviewMode !== undefined ? { reviewMode: dto.reviewMode } : {}),
          ...(dto.allowCorrections !== undefined ? { allowCorrections: dto.allowCorrections } : {}),
        },
      });
      await this.audit(tx, event, userId, 'scientific.submission_config_updated', 'ScientificSubmissionConfig', config.id, {
        changedFields: Object.keys(dto),
      });
    });
    return this.get(userId, eventId);
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
    return this.get(userId, eventId);
  }

  async createSubmission(userId: string, eventId: string, dto: CreateScientificSubmissionInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    await this.requireModality(scope, dto.modalityId);
    await this.validateTaxonomy(scope, dto.taxonomyAreaId, dto.taxonomySubareaId);

    const created = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.scientificSubmission.create({
        data: {
          ...scope,
          modalityId: dto.modalityId,
          title: normalizeScientificText(dto.title, 220),
          abstractText: this.optional(dto.abstractText, 8000),
          keywords: dto.keywords?.slice(0, 10) ?? undefined,
          taxonomyAreaId: dto.taxonomyAreaId ?? null,
          taxonomySubareaId: dto.taxonomySubareaId ?? null,
        },
      });
      await this.audit(tx, event, userId, 'scientific.submission_created', 'ScientificSubmission', submission.id, {
        modalityId: submission.modalityId,
      });
      return submission;
    });
    return { ...(await this.get(userId, eventId)), createdSubmissionId: created.id };
  }

  async addAuthor(userId: string, eventId: string, submissionId: string, dto: AddScientificSubmissionAuthorInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const submission = await this.requireSubmission(scope, submissionId);
    if (requiresImmutableSubmittedVersion(submission.status)) {
      throw new BadRequestException('A autoria de uma versão já submetida não pode ser alterada silenciosamente. Crie uma correção quando permitida.');
    }
    const person = await this.prisma.scientificPerson.findFirst({ where: { ...scope, id: dto.personId, status: 'ACTIVE' } });
    if (!person) throw new BadRequestException('O autor selecionado não pertence a este evento científico.');
    if (dto.sortOrder < 1) throw new BadRequestException('A ordem de autoria deve começar em 1.');

    if (dto.isPresenter) {
      const existingPresenter = await this.prisma.scientificSubmissionAuthor.findFirst({
        where: { ...scope, submissionId, isPresenter: true },
      });
      if (existingPresenter) throw new BadRequestException('Somente um apresentador pode ser indicado para o trabalho.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const author = await tx.scientificSubmissionAuthor.create({
          data: {
            ...scope,
            submissionId,
            personId: dto.personId,
            sortOrder: dto.sortOrder,
            isPresenter: dto.isPresenter ?? false,
            isCorresponding: dto.isCorresponding ?? false,
          },
        });
        await this.audit(tx, event, userId, 'scientific.submission_author_added', 'ScientificSubmissionAuthor', author.id, {
          submissionId,
          personId: dto.personId,
          sortOrder: dto.sortOrder,
          isPresenter: dto.isPresenter ?? false,
        });
      });
    } catch (reason) {
      if (this.isUnique(reason)) throw new BadRequestException('Este autor ou esta posição de autoria já está vinculada ao trabalho.');
      throw reason;
    }
    return this.get(userId, eventId);
  }

  async submit(userId: string, eventId: string, submissionId: string, dto: SubmitScientificSubmissionInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { ...scope, id: submissionId },
      include: { authors: { orderBy: { sortOrder: 'asc' } }, modality: true },
    });
    if (!submission) throw new NotFoundException('Trabalho científico não encontrado neste evento.');
    if (!canTransitionSubmission(submission.status, 'SUBMITTED')) {
      throw new BadRequestException('Este trabalho não está em um estado que permita nova submissão direta.');
    }
    const config = await this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } });
    const modalityRules = (submission.modality.rules ?? {}) as Record<string, unknown>;
    const errors = validateSubmissionForSubmit(
      {
        title: submission.title,
        modalityId: submission.modalityId,
        scientificAreaId: submission.taxonomyAreaId,
        scientificSubareaId: submission.taxonomySubareaId,
        fileId: dto.fileKey,
        authors: submission.authors.map((author) => ({ id: author.personId, order: author.sortOrder, presenter: author.isPresenter })),
      },
      {
        areaEnabled: Boolean(config?.requireArea || submission.taxonomyAreaId),
        areaRequired: config?.requireArea ?? false,
        subareaEnabled: Boolean(config?.requireSubarea || submission.taxonomySubareaId),
        subareaRequired: config?.requireSubarea ?? false,
        fileEnabled: Boolean(config?.requireFile || modalityRules.fileEnabled),
        fileRequired: config?.requireFile ?? false,
        minAuthors: config?.minAuthors ?? 1,
        maxAuthors: config?.maxAuthors ?? null,
        presenterRequired: modalityRules.presenterRequired !== false,
      },
    );
    if (errors.length) {
      throw new BadRequestException({ code: 'SUBMISSION_INCOMPLETE', message: 'Revise os campos obrigatórios antes de enviar o trabalho.', errors });
    }

    const submittedAt = new Date();
    const versionNumber = submission.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.scientificSubmissionVersion.create({
        data: {
          ...scope,
          submissionId,
          versionNumber,
          title: submission.title,
          abstractText: submission.abstractText,
          keywords: submission.keywords ?? undefined,
          fileKey: dto.fileKey ?? null,
          contentHash: dto.contentHash ?? null,
          submittedAt,
        },
      });
      await tx.scientificSubmission.update({
        where: { id: submissionId },
        data: { status: ScientificSubmissionStatus.SUBMITTED, currentVersion: versionNumber, submittedAt },
      });
      await this.audit(tx, event, userId, 'scientific.submission_submitted', 'ScientificSubmission', submissionId, {
        versionNumber,
        contentHash: dto.contentHash ?? null,
      });
    });
    return this.get(userId, eventId);
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
      throw new BadRequestException('As submissões científicas estão disponíveis apenas para eventos técnico-científicos.');
    }
    if (!event.organizationId) throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    return event;
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async requireModality(scope: { eventId: string; organizationId: string }, modalityId: string) {
    const modality = await this.prisma.scientificSubmissionModality.findFirst({ where: { ...scope, id: modalityId, active: true } });
    if (!modality) throw new BadRequestException('A modalidade selecionada não pertence a este evento ou está desativada.');
    return modality;
  }

  private async requireSubmission(scope: { eventId: string; organizationId: string }, submissionId: string) {
    const submission = await this.prisma.scientificSubmission.findFirst({ where: { ...scope, id: submissionId } });
    if (!submission) throw new NotFoundException('Trabalho científico não encontrado neste evento.');
    return submission;
  }

  private async validateTaxonomy(
    scope: { eventId: string; organizationId: string },
    areaId?: string,
    subareaId?: string,
  ) {
    if (subareaId && !areaId) throw new BadRequestException('Selecione a área antes da subárea.');
    if (areaId) {
      const area = await this.prisma.scientificTaxonomyNode.findFirst({ where: { ...scope, id: areaId, level: ScientificTaxonomyLevel.AREA, active: true } });
      if (!area) throw new BadRequestException('A área científica selecionada não pertence a este evento.');
    }
    if (subareaId) {
      const subarea = await this.prisma.scientificTaxonomyNode.findFirst({ where: { ...scope, id: subareaId, parentId: areaId, level: ScientificTaxonomyLevel.SUBAREA, active: true } });
      if (!subarea) throw new BadRequestException('A subárea selecionada não pertence à área informada neste evento.');
    }
  }

  private optional(value: string | undefined, maxLength: number) {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
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
