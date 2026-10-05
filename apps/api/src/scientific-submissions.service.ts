import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventProfileCode,
  Prisma,
  ScientificAbstractCounterUnit,
  ScientificEvaluationStyle,
  ScientificReviewMode,
  ScientificSubmissionStatus,
  ScientificTaxonomyLevel,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { AuthorSubmissionPolicyError, assertPlainParticipantText } from './scientific-author-policy';
import {
  DEFAULT_PRESENTATION_FORMATS,
  PresentationFormatSetting,
  readPresentationFormats,
  requiresImmutableSubmittedVersion,
} from './scientific-submission-policy';
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
  collectAdditionalAuthors?: boolean;
  collectAuthorOrder?: boolean;
  collectAuthorInstitution?: boolean;
  titleMaxLength?: number;
  minKeywords?: number;
  maxKeywords?: number;
  presentationFormats?: Array<{ code: string; label: string; submissionEnabled?: boolean; evaluationEnabled?: boolean }>;
  reviewMode?: ScientificReviewMode;
  allowCorrections?: boolean;
  maxPresenters?: number;
  collectScientificName?: boolean;
  collectInstitutionAddress?: boolean;
  collectFundingAgency?: boolean;
  collectConflictOfInterest?: boolean;
  requireSubmitterAsFirstAuthor?: boolean;
  requirePresentationSuggestion?: boolean;
  collectTypedAbstract?: boolean;
  collectReferences?: boolean;
  abstractCounterUnit?: ScientificAbstractCounterUnit;
  abstractMin?: number;
  abstractMax?: number;
  showProceedingsAuthorization?: boolean;
  proceedingsAuthorizationPt?: string | null;
  proceedingsAuthorizationEs?: string | null;
  proceedingsAuthorizationEn?: string | null;
  reviewersPerSubmission?: number | null;
  coordinatorDecidesStatus?: boolean;
  evaluationStyle?: ScientificEvaluationStyle;
  acceptedWorkUploadEnabled?: boolean;
  acceptedWorkUploadDeadline?: string | null;
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
    const [config, modalities, submissions, taxonomy] = await Promise.all([
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
      this.prisma.scientificTaxonomyNode.findMany({
        where: { ...scope, active: true, level: { in: [ScientificTaxonomyLevel.AREA, ScientificTaxonomyLevel.SUBAREA] } },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, parentId: true, level: true },
      }),
    ]);

    const defaultPresentationFormats = this.defaultPresentationFormats();
    const effectiveConfig = config ? {
      ...config,
      presentationFormats: readPresentationFormats(config.presentationFormats, defaultPresentationFormats),
    } : {
      requireArea: false,
      requireSubarea: false,
      requireFile: false,
      maxSubmissionsPerAuthor: 1,
      minAuthors: 1,
      maxAuthors: null,
      requirePresenter: true,
      requireCorrespondingAuthor: true,
      requireAuthorInstitution: true,
      collectAdditionalAuthors: true,
      collectAuthorOrder: false,
      collectAuthorInstitution: true,
      titleMaxLength: 250,
      minKeywords: 3,
      maxKeywords: 5,
      presentationFormats: defaultPresentationFormats,
      reviewMode: ScientificReviewMode.SINGLE_BLIND,
      allowCorrections: true,
      maxPresenters: 1,
      collectScientificName: false,
      collectInstitutionAddress: false,
      collectFundingAgency: false,
      collectConflictOfInterest: false,
      requireSubmitterAsFirstAuthor: false,
      requirePresentationSuggestion: false,
      collectTypedAbstract: true,
      collectReferences: false,
      abstractCounterUnit: ScientificAbstractCounterUnit.CHARACTERS,
      abstractMin: 30,
      abstractMax: 10000,
      showProceedingsAuthorization: false,
      proceedingsAuthorizationPt: null,
      proceedingsAuthorizationEs: null,
      proceedingsAuthorizationEn: null,
      reviewersPerSubmission: null,
      coordinatorDecidesStatus: false,
      evaluationStyle: ScientificEvaluationStyle.ANALYTIC,
      acceptedWorkUploadEnabled: false,
      acceptedWorkUploadDeadline: null,
    };

    return {
      event: { id: event.id, name: event.name, status: event.status, organizationId: event.organizationId },
      config: effectiveConfig,
      presentationFormatsSaved: Array.isArray(config?.presentationFormats),
      modalities,
      taxonomy,
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
        ? 'Revise as regras e as modalidades de submissão. Os autores enviam o trabalho na área do participante.'
        : 'Selecione ao menos uma modalidade de submissão, como oral, tema livre, pôster ou pôster digital.',
    };
  }

  async configure(userId: string, eventId: string, dto: ConfigureScientificSubmissionsInput) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const minAuthors = dto.minAuthors ?? 1;
    const maxAuthors = dto.maxAuthors === undefined ? null : dto.maxAuthors;
    const minKeywords = dto.minKeywords ?? 3;
    const maxKeywords = dto.maxKeywords ?? 5;
    if (minAuthors < 1) throw new BadRequestException('O mínimo de autores deve ser pelo menos 1.');
    if (maxAuthors !== null && maxAuthors < minAuthors) {
      throw new BadRequestException('O máximo de autores não pode ser menor que o mínimo.');
    }
    if (dto.requireSubarea && !dto.requireArea) {
      throw new BadRequestException('Para exigir subárea, a área científica também precisa estar habilitada como obrigatória.');
    }
    if (minKeywords < 0 || maxKeywords < minKeywords) {
      throw new BadRequestException('O máximo de palavras-chave não pode ser menor que o mínimo.');
    }
    const presentationFormats = dto.presentationFormats === undefined
      ? undefined
      : this.normalizePresentationFormats(dto.presentationFormats);
    const current = await this.prisma.scientificSubmissionConfig.findUnique({ where: { eventId_organizationId: scope } });
    const collectAuthorInstitution = dto.collectAuthorInstitution ?? current?.collectAuthorInstitution ?? true;
    const requireAuthorInstitution = collectAuthorInstitution ? dto.requireAuthorInstitution ?? current?.requireAuthorInstitution ?? true : false;
    if (dto.collectAdditionalAuthors === false || dto.minAuthors !== undefined || dto.maxAuthors !== undefined) {
      const collectAdditionalAuthors = dto.collectAdditionalAuthors ?? current?.collectAdditionalAuthors ?? true;
      const nextMinAuthors = dto.minAuthors ?? current?.minAuthors ?? 1;
      const nextMaxAuthors = dto.maxAuthors !== undefined ? dto.maxAuthors : current?.maxAuthors ?? null;
      if (!collectAdditionalAuthors && nextMinAuthors > 1) {
        throw new BadRequestException('Para aceitar só quem envia a inscrição, o mínimo de autores é 1.');
      }
      if (!collectAdditionalAuthors && nextMaxAuthors != null && nextMaxAuthors > 1) {
        throw new BadRequestException('Para aceitar só quem envia a inscrição, o máximo de autores é 1.');
      }
    }
    const extended = this.extendedSettings(dto, current);
    const formatsForSuggestion = presentationFormats
      ?? readPresentationFormats(current?.presentationFormats, this.defaultPresentationFormats());
    if (extended.requirePresentationSuggestion && !formatsForSuggestion.some((item) => item.submissionEnabled)) {
      throw new BadRequestException('Habilite a submissão em ao menos uma forma de apresentação.');
    }

    await this.prisma.$transaction(async (tx) => {
      const config = await tx.scientificSubmissionConfig.upsert({
        where: { eventId_organizationId: scope },
        create: {
          ...scope,
          requireArea: dto.requireArea ?? false,
          requireSubarea: dto.requireSubarea ?? false,
          requireFile: dto.requireFile ?? false,
          maxSubmissionsPerAuthor: dto.maxSubmissionsPerAuthor ?? 1,
          minAuthors,
          maxAuthors,
          requirePresenter: dto.requirePresenter ?? true,
          requireCorrespondingAuthor: dto.requireCorrespondingAuthor ?? true,
          requireAuthorInstitution,
          titleMaxLength: dto.titleMaxLength ?? 250,
          minKeywords,
          maxKeywords,
          presentationFormats: presentationFormats as Prisma.InputJsonArray | undefined,
          reviewMode: dto.reviewMode ?? ScientificReviewMode.SINGLE_BLIND,
          allowCorrections: dto.allowCorrections ?? true,
          ...extended,
        },
        update: {
          ...(dto.requireArea !== undefined ? { requireArea: dto.requireArea } : {}),
          ...(dto.requireSubarea !== undefined ? { requireSubarea: dto.requireSubarea } : {}),
          ...(dto.requireFile !== undefined ? { requireFile: dto.requireFile } : {}),
          ...(dto.maxSubmissionsPerAuthor !== undefined ? { maxSubmissionsPerAuthor: dto.maxSubmissionsPerAuthor } : {}),
          ...(dto.minAuthors !== undefined ? { minAuthors: dto.minAuthors } : {}),
          ...(dto.maxAuthors !== undefined ? { maxAuthors: dto.maxAuthors } : {}),
          ...(dto.requirePresenter !== undefined ? { requirePresenter: dto.requirePresenter } : {}),
          ...(dto.requireCorrespondingAuthor !== undefined ? { requireCorrespondingAuthor: dto.requireCorrespondingAuthor } : {}),
          ...((dto.requireAuthorInstitution !== undefined || dto.collectAuthorInstitution !== undefined) ? { requireAuthorInstitution } : {}),
          ...(dto.titleMaxLength !== undefined ? { titleMaxLength: dto.titleMaxLength } : {}),
          ...(dto.minKeywords !== undefined ? { minKeywords: dto.minKeywords } : {}),
          ...(dto.maxKeywords !== undefined ? { maxKeywords: dto.maxKeywords } : {}),
          ...(presentationFormats !== undefined ? { presentationFormats: presentationFormats as Prisma.InputJsonArray } : {}),
          ...(dto.reviewMode !== undefined ? { reviewMode: dto.reviewMode } : {}),
          ...(dto.allowCorrections !== undefined ? { allowCorrections: dto.allowCorrections } : {}),
          ...this.extendedUpdate(dto, extended),
        },
      });
      if (presentationFormats) await this.syncFormatModalities(tx, scope, presentationFormats,
        readPresentationFormats(current?.presentationFormats, this.defaultPresentationFormats()).map((format) => format.code));
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

  private defaultPresentationFormats(): PresentationFormatSetting[] {
    return DEFAULT_PRESENTATION_FORMATS;
  }

  private extendedSettings(
    dto: ConfigureScientificSubmissionsInput,
    current: {
      abstractMin: number;
      abstractMax: number;
      showProceedingsAuthorization: boolean;
      proceedingsAuthorizationPt: string | null;
      proceedingsAuthorizationEs: string | null;
      proceedingsAuthorizationEn: string | null;
      requirePresentationSuggestion: boolean;
    } | null,
  ) {
    if (dto.maxPresenters !== undefined && (dto.maxPresenters < 1 || dto.maxPresenters > 20)) {
      throw new BadRequestException('A quantidade de apresentadores deve ficar entre 1 e 20.');
    }
    if (dto.reviewersPerSubmission !== undefined && dto.reviewersPerSubmission !== null
      && (dto.reviewersPerSubmission < 1 || dto.reviewersPerSubmission > 10)) {
      throw new BadRequestException('A quantidade de avaliadores deve ficar entre 1 e 10, ou vazia para não limitar.');
    }
    const abstractMin = dto.abstractMin ?? current?.abstractMin ?? 30;
    const abstractMax = dto.abstractMax ?? current?.abstractMax ?? 10000;
    if (abstractMin < 0 || abstractMax > 20000 || abstractMax < abstractMin) {
      throw new BadRequestException('O limite do resumo precisa ficar entre 0 e 20000, com o máximo maior ou igual ao mínimo.');
    }
    const showProceedingsAuthorization = dto.showProceedingsAuthorization ?? current?.showProceedingsAuthorization ?? false;
    const proceedingsAuthorizationPt = this.authorizationText(
      dto.proceedingsAuthorizationPt !== undefined ? dto.proceedingsAuthorizationPt : current?.proceedingsAuthorizationPt,
      'Autorização em português',
    );
    const proceedingsAuthorizationEs = this.authorizationText(
      dto.proceedingsAuthorizationEs !== undefined ? dto.proceedingsAuthorizationEs : current?.proceedingsAuthorizationEs,
      'Autorização em espanhol',
    );
    const proceedingsAuthorizationEn = this.authorizationText(
      dto.proceedingsAuthorizationEn !== undefined ? dto.proceedingsAuthorizationEn : current?.proceedingsAuthorizationEn,
      'Autorização em inglês',
    );
    if (showProceedingsAuthorization && (!proceedingsAuthorizationPt || proceedingsAuthorizationPt.length < 10)) {
      throw new BadRequestException('Escreva o texto da autorização em português, com pelo menos 10 caracteres.');
    }
    let acceptedWorkUploadDeadline: Date | null | undefined;
    if (dto.acceptedWorkUploadDeadline !== undefined) {
      if (!dto.acceptedWorkUploadDeadline) acceptedWorkUploadDeadline = null;
      else {
        const parsed = new Date(dto.acceptedWorkUploadDeadline);
        if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Informe um prazo válido para o e-pôster do trabalho aceito.');
        acceptedWorkUploadDeadline = parsed;
      }
    }
    return {
      maxPresenters: dto.maxPresenters ?? 1,
      collectScientificName: dto.collectScientificName ?? false,
      collectInstitutionAddress: dto.collectInstitutionAddress ?? false,
      collectFundingAgency: dto.collectFundingAgency ?? false,
      collectConflictOfInterest: dto.collectConflictOfInterest ?? false,
      collectAdditionalAuthors: dto.collectAdditionalAuthors ?? true,
      collectAuthorOrder: dto.collectAuthorOrder ?? false,
      collectAuthorInstitution: dto.collectAuthorInstitution ?? true,
      requireSubmitterAsFirstAuthor: dto.requireSubmitterAsFirstAuthor ?? false,
      requirePresentationSuggestion: dto.requirePresentationSuggestion ?? current?.requirePresentationSuggestion ?? false,
      collectTypedAbstract: dto.collectTypedAbstract ?? true,
      collectReferences: dto.collectReferences ?? false,
      abstractCounterUnit: dto.abstractCounterUnit ?? ScientificAbstractCounterUnit.CHARACTERS,
      abstractMin,
      abstractMax,
      showProceedingsAuthorization,
      proceedingsAuthorizationPt,
      proceedingsAuthorizationEs,
      proceedingsAuthorizationEn,
      reviewersPerSubmission: dto.reviewersPerSubmission === undefined ? null : dto.reviewersPerSubmission,
      coordinatorDecidesStatus: dto.coordinatorDecidesStatus ?? false,
      evaluationStyle: dto.evaluationStyle ?? ScientificEvaluationStyle.ANALYTIC,
      acceptedWorkUploadEnabled: dto.acceptedWorkUploadEnabled ?? false,
      acceptedWorkUploadDeadline: acceptedWorkUploadDeadline ?? null,
    };
  }

  private extendedUpdate(
    dto: ConfigureScientificSubmissionsInput,
    extended: ReturnType<ScientificSubmissionsService['extendedSettings']>,
  ) {
    return {
      ...(dto.maxPresenters !== undefined ? { maxPresenters: extended.maxPresenters } : {}),
      ...(dto.collectScientificName !== undefined ? { collectScientificName: extended.collectScientificName } : {}),
      ...(dto.collectInstitutionAddress !== undefined ? { collectInstitutionAddress: extended.collectInstitutionAddress } : {}),
      ...(dto.collectFundingAgency !== undefined ? { collectFundingAgency: extended.collectFundingAgency } : {}),
      ...(dto.collectConflictOfInterest !== undefined ? { collectConflictOfInterest: extended.collectConflictOfInterest } : {}),
      ...(dto.collectAdditionalAuthors !== undefined ? { collectAdditionalAuthors: extended.collectAdditionalAuthors } : {}),
      ...(dto.collectAuthorOrder !== undefined ? { collectAuthorOrder: extended.collectAuthorOrder } : {}),
      ...(dto.collectAuthorInstitution !== undefined ? { collectAuthorInstitution: extended.collectAuthorInstitution } : {}),
      ...(dto.requireSubmitterAsFirstAuthor !== undefined ? { requireSubmitterAsFirstAuthor: extended.requireSubmitterAsFirstAuthor } : {}),
      ...(dto.requirePresentationSuggestion !== undefined ? { requirePresentationSuggestion: extended.requirePresentationSuggestion } : {}),
      ...(dto.collectTypedAbstract !== undefined ? { collectTypedAbstract: extended.collectTypedAbstract } : {}),
      ...(dto.collectReferences !== undefined ? { collectReferences: extended.collectReferences } : {}),
      ...(dto.abstractCounterUnit !== undefined ? { abstractCounterUnit: extended.abstractCounterUnit } : {}),
      ...(dto.abstractMin !== undefined ? { abstractMin: extended.abstractMin } : {}),
      ...(dto.abstractMax !== undefined ? { abstractMax: extended.abstractMax } : {}),
      ...(dto.showProceedingsAuthorization !== undefined ? { showProceedingsAuthorization: extended.showProceedingsAuthorization } : {}),
      ...(dto.proceedingsAuthorizationPt !== undefined ? { proceedingsAuthorizationPt: extended.proceedingsAuthorizationPt } : {}),
      ...(dto.proceedingsAuthorizationEs !== undefined ? { proceedingsAuthorizationEs: extended.proceedingsAuthorizationEs } : {}),
      ...(dto.proceedingsAuthorizationEn !== undefined ? { proceedingsAuthorizationEn: extended.proceedingsAuthorizationEn } : {}),
      ...(dto.reviewersPerSubmission !== undefined ? { reviewersPerSubmission: extended.reviewersPerSubmission } : {}),
      ...(dto.coordinatorDecidesStatus !== undefined ? { coordinatorDecidesStatus: extended.coordinatorDecidesStatus } : {}),
      ...(dto.evaluationStyle !== undefined ? { evaluationStyle: extended.evaluationStyle } : {}),
      ...(dto.acceptedWorkUploadEnabled !== undefined ? { acceptedWorkUploadEnabled: extended.acceptedWorkUploadEnabled } : {}),
      ...(dto.acceptedWorkUploadDeadline !== undefined ? { acceptedWorkUploadDeadline: extended.acceptedWorkUploadDeadline } : {}),
    };
  }

  private authorizationText(value: string | null | undefined, label: string) {
    const text = value?.trim() ?? '';
    if (!text) return null;
    if (text.length > 2000) throw new BadRequestException(`${label} passa de 2000 caracteres.`);
    try {
      assertPlainParticipantText(text, label);
    } catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    return text;
  }

  private normalizePresentationFormats(
    items: Array<{ code: string; label: string; submissionEnabled?: boolean; evaluationEnabled?: boolean }>,
  ): PresentationFormatSetting[] {
    if (!items.length || items.length > 20) throw new BadRequestException('Informe entre 1 e 20 formas de apresentação.');
    const seen = new Set<string>();
    return items.map((item) => {
      const label = normalizeScientificText(item.label, 80);
      const code = this.slug(item.code || label).toUpperCase().replace(/-/g, '_');
      if (!code || seen.has(code)) throw new BadRequestException('As formas de apresentação devem possuir códigos únicos.');
      if (item.submissionEnabled !== undefined && typeof item.submissionEnabled !== 'boolean') {
        throw new BadRequestException('A habilitação de submissão da forma de apresentação é inválida.');
      }
      if (item.evaluationEnabled !== undefined && typeof item.evaluationEnabled !== 'boolean') {
        throw new BadRequestException('A habilitação de avaliação da forma de apresentação é inválida.');
      }
      seen.add(code);
      return {
        code,
        label,
        submissionEnabled: item.submissionEnabled !== false,
        evaluationEnabled: item.evaluationEnabled !== false,
      };
    });
  }

  private async syncFormatModalities(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string },
    formats: PresentationFormatSetting[],
    previousCodes: string[],
  ) {
    const retainedCodes = new Set(formats.map((format) => format.code));
    const removedCodes = previousCodes.filter((code) => !retainedCodes.has(code));
    if (removedCodes.length > 0) {
      await tx.scientificSubmissionModality.updateMany({
        where: { ...scope, code: { in: removedCodes } },
        data: { active: false },
      });
    }
    for (const format of formats) {
      await tx.scientificSubmissionModality.upsert({
        where: { eventId_code: { eventId: scope.eventId, code: format.code } },
        create: {
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          code: format.code,
          name: format.label,
          active: format.submissionEnabled,
        },
        update: { name: format.label, active: format.submissionEnabled },
      });
    }
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
