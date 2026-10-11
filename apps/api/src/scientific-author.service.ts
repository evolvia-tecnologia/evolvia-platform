import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventProfileCode, EventStatus, Prisma, RegistrationReservationStatus, ScientificSubmissionStatus, ScientificTaxonomyLevel } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { ParticipantAreaService } from './participant-area.service';
import { PrismaService } from './prisma.service';
import { decisionLetterDocument, type DecisionLetterStatus } from './acceptance-letter.policy';
import { AuthorSubmissionPolicyError, assertAuthorRoster, assertModalityWindowOpen, composeModalityAbstract, normalizeAuthorDraft, normalizeAuthorSubmission, normalizeSubmissionKey, publicModalityWindow, type AuthorSubmissionInput } from './scientific-author-policy';
import { ScientificFileStorage } from './scientific-file.storage';
import { validateScientificPdf } from './registration-terms-document.policy';
import { DEFAULT_PRESENTATION_FORMATS, readPresentationFormats } from './scientific-submission-policy';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const SUBMISSION_ID = /^[a-z0-9]{10,40}$/u;
const VERSION_NUMBER = /^[1-9][0-9]{0,9}$/u;
const CORRECTABLE_STATUSES = new Set<ScientificSubmissionStatus>([
  ScientificSubmissionStatus.SUBMITTED,
  ScientificSubmissionStatus.UNDER_REVIEW,
  ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES,
]);

