import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventProfileCode, EventStatus, Prisma, RegistrationReservationStatus, ScientificSubmissionStatus, ScientificTaxonomyLevel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ParticipantAreaService } from './participant-area.service';
import { PrismaService } from './prisma.service';
import { AuthorSubmissionPolicyError, normalizeAuthorSubmission, normalizeSubmissionKey } from './scientific-author-policy';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class ScientificAuthorService {
  constructor(private readonly prisma: PrismaService, private readonly participant: ParticipantAreaService) {}

  async get(slug: string, authorization?: string) {
    const scope = await this.participant.requireConfirmedScope(slug, authorization);
    const event = await this.prisma.event.findFirst({
      where: { id: scope.eventId, organizationId: scope.organizationId, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
      select: { name: true },
    });
    if (!event) throw new NotFoundException('Submissão científica indisponível.');
    const [config, modalities, taxonomy, submissions] = await Promise.all([
      this.prisma.scientificSubmissionConfig.findUnique({
        where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
        select: { requireArea: true, requireSubarea: true, requireFile: true, minAuthors: true, maxAuthors: true,
          requireAuthorInstitution: true, titleMaxLength: true, minKeywords: true, maxKeywords: true, maxSubmissionsPerAuthor: true },
      }),
      this.prisma.scientificSubmissionModality.findMany({
        where: { eventId: scope.eventId, organizationId: scope.organizationId, active: true },
        orderBy: { name: 'asc' }, select: { id: true, name: true, description: true },
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
        select: { id: true, title: true, status: true, submittedAt: true, currentVersion: true, modality: { select: { name: true } } },
      }),
    ]);
    const reason = !config ? 'O organizador ainda não configurou as submissões.'
      : modalities.length === 0 ? 'O organizador ainda não disponibilizou uma modalidade.'
      : config.requireFile ? 'Este evento exige arquivo. O envio de arquivos será habilitado em um próximo corte.'
      : config.minAuthors > 1 ? 'Este evento exige coautores. O cadastro de coautoria será habilitado em um próximo corte.'
      : null;
    return {
      event: { name: event.name },
      available: reason === null,
      reason,
      config,
      modalities,
      taxonomy,
      submissions: submissions.map((item) => ({
        id: item.id, title: item.title, status: item.status, submittedAt: item.submittedAt?.toISOString() ?? null,
        currentVersion: item.currentVersion, modality: item.modality.name,
      })),
    };
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
    const payloadHash = digest(JSON.stringify(input));
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
          const existing = await tx.scientificSubmission.findFirst({
            where: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId, submissionKeyHash: keyHash },
            select: { id: true, title: true, status: true, submittedAt: true, submissionPayloadHash: true },
          });
          if (existing) {
            if (existing.submissionPayloadHash !== payloadHash) throw new ConflictException('Chave já utilizada com outro trabalho.');
            return { id: existing.id, title: existing.title, status: existing.status, submittedAt: existing.submittedAt?.toISOString() ?? null, duplicate: true };
          }
          const config = await tx.scientificSubmissionConfig.findUnique({
            where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
          });
          if (!config) throw new ConflictException('Submissões ainda não configuradas.');
          if (config.requireFile || config.minAuthors > 1) throw new ConflictException('As regras deste evento ainda não são atendidas pelo envio disponível.');
          if (input.title.length > config.titleMaxLength) throw new BadRequestException('Título acima do limite deste evento.');
          if (input.keywords.length < config.minKeywords || input.keywords.length > config.maxKeywords) {
            throw new BadRequestException('A quantidade de palavras-chave não atende às regras do evento.');
          }
          if (config.requireAuthorInstitution && input.institution.length < 2) throw new BadRequestException('Informe a instituição do autor.');
          if (config.requireArea && !input.taxonomyAreaId) throw new BadRequestException('Selecione a área científica.');
          if (config.requireSubarea && !input.taxonomySubareaId) throw new BadRequestException('Selecione a subárea científica.');
          const modality = await tx.scientificSubmissionModality.findFirst({
            where: { id: input.modalityId, eventId: scope.eventId, organizationId: scope.organizationId, active: true },
            select: { id: true },
          });
          if (!modality) throw new BadRequestException('Modalidade indisponível.');
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
            where: { eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId },
          });
          if (submitted >= config.maxSubmissionsPerAuthor) throw new ConflictException('Limite de trabalhos por autor atingido.');
          const data = reservation.registrationData as Prisma.JsonObject;
          const name = typeof data.full_name === 'string' ? data.full_name.trim().slice(0, 120) : '';
          if (name.length < 2) throw new ConflictException('Nome da inscrição indisponível para autoria.');
          const now = new Date();
          const person = await tx.scientificPerson.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, name,
              institution: input.institution || null },
          });
          const submission = await tx.scientificSubmission.create({
            data: {
              eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId,
              submissionKeyHash: keyHash, submissionPayloadHash: payloadHash,
              modalityId: modality.id, title: input.title, abstractText: input.abstractText,
              keywords: input.keywords, taxonomyAreaId: input.taxonomyAreaId, taxonomySubareaId: input.taxonomySubareaId,
              status: ScientificSubmissionStatus.SUBMITTED, currentVersion: 1, submittedAt: now,
            },
          });
          await tx.scientificSubmissionAuthor.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
              personId: person.id, sortOrder: 1, isPresenter: true, isCorresponding: true },
          });
          await tx.scientificSubmissionVersion.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: submission.id,
              versionNumber: 1, title: input.title, abstractText: input.abstractText,
              keywords: input.keywords, submittedAt: now, contentHash: payloadHash },
          });
          await tx.auditLog.create({
            data: { eventId: scope.eventId, organizationId: scope.organizationId, action: 'scientific.author_submitted',
              entityType: 'ScientificSubmission', entityId: submission.id,
              metadata: { version: 1 } as Prisma.InputJsonObject },
          });
          return { id: submission.id, title: submission.title, status: submission.status, submittedAt: now.toISOString(), duplicate: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível concluir a submissão.');
  }
}
