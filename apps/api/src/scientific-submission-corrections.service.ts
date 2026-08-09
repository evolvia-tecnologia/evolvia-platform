import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventProfileCode, Prisma, ScientificSubmissionStatus, ScientificTaxonomyLevel } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { validateSubmissionForSubmit } from './scientific-submission-policy';
import { normalizeScientificText } from './scientific-structure-policy';

export type CorrectScientificSubmissionInput = {
  reason: string;
  title?: string;
  abstractText?: string;
  keywords?: string[];
  taxonomyAreaId?: string | null;
  taxonomySubareaId?: string | null;
  fileKey?: string | null;
  contentHash: string;
};

@Injectable()
export class ScientificSubmissionCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async correct(userId: string, eventId: string, submissionId: string, dto: CorrectScientificSubmissionInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const [config, submission] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } }),
      this.prisma.scientificSubmission.findFirst({
        where: { ...scope, id: submissionId },
        include: {
          modality: true,
          authors: { orderBy: { sortOrder: 'asc' } },
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      }),
    ]);

    if (!submission) throw new NotFoundException('Trabalho científico não encontrado neste evento.');
    if (!config?.allowCorrections) throw new BadRequestException('As correções estão desabilitadas para este evento.');
    if (![ScientificSubmissionStatus.SUBMITTED, ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES].includes(submission.status)) {
      throw new BadRequestException('Este trabalho não está em um estado que permita correção controlada.');
    }

    const reason = dto.reason.trim();
    if (reason.length < 5) throw new BadRequestException('Informe uma justificativa objetiva para a correção.');
    const contentHash = dto.contentHash.trim();
    if (!contentHash) throw new BadRequestException('Informe o hash do conteúdo corrigido para garantir idempotência.');

    const previousVersion = submission.versions[0];
    if (!previousVersion) throw new BadRequestException('A correção exige uma versão submetida anterior preservada.');
    if (previousVersion.contentHash === contentHash) {
      return {
        submissionId,
        corrected: false,
        idempotent: true,
        currentVersion: submission.currentVersion,
        message: 'Esta correção já foi registrada para o conteúdo informado.',
      };
    }

    const title = dto.title === undefined ? submission.title : normalizeScientificText(dto.title, 220);
    const abstractText = dto.abstractText === undefined ? submission.abstractText : this.optional(dto.abstractText, 8000);
    const keywords = dto.keywords === undefined ? submission.keywords : dto.keywords.slice(0, 10);
    const taxonomyAreaId = dto.taxonomyAreaId === undefined ? submission.taxonomyAreaId : dto.taxonomyAreaId;
    const taxonomySubareaId = dto.taxonomySubareaId === undefined ? submission.taxonomySubareaId : dto.taxonomySubareaId;
    const fileKey = dto.fileKey === undefined ? previousVersion.fileKey : dto.fileKey;

    await this.validateTaxonomy(scope, taxonomyAreaId, taxonomySubareaId);
    const modalityRules = (submission.modality.rules ?? {}) as Record<string, unknown>;
    const errors = validateSubmissionForSubmit(
      {
        title,
        modalityId: submission.modalityId,
        scientificAreaId: taxonomyAreaId,
        scientificSubareaId: taxonomySubareaId,
        fileId: fileKey,
        authors: submission.authors.map((author) => ({ id: author.personId, order: author.sortOrder, presenter: author.isPresenter })),
      },
      {
        areaEnabled: Boolean(config.requireArea || taxonomyAreaId),
        areaRequired: config.requireArea,
        subareaEnabled: Boolean(config.requireSubarea || taxonomySubareaId),
        subareaRequired: config.requireSubarea,
        fileEnabled: Boolean(config.requireFile || modalityRules.fileEnabled),
        fileRequired: config.requireFile,
        minAuthors: config.minAuthors,
        maxAuthors: config.maxAuthors,
        presenterRequired: modalityRules.presenterRequired !== false,
      },
    );
    if (errors.length) {
      throw new BadRequestException({
        code: 'CORRECTION_INCOMPLETE',
        message: 'A versão corrigida ainda possui pendências obrigatórias.',
        errors,
      });
    }

    const submittedAt = new Date();
    const versionNumber = submission.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.scientificSubmissionVersion.create({
        data: {
          ...scope,
          submissionId,
          versionNumber,
          title,
          abstractText,
          keywords: keywords ?? undefined,
          fileKey: fileKey ?? null,
          contentHash,
          submittedAt,
        },
      });
      await tx.scientificSubmission.update({
        where: { id: submissionId },
        data: {
          title,
          abstractText,
          keywords: keywords ?? undefined,
          taxonomyAreaId,
          taxonomySubareaId,
          status: ScientificSubmissionStatus.SUBMITTED,
          currentVersion: versionNumber,
          submittedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId,
          actorUserId: userId,
          action: 'scientific.submission_corrected',
          entityType: 'ScientificSubmission',
          entityId: submissionId,
          metadata: {
            previousVersion: submission.currentVersion,
            versionNumber,
            reason,
            contentHash,
          },
        },
      });
    });

    return {
      submissionId,
      corrected: true,
      idempotent: false,
      previousVersion: submission.currentVersion,
      currentVersion: versionNumber,
      status: ScientificSubmissionStatus.SUBMITTED,
    };
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
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
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async validateTaxonomy(
    scope: { eventId: string; organizationId: string },
    areaId?: string | null,
    subareaId?: string | null,
  ) {
    if (subareaId && !areaId) throw new BadRequestException('Selecione a área antes da subárea.');
    if (areaId) {
      const area = await this.prisma.scientificTaxonomyNode.findFirst({
        where: { ...scope, id: areaId, level: ScientificTaxonomyLevel.AREA, active: true },
      });
      if (!area) throw new BadRequestException('A área científica selecionada não pertence a este evento.');
    }
    if (subareaId) {
      const subarea = await this.prisma.scientificTaxonomyNode.findFirst({
        where: { ...scope, id: subareaId, parentId: areaId, level: ScientificTaxonomyLevel.SUBAREA, active: true },
      });
      if (!subarea) throw new BadRequestException('A subárea selecionada não pertence à área informada neste evento.');
    }
  }

  private optional(value: string | undefined, maxLength: number) {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }
}