@Injectable()
export class ScientificAuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participant: ParticipantAreaService,
    private readonly files: ScientificFileStorage,
  ) {}

  async get(slug: string, authorization?: string) {
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    const event = await this.prisma.event.findFirst({
      where: { id: scope.eventId, organizationId: scope.organizationId, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
      select: { name: true },
    });
    if (!event) throw new NotFoundException('Submissão científica indisponível.');
    const registration = await this.prisma.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { registrationData: true },
    });
    const submitterEmail = emailFrom(registration?.registrationData);
    const [config, modalities, taxonomy, submissions] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({
        where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
        select: { requireArea: true, requireSubarea: true, requireFile: true, minAuthors: true, maxAuthors: true,
          requirePresenter: true, requireCorrespondingAuthor: true, requireAuthorInstitution: true,
          collectAdditionalAuthors: true, collectAuthorOrder: true, collectAuthorInstitution: true,
          titleMaxLength: true, minKeywords: true, maxKeywords: true, maxSubmissionsPerAuthor: true,
          maxPresenters: true, collectScientificName: true, collectInstitutionAddress: true, collectFundingAgency: true,
          collectConflictOfInterest: true, requireSubmitterAsFirstAuthor: true, requirePresentationSuggestion: true,
          collectTypedAbstract: true, collectReferences: true, abstractCounterUnit: true, abstractMin: true, abstractMax: true,
          showProceedingsAuthorization: true, proceedingsAuthorizationPt: true, proceedingsAuthorizationEs: true,
          proceedingsAuthorizationEn: true, acceptedWorkUploadEnabled: true, acceptedWorkUploadDeadline: true,
          allowCorrections: true, presentationFormats: true },
      }),
      this.prisma.scientificSubmissionModality.findMany({
        where: { eventId: scope.eventId, organizationId: scope.organizationId, active: true },
        orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, description: true, rules: true },
      }),
      this.prisma.scientificTaxonomyNode.findMany({
        where: { eventId: scope.eventId, organizationId: scope.organizationId, active: true,
          level: { in: [ScientificTaxonomyLevel.AREA, ScientificTaxonomyLevel.SUBAREA] } },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, parentId: true, level: true },
      }),
      this.prisma.scientificSubmission.findMany({
        where: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true, title: true, abstractText: true, keywords: true, status: true, submittedAt: true, currentVersion: true,
          modalityId: true, presentationFormatCode: true, taxonomyAreaId: true, taxonomySubareaId: true,
          modality: { select: { name: true } },
          authors: { orderBy: { sortOrder: 'asc' }, select: { sortOrder: true, isPresenter: true, isCorresponding: true, person: { select: { name: true, email: true, institution: true } } } },
          versions: { orderBy: { versionNumber: 'desc' }, take: 10, select: { versionNumber: true, submittedAt: true, title: true, fileKey: true, eposterFileKey: true, secondEposterFileKey: true, slideFileKey: true } },
        },
      }),
    ]);
    const reason = !config ? 'O organizador ainda não configurou as submissões.'
      : modalities.length === 0 ? 'O organizador ainda não disponibilizou uma modalidade.'
      : null;
    return {
      event: { name: event.name },
      available: reason === null,
      reason,
      config: config ? {
        ...config,
        acceptedWorkUploadDeadline: config.acceptedWorkUploadDeadline?.toISOString() ?? null,
        presentationFormats: readPresentationFormats(config.presentationFormats, DEFAULT_PRESENTATION_FORMATS),
      } : null,
      modalities: modalities.map(({ rules, ...item }) => ({ ...item, window: publicModalityWindow(rules) })),
      taxonomy,
      submissions: submissions.map((item) => ({
        id: item.id, title: item.title, abstractText: item.abstractText ?? '', status: item.status,
        submittedAt: item.submittedAt?.toISOString() ?? null,
        currentVersion: item.currentVersion, modalityId: item.modalityId, modality: item.modality.name,
        presentationFormatCode: item.presentationFormatCode,
        taxonomyAreaId: item.taxonomyAreaId, taxonomySubareaId: item.taxonomySubareaId,
        keywords: Array.isArray(item.keywords) ? item.keywords.filter((word): word is string => typeof word === 'string') : [],
        hasSubmissionFile: Boolean(item.versions[0]?.fileKey),
        submissionFileVersions: item.versions.filter((version) => Boolean(version.fileKey)).map((version) => version.versionNumber),
        versions: item.versions.map((version) => ({ versionNumber: version.versionNumber, title: version.title, submittedAt: version.submittedAt?.toISOString?.() ?? item.submittedAt?.toISOString() ?? '' })),
        hasEposter: Boolean(item.versions[0]?.eposterFileKey),
        hasSecondEposter: Boolean(item.versions[0]?.secondEposterFileKey),
        hasSlide: Boolean(item.versions[0]?.slideFileKey),
        authors: item.authors.map((author) => ({
          name: author.person.name, email: author.person.email, institution: author.person.institution ?? '',
          sortOrder: author.sortOrder, presenter: author.isPresenter, corresponding: author.isCorresponding,
          isSubmitter: Boolean(submitterEmail && author.person.email?.trim().toLowerCase() === submitterEmail),
        })),
      })),
    };
  }

  async saveDraft(slug: string, authorization: string | undefined, rawInput: unknown, rawKey: unknown) {
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) && (rawInput as { file?: unknown }).file) {
      throw new BadRequestException('O arquivo entra somente na versão enviada.');
    }
    let input: ReturnType<typeof normalizeAuthorDraft>;
    let key: string;
    try { input = normalizeAuthorDraft(rawInput); key = normalizeSubmissionKey(rawKey); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const keyHash = digest(key);
    const payloadHash = digest(JSON.stringify(input));
    const requestedDraftId = this.draftIdFrom(rawInput);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.saveDraftOnce(scope, input, keyHash, payloadHash, requestedDraftId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível guardar o rascunho.');
  }

  private saveDraftOnce(
    scope: { eventId: string; organizationId: string; reservationId: string },
    input: ReturnType<typeof normalizeAuthorDraft>,
    keyHash: string,
    payloadHash: string,
    requestedDraftId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: { id: scope.eventId, organizationId: scope.organizationId, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
        select: { id: true },
      });
      const reservation = await tx.eventRegistrationReservation.findUnique({
        where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
        select: { status: true, registrationData: true },
      });
      if (!event || reservation?.status !== RegistrationReservationStatus.CONFIRMED) {
        throw new NotFoundException('Submissão científica indisponível.');
      }
      const config = await tx.scientificSubmissionConfig.findUnique({
        where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
        select: { maxSubmissionsPerAuthor: true, collectAuthorOrder: true },
      });
      if (!config) throw new ConflictException('Submissões ainda não configuradas.');
      const modality = await tx.scientificSubmissionModality.findFirst({
        where: { id: input.modalityId, eventId: scope.eventId, organizationId: scope.organizationId, active: true },
        select: { id: true, rules: true },
      });
      if (!modality) throw new BadRequestException('Modalidade indisponível.');
      const existing = await tx.scientificSubmission.findFirst({
        where: requestedDraftId
          ? { id: requestedDraftId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId }
          : { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, submissionKeyHash: keyHash },
        select: { id: true, status: true },
      });
      if (requestedDraftId && !existing) throw new NotFoundException('Rascunho não encontrado.');
      if (existing && existing.status !== ScientificSubmissionStatus.DRAFT) {
        throw new ConflictException('Este rascunho já foi enviado. A versão submetida permanece.');
      }
      if (!existing) {
        const occupied = await tx.scientificSubmission.count({
          where: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
        });
        if (occupied >= config.maxSubmissionsPerAuthor) throw new ConflictException('Limite de trabalhos por autor atingido.');
      }
      const draftAbstract = this.composeDraftAbstract(input, modality.rules);
      const data = {
        submissionKeyHash: keyHash,
        modalityId: modality.id, title: input.title, abstractText: draftAbstract || null, keywords: input.keywords,
        taxonomyAreaId: input.taxonomyAreaId, taxonomySubareaId: input.taxonomySubareaId,
        presentationFormatCode: input.presentationFormatCode, fundingAgency: input.fundingAgency || null,
        conflictDeclared: input.conflictDeclared, conflictDetail: input.conflictDetail || null, referencesText: input.referencesText || null,
        submissionPayloadHash: payloadHash, status: ScientificSubmissionStatus.DRAFT, currentVersion: 0, submittedAt: null,
      };
      if (existing) {
        const updated = await tx.scientificSubmission.updateMany({
          where: { id: existing.id, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, status: ScientificSubmissionStatus.DRAFT },
          data,
        });
        if (updated.count !== 1) throw new ConflictException('Este rascunho já foi enviado. A versão submetida permanece.');
      }
      const submission = existing
        ? { id: existing.id, title: data.title }
        : await tx.scientificSubmission.create({
          data: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, ...data },
        });
      const registration = reservation.registrationData as Record<string, unknown> | null;
      const name = registration && typeof registration.full_name === 'string'
        ? registration.full_name.trim().slice(0, 120) : '';
      const email = emailFrom(registration);
      if (name.length < 2) throw new ConflictException('Nome da inscrição indisponível para autoria.');
      if (!email) throw new ConflictException('E-mail da inscrição indisponível para identificar autoria.');
      if (input.coauthors.some((author) => author.email === email)) {
          throw new BadRequestException('O coautor não pode repetir o e-mail de quem envia o trabalho.');
        }
        await tx.scientificSubmissionAuthor.deleteMany({ where: { submissionId: submission.id, eventId: scope.eventId, organizationId: scope.organizationId } });
        const roster = [
          { name, email, institution: input.institution, presenter: input.submitterPresenter, corresponding: input.submitterCorresponding,
            scientificName: input.scientificName || null, institutionAddress: input.institutionAddress || null, sortOrder: input.submitterSortOrder as number | null },
          ...input.coauthors.map((author) => ({ ...author, scientificName: null as string | null, institutionAddress: null as string | null })),
        ];
        // An unfinished draft may carry repeated or missing positions; the submit step enforces the real order.
        const requested = roster.map((author) => author.sortOrder);
        const sortOrders = config.collectAuthorOrder && requested.every((order) => order != null) && new Set(requested).size === requested.length
          ? requested as number[]
          : roster.map((_, index) => index + 1);
        const personIds: string[] = [];
        for (const author of roster) {
          const person = await tx.scientificPerson.findFirst({ where: { eventId: scope.eventId, organizationId: scope.organizationId, email: author.email } })
            ?? await tx.scientificPerson.findFirst({ where: { eventId: scope.eventId, organizationId: scope.organizationId, email: { equals: author.email, mode: 'insensitive' } } })
            ?? await tx.scientificPerson.create({ data: { eventId: scope.eventId, organizationId: scope.organizationId, name: author.name, email: author.email, institution: author.institution || null } });
          if (personIds.includes(person.id)) throw new BadRequestException('A autoria repetiu a mesma pessoa.');
          personIds.push(person.id);
        }
        for (const [index, author] of roster.entries()) {
          await tx.scientificSubmissionAuthor.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id, personId: personIds[index]!,
              sortOrder: sortOrders[index]!, isPresenter: author.presenter, isCorresponding: author.corresponding,
              institutionAddress: author.institutionAddress, scientificName: author.scientificName },
          });
        }
      await tx.auditLog.create({
        data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.author_draft_saved', entityType: 'ScientificSubmission', entityId: submission.id, metadata: { updated: Boolean(existing), authors: input.coauthors.length + 1 } as Prisma.InputJsonObject },
      });
      return { id: submission.id, title: submission.title, status: ScientificSubmissionStatus.DRAFT, currentVersion: 0, submittedAt: null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async submit(slug: string, authorization: string | undefined, rawInput: unknown, rawKey: unknown) {
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    let input: ReturnType<typeof normalizeAuthorSubmission>;
    let key: string;
    try { input = normalizeAuthorSubmission(rawInput); key = normalizeSubmissionKey(rawKey); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const keyHash = digest(key);
    const requestedDraftId = this.draftIdFrom(rawInput);
    const hasSubmittedFile = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      && Boolean((rawInput as { file?: unknown }).file);
    const submittedFile = hasSubmittedFile ? this.submissionFile(true, rawInput) : null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let writtenFileKey: string | null = null;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const event = await tx.event.findFirst({
            where: { id: scope.eventId, organizationId: scope.organizationId, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
            select: { id: true },
          });
          const reservation = await tx.eventRegistrationReservation.findUnique({
            where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
            select: { status: true, registrationData: true },
          });
          if (!event || reservation?.status !== RegistrationReservationStatus.CONFIRMED) {
            throw new NotFoundException('Submissão científica indisponível.');
          }
          const config = await tx.scientificSubmissionConfig.findUnique({
            where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
          });
          if (!config) throw new ConflictException('Submissões ainda não configuradas.');
          const file = this.submissionFile(config.requireFile, rawInput);
          if (input.title.length > config.titleMaxLength) throw new BadRequestException('Título acima do limite deste evento.');
          if (input.keywords.length < config.minKeywords || input.keywords.length > config.maxKeywords) {
            throw new BadRequestException('A quantidade de palavras-chave não atende às regras do evento.');
          }
          const presentationFormats = readPresentationFormats(config.presentationFormats, DEFAULT_PRESENTATION_FORMATS);
          const presentation = presentationFormats.find((item) => item.code === input.presentationFormatCode);
          if (config.requirePresentationSuggestion) {
            if (!presentation?.submissionEnabled) throw new BadRequestException('Selecione uma forma de apresentação habilitada para submissão.');
          } else if (input.presentationFormatCode) {
            throw new BadRequestException('Este evento não pede sugestão de apresentação.');
          }
          const scientificName = this.collectedText(config.collectScientificName, input.scientificName, 'Informe o nome científico.', 2);
          const institutionAddress = this.collectedText(config.collectInstitutionAddress, input.institutionAddress, 'Informe o endereço da instituição.', 5);
          const fundingAgency = this.collectedText(config.collectFundingAgency, input.fundingAgency, '', 0);
          if (config.collectConflictOfInterest) {
            if (input.conflictDeclared === null) throw new BadRequestException('Informe se há conflito de interesse.');
            if (input.conflictDeclared && input.conflictDetail.length < 3) throw new BadRequestException('Descreva o conflito de interesse.');
            if (!input.conflictDeclared && input.conflictDetail) throw new BadRequestException('Detalhe o conflito somente quando ele existir.');
          } else if (input.conflictDeclared !== null || input.conflictDetail) {
            throw new BadRequestException('Este evento não coleta conflito de interesse.');
          }
          const referencesText = this.collectedText(config.collectReferences, input.referencesText, 'Informe as referências bibliográficas.', 2);
          if (config.showProceedingsAuthorization && !input.proceedingsAuthorizationAccepted) {
            throw new BadRequestException('Aceite a autorização de submissão nos anais para enviar o trabalho.');
          }
          try {
            assertAuthorRoster(emailFrom(reservation.registrationData), input, {
              minAuthors: config.minAuthors,
              maxAuthors: config.maxAuthors,
              maxPresenters: config.maxPresenters,
              requirePresenter: config.requirePresenter,
              requireCorrespondingAuthor: config.requireCorrespondingAuthor,
              requireAuthorInstitution: config.collectAuthorInstitution && config.requireAuthorInstitution,
              collectAdditionalAuthors: config.collectAdditionalAuthors,
              collectAuthorOrder: config.collectAuthorOrder,
              collectAuthorInstitution: config.collectAuthorInstitution,
              requireSubmitterAsFirstAuthor: config.requireSubmitterAsFirstAuthor,
            });
          } catch (error) {
            if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
            throw error;
          }
          if (config.requireArea && !input.taxonomyAreaId) throw new BadRequestException('Selecione a área científica.');
          if (config.requireSubarea && !input.taxonomySubareaId) throw new BadRequestException('Selecione a subárea científica.');
          const modality = await tx.scientificSubmissionModality.findFirst({
            where: { id: input.modalityId, eventId: scope.eventId, organizationId: scope.organizationId, active: true },
            select: { id: true, rules: true },
          });
          if (!modality) throw new BadRequestException('Modalidade indisponível.');
          const sealed = this.composeAbstract(input, modality.rules, config);
          const payloadHash = this.payloadDigest(sealed, submittedFile?.bytes ?? null);
          const existing = await tx.scientificSubmission.findFirst({
            where: requestedDraftId
              ? { id: requestedDraftId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId }
              : { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, submissionKeyHash: keyHash },
            select: { id: true, title: true, status: true, submittedAt: true, submissionPayloadHash: true },
          });
          if (requestedDraftId && !existing) throw new NotFoundException('Rascunho não encontrado.');
          if (existing && existing.status !== ScientificSubmissionStatus.DRAFT) {
            if (existing.submissionPayloadHash !== payloadHash) throw new ConflictException('Chave já utilizada com outro trabalho.');
            return { id: existing.id, title: existing.title, status: existing.status, submittedAt: existing.submittedAt?.toISOString() ?? null, duplicate: true };
          }
          const promotingDraftId = existing?.status === ScientificSubmissionStatus.DRAFT ? existing.id : null;
          this.assertWindow(modality.rules);
          const nodes = await tx.scientificTaxonomyNode.findMany({
            where: { id: { in: [input.taxonomyAreaId, input.taxonomySubareaId].filter((id): id is string => Boolean(id)) },
              eventId: scope.eventId, organizationId: scope.organizationId, active: true },
            select: { id: true, parentId: true, level: true },
          });
          if (input.taxonomyAreaId && !nodes.some((node) => node.id === input.taxonomyAreaId && node.level === ScientificTaxonomyLevel.AREA)) {
            throw new BadRequestException('Área científica inválida.');
          }
          if (input.taxonomySubareaId && !nodes.some((node) => node.id === input.taxonomySubareaId
            && node.level === ScientificTaxonomyLevel.SUBAREA && node.parentId === input.taxonomyAreaId)) {
            throw new BadRequestException('Subárea científica inválida.');
          }
          const submitted = await tx.scientificSubmission.count({
            where: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, ...(promotingDraftId ? { id: { not: promotingDraftId } } : {}) },
          });
          if (submitted >= config.maxSubmissionsPerAuthor) throw new ConflictException('Limite de trabalhos por autor atingido.');
          const data = reservation.registrationData as Record<string, unknown> | null;
          const name = data && typeof data.full_name === 'string' ? data.full_name.trim().slice(0, 120) : '';
          if (name.length < 2) throw new ConflictException('Nome da inscrição indisponível para autoria.');
          const now = new Date();
          const email = emailFrom(data);
          if (!email) throw new ConflictException('E-mail da inscrição indisponível para identificar autoria.');
          const roster = [
            { name, email, institution: input.institution, presenter: input.submitterPresenter, corresponding: input.submitterCorresponding, scientificName, institutionAddress },
            ...input.coauthors.map((author) => ({ ...author, scientificName: null as string | null, institutionAddress: null as string | null })),
          ];
          const sortOrders = config.collectAuthorOrder
            ? [input.submitterSortOrder, ...input.coauthors.map((author) => author.sortOrder ?? 0)]
            : roster.map((_, index) => index + 1);
          const personIds: string[] = [];
          for (const author of roster) {
            const knownPerson = await tx.scientificPerson.findFirst({
              where: { eventId: scope.eventId, organizationId: scope.organizationId, email: author.email },
            }) ?? await tx.scientificPerson.findFirst({
              where: { eventId: scope.eventId, organizationId: scope.organizationId, email: { equals: author.email, mode: 'insensitive' } },
            });
            const person = knownPerson ?? await tx.scientificPerson.create({
              data: { eventId: scope.eventId, organizationId: scope.organizationId, name: author.name, email: author.email,
                institution: author.institution || null },
            });
            if (personIds.includes(person.id)) throw new BadRequestException('A autoria repetiu a mesma pessoa.');
            personIds.push(person.id);
          }
          const submissionData = {
            submissionKeyHash: keyHash, submissionPayloadHash: payloadHash,
            modalityId: modality.id, title: input.title, abstractText: sealed.abstractText || null,
            keywords: input.keywords, taxonomyAreaId: input.taxonomyAreaId, taxonomySubareaId: input.taxonomySubareaId,
            presentationFormatCode: presentation?.code ?? null,
            fundingAgency, conflictDeclared: config.collectConflictOfInterest ? input.conflictDeclared : null,
            conflictDetail: config.collectConflictOfInterest && input.conflictDeclared ? input.conflictDetail : null,
            referencesText,
            proceedingsAuthorizationAcceptedAt: config.showProceedingsAuthorization && input.proceedingsAuthorizationAccepted ? now : null,
            status: ScientificSubmissionStatus.SUBMITTED, currentVersion: 1, submittedAt: now,
          };
          if (promotingDraftId) {
            const promoted = await tx.scientificSubmission.updateMany({
              where: { id: promotingDraftId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, status: ScientificSubmissionStatus.DRAFT },
              data: submissionData,
            });
            if (promoted.count !== 1) throw new ConflictException('Este rascunho já foi enviado. A versão submetida permanece.');
          }
          const submission = promotingDraftId
            ? { id: promotingDraftId, title: submissionData.title, status: submissionData.status }
            : await tx.scientificSubmission.create({
              data: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, ...submissionData },
            });
          if (promotingDraftId) {
            await tx.scientificSubmissionAuthor.deleteMany({ where: { submissionId: promotingDraftId, eventId: scope.eventId, organizationId: scope.organizationId } });
          }
          for (const [index, author] of roster.entries()) {
            await tx.scientificSubmissionAuthor.create({
              data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
                personId: personIds[index]!, sortOrder: sortOrders[index]!, isPresenter: author.presenter, isCorresponding: author.corresponding,
                scientificName: author.scientificName, institutionAddress: author.institutionAddress },
            });
          }
          const fileKey = file ? `${scope.organizationId}/${scope.eventId}/${randomUUID()}.pdf` : null;
          if (file && fileKey) {
            writtenFileKey = fileKey;
            await this.files.write(fileKey, file.bytes);
          }
          await tx.scientificSubmissionVersion.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
              versionNumber: 1, title: input.title, abstractText: sealed.abstractText || null,
              keywords: input.keywords, submittedAt: now, contentHash: payloadHash, fileKey,
              presentationFormatCode: presentation?.code ?? null,
              fundingAgency, conflictDeclared: config.collectConflictOfInterest ? input.conflictDeclared : null,
              conflictDetail: config.collectConflictOfInterest && input.conflictDeclared ? input.conflictDetail : null,
              referencesText },
          });
          await tx.auditLog.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.author_submitted',
              entityType: 'ScientificSubmission', entityId: submission.id,
              metadata: { version: 1, fromDraft: Boolean(promotingDraftId) } as Prisma.InputJsonObject },
          });
          return { id: submission.id, title: submission.title, status: submission.status, submittedAt: now.toISOString(), currentVersion: 1, duplicate: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (writtenFileKey) await this.files.remove(writtenFileKey).catch(() => {});
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível concluir a submissão.');
  }

  async acceptanceLetter(slug: string, authorization: string | undefined, submissionId: string) {
    if (!SUBMISSION_ID.test(submissionId)) throw new NotFoundException('Trabalho não encontrado.');
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    const submission = await this.prisma.scientificSubmission.findFirst({
      where: { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
      select: {
        title: true, status: true, currentVersion: true, stationPublicCode: true,
        modality: { select: { name: true } },
        event: { select: { name: true } },
        authors: { orderBy: { sortOrder: 'asc' }, select: { person: { select: { name: true } } } },
      },
    });
    if (!submission) throw new NotFoundException('Trabalho não encontrado.');
    if (submission.status !== ScientificSubmissionStatus.ACCEPTED
      && submission.status !== ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES
      && submission.status !== ScientificSubmissionStatus.REJECTED) {
      throw new ConflictException('Este trabalho ainda não tem carta de decisão.');
    }
    const config = await this.prisma.scientificSubmissionConfig.findUnique({
      where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { acceptanceLetterBody: true, rejectionLetterBody: true },
    });
    return decisionLetterDocument({
      status: submission.status as DecisionLetterStatus,
      eventName: submission.event.name,
      title: submission.title,
      modality: submission.modality.name,
      version: submission.currentVersion,
      authors: submission.authors.map((author) => author.person.name),
      stationPublicCode: submission.stationPublicCode,
      issuedAt: new Date(),
      acceptanceBody: config?.acceptanceLetterBody ?? null,
      rejectionBody: config?.rejectionLetterBody ?? null,
    });
  }

  async submissionVersionFile(slug: string, authorization: string | undefined, submissionId: string, rawVersion: string) {
    if (!SUBMISSION_ID.test(submissionId) || !VERSION_NUMBER.test(rawVersion)) throw new NotFoundException('Arquivo científico não encontrado.');
    const versionNumber = Number(rawVersion);
    if (versionNumber > 2_147_483_647) throw new NotFoundException('Arquivo científico não encontrado.');
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    const version = await this.prisma.scientificSubmissionVersion.findFirst({
      where: {
        eventId: scope.eventId, organizationId: scope.organizationId, submissionId, versionNumber,
        submission: {
          id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId,
          event: { status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
        },
      },
      select: { fileKey: true },
    });
    if (!version?.fileKey) throw new NotFoundException('Arquivo científico não encontrado.');
    const bytes = await this.files.read(version.fileKey);
    return { bytes, fileName: `trabalho-versao-${versionNumber}.pdf` };
  }

  async uploadEposter(slug: string, authorization: string | undefined, submissionId: string, rawInput: unknown) {
    if (!SUBMISSION_ID.test(submissionId)) throw new BadRequestException('Trabalho inválido.');
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    let pdf: ReturnType<typeof validateScientificPdf>;
    try { pdf = validateScientificPdf(rawInput as { contentBase64?: string; fileName?: string }); }
    catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Anexe o PDF do ePoster.');
    }
    const storageKey = `${scope.organizationId}/${scope.eventId}/${randomUUID()}.pdf`;
    await this.files.write(storageKey, pdf.bytes);
    let previousToDelete: string | null = null;
    let result: { id: string; status: ScientificSubmissionStatus; hasEposter: boolean };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.scientificSubmission.findFirst({
          where: { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
          select: { id: true, status: true, presentationFormatCode: true, currentVersion: true },
        });
        if (!submission) throw new NotFoundException('Trabalho não encontrado.');
        if (submission.presentationFormatCode !== 'EPOSTER') throw new BadRequestException('Este trabalho não está na forma de ePoster.');
        if (submission.status !== ScientificSubmissionStatus.ACCEPTED && submission.status !== ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES) {
          throw new ConflictException('O ePoster só pode ser enviado depois da decisão de aceite.');
        }
        const config = await tx.scientificSubmissionConfig.findUnique({
          where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
          select: { acceptedWorkUploadEnabled: true, acceptedWorkUploadDeadline: true },
        });
        if (!config?.acceptedWorkUploadEnabled) throw new ConflictException('O envio de ePoster não está habilitado neste evento.');
        if (config.acceptedWorkUploadDeadline && config.acceptedWorkUploadDeadline.getTime() < Date.now()) {
          throw new ConflictException('O prazo de envio do ePoster encerrou.');
        }
        const version = await tx.scientificSubmissionVersion.findFirst({
          where: { submissionId: submission.id, eventId: scope.eventId, organizationId: scope.organizationId, versionNumber: submission.currentVersion },
          select: { id: true, eposterFileKey: true },
        });
        if (!version) throw new NotFoundException('Versão do trabalho não encontrada.');
        previousToDelete = version.eposterFileKey;
        const updated = await tx.scientificSubmissionVersion.updateMany({
          where: { id: version.id, eventId: scope.eventId, organizationId: scope.organizationId, eposterFileKey: version.eposterFileKey },
          data: { eposterFileKey: storageKey },
        });
        if (updated.count !== 1) throw new ConflictException('O ePoster foi atualizado em outra sessão. Recarregue antes de substituir.');
        await tx.auditLog.create({
          data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.eposter_uploaded',
            entityType: 'ScientificSubmission', entityId: submission.id,
            metadata: { version: submission.currentVersion, byteSize: pdf.bytes.length } as Prisma.InputJsonObject },
        });
        return { id: submission.id, status: submission.status, hasEposter: true };
      });
    } catch (error) {
      await this.files.remove(storageKey).catch(() => {});
      throw error;
    }
    // Limpeza posterior ao commit nunca remove o arquivo novo nem transforma sucesso em falha.
    if (previousToDelete) await this.files.remove(previousToDelete).catch(() => {});
    return result;
  }

  async revise(slug: string, authorization: string | undefined, submissionId: string, rawInput: unknown) {
    if (!SUBMISSION_ID.test(submissionId)) throw new BadRequestException('Trabalho inválido.');
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    let input: ReturnType<typeof normalizeAuthorSubmission>;
    try { input = normalizeAuthorSubmission(rawInput); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const hasSubmittedFile = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      && Boolean((rawInput as { file?: unknown }).file);
    const submittedFile = hasSubmittedFile ? this.submissionFile(true, rawInput) : null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let writtenFileKey: string | null = null;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const event = await tx.event.findFirst({
            where: { id: scope.eventId, organizationId: scope.organizationId, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
            select: { id: true },
          });
          const reservation = await tx.eventRegistrationReservation.findUnique({
            where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
            select: { status: true, registrationData: true },
          });
          if (!event || reservation?.status !== RegistrationReservationStatus.CONFIRMED) {
            throw new NotFoundException('Submissão científica indisponível.');
          }
          const submission = await tx.scientificSubmission.findFirst({
            where: { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
            select: { id: true, status: true, currentVersion: true, modalityId: true },
          });
          if (!submission) throw new NotFoundException('Trabalho não encontrado.');
          if (!CORRECTABLE_STATUSES.has(submission.status)) {
            throw new ConflictException('Este trabalho já foi decidido e não aceita nova versão.');
          }
          const config = await tx.scientificSubmissionConfig.findUnique({
            where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
          });
          if (!config) throw new ConflictException('Submissões ainda não configuradas.');
          if (!config.allowCorrections) throw new ConflictException('Este evento não aceita correção de trabalho enviado.');
          if (submission.currentVersion >= 10) throw new ConflictException('Este trabalho atingiu o limite de versões.');
          if (input.modalityId !== submission.modalityId) throw new BadRequestException('A correção permanece na mesma modalidade.');
          const modality = await tx.scientificSubmissionModality.findFirst({
            where: { id: submission.modalityId, eventId: scope.eventId, organizationId: scope.organizationId },
            select: { rules: true },
          });
          if (!modality) throw new BadRequestException('Modalidade indisponível.');
          const sealed = this.composeAbstract(input, modality.rules, config);
          const payloadHash = this.payloadDigest(sealed, submittedFile?.bytes ?? null);
          const latest = await tx.scientificSubmissionVersion.findFirst({
            where: { submissionId: submission.id, eventId: scope.eventId, organizationId: scope.organizationId },
            orderBy: { versionNumber: 'desc' },
            select: { contentHash: true },
          });
          if (latest?.contentHash === payloadHash) {
            return { id: submission.id, title: sealed.title, status: submission.status, submittedAt: null, currentVersion: submission.currentVersion, duplicate: true };
          }
          this.assertWindow(modality.rules);
          const file = this.submissionFile(config.requireFile, rawInput);
          if (input.title.length > config.titleMaxLength) throw new BadRequestException('Título acima do limite deste evento.');
          if (input.keywords.length < config.minKeywords || input.keywords.length > config.maxKeywords) {
            throw new BadRequestException('A quantidade de palavras-chave não atende às regras do evento.');
          }
          const presentationFormats = readPresentationFormats(config.presentationFormats, DEFAULT_PRESENTATION_FORMATS);
          const presentation = presentationFormats.find((item) => item.code === input.presentationFormatCode);
          if (config.requirePresentationSuggestion) {
            if (!presentation?.submissionEnabled) throw new BadRequestException('Selecione uma forma de apresentação habilitada para submissão.');
          } else if (input.presentationFormatCode) {
            throw new BadRequestException('Este evento não pede sugestão de apresentação.');
          }
          const scientificName = this.collectedText(config.collectScientificName, input.scientificName, 'Informe o nome científico.', 2);
          const institutionAddress = this.collectedText(config.collectInstitutionAddress, input.institutionAddress, 'Informe o endereço da instituição.', 5);
          const fundingAgency = this.collectedText(config.collectFundingAgency, input.fundingAgency, '', 0);
          if (config.collectConflictOfInterest) {
            if (input.conflictDeclared === null) throw new BadRequestException('Informe se há conflito de interesse.');
            if (input.conflictDeclared && input.conflictDetail.length < 3) throw new BadRequestException('Descreva o conflito de interesse.');
            if (!input.conflictDeclared && input.conflictDetail) throw new BadRequestException('Detalhe o conflito somente quando ele existir.');
          } else if (input.conflictDeclared !== null || input.conflictDetail) {
            throw new BadRequestException('Este evento não coleta conflito de interesse.');
          }
          const referencesText = this.collectedText(config.collectReferences, input.referencesText, 'Informe as referências bibliográficas.', 2);
          if (config.showProceedingsAuthorization && !input.proceedingsAuthorizationAccepted) {
            throw new BadRequestException('Aceite a autorização de submissão nos anais para enviar o trabalho.');
          }
          const email = emailFrom(reservation.registrationData);
          try {
            assertAuthorRoster(email, input, {
              minAuthors: config.minAuthors, maxAuthors: config.maxAuthors, maxPresenters: config.maxPresenters,
              requirePresenter: config.requirePresenter, requireCorrespondingAuthor: config.requireCorrespondingAuthor,
              requireAuthorInstitution: config.collectAuthorInstitution && config.requireAuthorInstitution,
              collectAdditionalAuthors: config.collectAdditionalAuthors, collectAuthorOrder: config.collectAuthorOrder,
              collectAuthorInstitution: config.collectAuthorInstitution, requireSubmitterAsFirstAuthor: config.requireSubmitterAsFirstAuthor,
            });
          } catch (error) {
            if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
            throw error;
          }
          if (config.requireArea && !input.taxonomyAreaId) throw new BadRequestException('Selecione a área científica.');
          if (config.requireSubarea && !input.taxonomySubareaId) throw new BadRequestException('Selecione a subárea científica.');
          const nodes = await tx.scientificTaxonomyNode.findMany({
            where: { id: { in: [input.taxonomyAreaId, input.taxonomySubareaId].filter((id): id is string => Boolean(id)) },
              eventId: scope.eventId, organizationId: scope.organizationId, active: true },
            select: { id: true, parentId: true, level: true },
          });
          if (input.taxonomyAreaId && !nodes.some((node) => node.id === input.taxonomyAreaId && node.level === ScientificTaxonomyLevel.AREA)) {
            throw new BadRequestException('Área científica inválida.');
          }
          if (input.taxonomySubareaId && !nodes.some((node) => node.id === input.taxonomySubareaId
            && node.level === ScientificTaxonomyLevel.SUBAREA && node.parentId === input.taxonomyAreaId)) {
            throw new BadRequestException('Subárea científica inválida.');
          }
          const data = reservation.registrationData;
          const name = data && typeof data === 'object' && !Array.isArray(data)
            && typeof data.full_name === 'string' ? data.full_name.trim().slice(0, 120) : '';
          if (name.length < 2) throw new ConflictException('Nome da inscrição indisponível para autoria.');
          if (!email) throw new ConflictException('E-mail da inscrição indisponível para identificar autoria.');
          const roster = [
            { name, email, institution: input.institution, presenter: input.submitterPresenter, corresponding: input.submitterCorresponding, scientificName, institutionAddress },
            ...input.coauthors.map((author) => ({ ...author, scientificName: null as string | null, institutionAddress: null as string | null })),
          ];
          const sortOrders = config.collectAuthorOrder
            ? [input.submitterSortOrder, ...input.coauthors.map((author) => author.sortOrder ?? 0)]
            : roster.map((_, index) => index + 1);
          const personIds: string[] = [];
          for (const author of roster) {
            const knownPerson = await tx.scientificPerson.findFirst({
              where: { eventId: scope.eventId, organizationId: scope.organizationId, email: author.email },
            }) ?? await tx.scientificPerson.findFirst({
              where: { eventId: scope.eventId, organizationId: scope.organizationId, email: { equals: author.email, mode: 'insensitive' } },
            });
            const person = knownPerson ?? await tx.scientificPerson.create({
              data: { eventId: scope.eventId, organizationId: scope.organizationId, name: author.name, email: author.email, institution: author.institution || null },
            });
            if (personIds.includes(person.id)) throw new BadRequestException('A autoria repetiu a mesma pessoa.');
            personIds.push(person.id);
          }
          const now = new Date();
          const nextVersion = submission.currentVersion + 1;
          const changed = await tx.scientificSubmission.updateMany({
            where: { id: submission.id, eventId: scope.eventId, organizationId: scope.organizationId, currentVersion: submission.currentVersion, status: submission.status },
            data: {
              title: sealed.title, abstractText: sealed.abstractText || null, keywords: input.keywords,
              taxonomyAreaId: input.taxonomyAreaId, taxonomySubareaId: input.taxonomySubareaId,
              presentationFormatCode: presentation?.code ?? null, fundingAgency,
              conflictDeclared: config.collectConflictOfInterest ? input.conflictDeclared : null,
              conflictDetail: config.collectConflictOfInterest && input.conflictDeclared ? input.conflictDetail : null,
              referencesText, submissionPayloadHash: payloadHash,
              status: ScientificSubmissionStatus.SUBMITTED, currentVersion: nextVersion, submittedAt: now,
            },
          });
          if (changed.count !== 1) throw new ConflictException('O trabalho mudou durante a correção. Atualize e tente novamente.');
          await tx.scientificSubmissionAuthor.deleteMany({
            where: { submissionId: submission.id, eventId: scope.eventId, organizationId: scope.organizationId },
          });
          for (const [index, author] of roster.entries()) {
            await tx.scientificSubmissionAuthor.create({
              data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
                personId: personIds[index]!, sortOrder: sortOrders[index]!, isPresenter: author.presenter, isCorresponding: author.corresponding,
                scientificName: author.scientificName, institutionAddress: author.institutionAddress },
            });
          }
          const fileKey = file ? `${scope.organizationId}/${scope.eventId}/${randomUUID()}.pdf` : null;
          if (file && fileKey) {
            writtenFileKey = fileKey;
            await this.files.write(fileKey, file.bytes);
          }
          await tx.scientificSubmissionVersion.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
              versionNumber: nextVersion, title: sealed.title, abstractText: sealed.abstractText || null,
              keywords: input.keywords, submittedAt: now, contentHash: payloadHash, fileKey,
              presentationFormatCode: presentation?.code ?? null, fundingAgency,
              conflictDeclared: config.collectConflictOfInterest ? input.conflictDeclared : null,
              conflictDetail: config.collectConflictOfInterest && input.conflictDeclared ? input.conflictDetail : null,
              referencesText },
          });
          await tx.auditLog.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.author_revised',
              entityType: 'ScientificSubmission', entityId: submission.id,
              metadata: { version: nextVersion, previousStatus: submission.status } as Prisma.InputJsonObject },
          });
          return { id: submission.id, title: input.title, status: ScientificSubmissionStatus.SUBMITTED, submittedAt: now.toISOString(), currentVersion: nextVersion, duplicate: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (writtenFileKey) await this.files.remove(writtenFileKey).catch(() => {});
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível registrar a nova versão.');
  }

  async uploadFollowUp(slug: string, authorization: string | undefined, submissionId: string, kind: 'second' | 'slide', rawInput: unknown) {
    if (!SUBMISSION_ID.test(submissionId)) throw new BadRequestException('Trabalho inválido.');
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    let pdf: ReturnType<typeof validateScientificPdf>;
    try { pdf = validateScientificPdf(rawInput as { contentBase64?: string; fileName?: string }); }
    catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(kind === 'slide' ? 'Anexe o PDF do slide.' : 'Anexe o PDF da segunda versão.');
    }
    const field = kind === 'second' ? 'secondEposterFileKey' : 'slideFileKey';
    const storageKey = `${scope.organizationId}/${scope.eventId}/${randomUUID()}.pdf`;
    await this.files.write(storageKey, pdf.bytes);
    let previousToDelete: string | null = null;
    let result: { id: string; status: ScientificSubmissionStatus; hasSecondEposter?: boolean; hasSlide?: boolean };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.scientificSubmission.findFirst({
          where: { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
          select: { id: true, status: true, presentationFormatCode: true, currentVersion: true },
        });
        if (!submission) throw new NotFoundException('Trabalho não encontrado.');
        if (submission.status !== ScientificSubmissionStatus.ACCEPTED && submission.status !== ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES) {
          throw new ConflictException('Este arquivo só pode ser enviado depois da decisão de aceite.');
        }
        if (kind === 'second' && submission.presentationFormatCode !== 'EPOSTER') {
          throw new BadRequestException('A segunda versão é do ePoster.');
        }
        const config = await tx.scientificSubmissionConfig.findUnique({
          where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
          select: { acceptedWorkUploadEnabled: true, acceptedWorkUploadDeadline: true },
        });
        if (!config?.acceptedWorkUploadEnabled) throw new ConflictException('O envio depois do aceite não está habilitado neste evento.');
        if (config.acceptedWorkUploadDeadline && config.acceptedWorkUploadDeadline.getTime() < Date.now()) {
          throw new ConflictException('O prazo de envio do arquivo aceito encerrou.');
        }
        const version = await tx.scientificSubmissionVersion.findFirst({
          where: { submissionId: submission.id, eventId: scope.eventId, organizationId: scope.organizationId, versionNumber: submission.currentVersion },
          select: { id: true, eposterFileKey: true, secondEposterFileKey: true, slideFileKey: true },
        });
        if (!version) throw new NotFoundException('Versão do trabalho não encontrada.');
        if (kind === 'second' && !version.eposterFileKey) throw new ConflictException('Envie o primeiro ePoster antes da segunda versão.');
        previousToDelete = version[field];
        const updated = await tx.scientificSubmissionVersion.updateMany({
          where: { id: version.id, eventId: scope.eventId, organizationId: scope.organizationId, [field]: version[field] },
          data: { [field]: storageKey },
        });
        if (updated.count !== 1) throw new ConflictException('O arquivo foi atualizado em outra sessão. Recarregue antes de substituir.');
        await tx.auditLog.create({
          data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.accepted_file_uploaded',
            entityType: 'ScientificSubmission', entityId: submission.id,
            metadata: { slot: kind, version: submission.currentVersion, byteSize: pdf.bytes.length } as Prisma.InputJsonObject },
        });
        return kind === 'second'
          ? { id: submission.id, status: submission.status, hasSecondEposter: true }
          : { id: submission.id, status: submission.status, hasSlide: true };
      });
    } catch (error) {
      await this.files.remove(storageKey).catch(() => {});
      throw error;
    }
    if (previousToDelete) await this.files.remove(previousToDelete).catch(() => {});
    return result;
  }

  private draftIdFrom(rawInput: unknown) {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
    const value = (rawInput as { draftId?: unknown }).draftId;
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !SUBMISSION_ID.test(value)) throw new BadRequestException('Rascunho inválido.');
    return value;
  }

  private composeDraftAbstract(input: AuthorSubmissionInput, rules: unknown) {
    if (!input.abstractBlocks?.length) return input.abstractText;
    const window = publicModalityWindow(rules);
    if (window.blocks.length === 0 || input.abstractBlocks.some((block) => !window.blocks.some((rule) => rule.code === block.code))) {
      throw new BadRequestException('Os blocos do resumo não pertencem à modalidade.');
    }
    return window.blocks.map((block) => {
      const text = input.abstractBlocks?.find((item) => item.code === block.code)?.text ?? '';
      return `${block.label}\n${text}`;
    }).join('\n\n');
  }

  private composeAbstract(
    input: AuthorSubmissionInput,
    rules: unknown,
    config: { collectTypedAbstract: boolean; abstractCounterUnit: 'CHARACTERS' | 'WORDS'; abstractMin: number; abstractMax: number },
  ) {
    try {
      return composeModalityAbstract(input, rules, {
        enabled: config.collectTypedAbstract,
        unit: config.abstractCounterUnit,
        min: config.abstractMin,
        max: config.abstractMax,
      });
    } catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private assertWindow(rules: unknown) {
    try { assertModalityWindowOpen(rules, new Date()); }
    catch (error) {
      if (error instanceof AuthorSubmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private payloadDigest(input: AuthorSubmissionInput, bytes: Buffer | null) {
    return digest(JSON.stringify(bytes
      ? { ...input, fileHash: createHash('sha256').update(bytes).digest('hex') }
      : input));
  }

  private submissionFile(required: boolean, rawInput: unknown) {
    const file = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? (rawInput as { file?: unknown }).file
      : undefined;
    if (!required) {
      if (file) throw new BadRequestException('Este evento não pede arquivo na submissão. O ePoster entra depois do aceite.');
      return null;
    }
    if (!isPdfPayload(file)) throw new BadRequestException('Anexe o PDF exigido na submissão.');
    return validateScientificPdf(file);
  }

  private collectedText(enabled: boolean, value: string, requiredMessage: string, minLength: number) {
    if (!enabled) {
      if (value) throw new BadRequestException('Este evento não coleta esse campo.');
      return null;
    }
    if (value.length < minLength) {
      if (requiredMessage) throw new BadRequestException(requiredMessage);
      return null;
    }
    return value || null;
  }
}

function isPdfPayload(value: unknown): value is { contentBase64: string; fileName: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { contentBase64, fileName } = value as { contentBase64?: unknown; fileName?: unknown };
  return typeof contentBase64 === 'string' && contentBase64.trim() !== ''
    && typeof fileName === 'string' && fileName.trim() !== '';
}

function emailFrom(data: unknown) {
  return data && typeof data === 'object' && !Array.isArray(data) && typeof (data as { email?: unknown }).email === 'string'
    ? (data as { email: string }).email.trim().toLowerCase()
    : '';
}

