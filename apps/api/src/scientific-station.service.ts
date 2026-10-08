import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventProfileCode, EventStatus, Prisma, ScientificSubmissionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { ScientificFileStorage } from './scientific-file.storage';
import { STATION_PAGE_SIZE, ScientificStationPolicyError, StationSearchField, normalizeStationPage, normalizeStationSearch, stationFileName } from './scientific-station-policy';

const ACCEPTED = [ScientificSubmissionStatus.ACCEPTED, ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES];
const SUBMISSION_ID = /^[a-z0-9]{10,40}$/u;

const publishedWork = {
  status: { in: ACCEPTED },
  OR: [{ stationShowAbstract: true }, { stationShowEposter: true }],
} satisfies Prisma.ScientificSubmissionWhereInput;

@Injectable()
export class ScientificStationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly files: ScientificFileStorage,
  ) {}

  async management(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const works = await this.prisma.scientificSubmission.findMany({
      where: { eventId, organizationId: event.organizationId!, status: { in: ACCEPTED } },
      orderBy: [{ stationPublicCode: 'asc' }, { title: 'asc' }],
      select: this.workSelect(),
    });
    return {
      event: { id: event.id, name: event.name, slug: event.slug, status: event.status },
      path: `/evento/${event.slug}/estacao`,
      works: works.map((work) => this.organizerWork(work)),
    };
  }

  async updateVisibility(userId: string, eventId: string, submissionId: string, raw: unknown) {
    if (!SUBMISSION_ID.test(submissionId)) throw new NotFoundException('Trabalho não encontrado.');
    const input = this.visibility(raw);
    const event = await this.requireScientificEvent(userId, eventId);
    if (event.status === EventStatus.CANCELLED) throw new ConflictException('Evento cancelado.');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const work = await tx.scientificSubmission.findFirst({
            where: { id: submissionId, eventId, organizationId: event.organizationId!, status: { in: ACCEPTED } },
            select: { id: true, presentationFormatCode: true, stationPublicCode: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { eposterFileKey: true, secondEposterFileKey: true } } },
          });
          if (!work) throw new NotFoundException('Só um trabalho aprovado entra na estação científica.');
          if (input.showEposter && (work.presentationFormatCode !== 'EPOSTER' || !currentPosterKey(work.versions[0]))) {
            throw new BadRequestException('Este trabalho ainda não tem e-poster para publicar.');
          }
          let stationPublicCode = work.stationPublicCode;
          if ((input.showAbstract || input.showEposter) && stationPublicCode == null) {
            const last = await tx.scientificSubmission.aggregate({
              where: { eventId },
              _max: { stationPublicCode: true },
            });
            stationPublicCode = (last._max.stationPublicCode ?? 0) + 1;
          }
          await tx.scientificSubmission.update({
            where: { id: work.id },
            data: {
              stationPublicCode,
              stationShowAbstract: input.showAbstract,
              stationShowEposter: input.showEposter,
            },
          });
          await tx.auditLog.create({
            data: {
              eventId, organizationId: event.organizationId!, actorUserId: userId,
              action: 'scientific.station_visibility_updated', entityType: 'ScientificSubmission', entityId: work.id,
              metadata: { showAbstract: input.showAbstract, showEposter: input.showEposter } as Prisma.InputJsonObject,
            },
          });
        });
        return this.management(userId, eventId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível reservar o id do resumo. Tente de novo.');
  }

  async search(slug: string, field: unknown, text: unknown, pageRaw?: unknown) {
    let query: ReturnType<typeof normalizeStationSearch>;
    let page = 1;
    try {
      query = normalizeStationSearch(field, text);
      page = normalizeStationPage(pageRaw);
    } catch (error) {
      if (error instanceof ScientificStationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const event = await this.publishedEvent(slug);
    const where = this.searchWhere(event.id, event.organizationId!, query.field, query.text);
    const pageSize = STATION_PAGE_SIZE;
    const [total, works] = await Promise.all([
      this.prisma.scientificSubmission.count({ where }),
      this.prisma.scientificSubmission.findMany({
        where,
        orderBy: [{ title: 'asc' }, { stationPublicCode: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.workSelect(),
      }),
    ]);
    return {
      event: this.eventIdentity(event),
      query,
      total,
      page,
      pageSize,
      works: works.map((work) => this.publicWork(work)),
    };
  }

  async detail(slug: string, rawCode: string) {
    const event = await this.publishedEvent(slug);
    const work = await this.visibleWork(event.id, event.organizationId!, rawCode);
    const keywords = work.stationShowAbstract && Array.isArray(work.keywords)
      ? work.keywords.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      event: { name: event.name, slug: event.slug },
      work: {
        ...this.publicWork(work),
        abstractText: work.stationShowAbstract ? (work.abstractText ?? '') : null,
        keywords,
      },
    };
  }

  async eposter(slug: string, rawCode: string) {
    const event = await this.publishedEvent(slug);
    const work = await this.visibleWork(event.id, event.organizationId!, rawCode);
    const eposterFileKey = currentPosterKey(work.versions[0]);
    if (work.presentationFormatCode !== 'EPOSTER' || !work.stationShowEposter || !eposterFileKey || work.stationPublicCode == null) throw new NotFoundException('E-poster indisponível.');
    const bytes = await this.files.read(eposterFileKey);
    return { bytes, fileName: stationFileName(work.stationPublicCode) };
  }

  private visibility(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Informe o que pode ser aberto.');
    const value = raw as Record<string, unknown>;
    if (typeof value.showAbstract !== 'boolean' || typeof value.showEposter !== 'boolean') {
      throw new BadRequestException('Informe se o resumo e o e-poster ficam disponíveis.');
    }
    return { showAbstract: value.showAbstract, showEposter: value.showEposter };
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, slug: true, status: true, profileCode: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A estação científica existe apenas em evento técnico-científico.');
    }
    return event;
  }

  private async publishedEvent(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug: { equals: slug, mode: 'insensitive' }, status: EventStatus.PUBLISHED, profileCode: EventProfileCode.SCIENTIFIC_EVENT },
      select: {
        id: true, name: true, slug: true, organizationId: true,
        eventPublication: { select: { logoAsset: { select: { altText: true, decorative: true, state: true, usage: true, width: true, height: true } } } },
      },
    });
    if (!event?.organizationId) throw new NotFoundException('Estação científica indisponível.');
    return event;
  }

  private eventIdentity(event: {
    name: string;
    slug: string;
    eventPublication?: { logoAsset: { altText: string | null; decorative: boolean; state: string; usage: string; width: number; height: number } | null } | null;
  }) {
    const logo = event.eventPublication?.logoAsset;
    const ready = logo?.state === 'ACTIVE' && logo.usage === 'LOGO';
    return {
      name: event.name,
      slug: event.slug,
      logo: ready ? {
        url: `/api/public/events/${encodeURIComponent(event.slug)}/media/LOGO`,
        alt: logo.decorative ? '' : logo.altText ?? '',
        width: logo.width,
        height: logo.height,
      } : null,
    };
  }

  private async visibleWork(eventId: string, organizationId: string, rawCode: string) {
    if (!/^\d{1,6}$/u.test(rawCode)) throw new NotFoundException('Trabalho não encontrado.');
    const work = await this.prisma.scientificSubmission.findFirst({
      where: { eventId, organizationId, stationPublicCode: Number(rawCode), ...publishedWork },
      select: { ...this.workSelect(), abstractText: true, keywords: true },
    });
    if (!work) throw new NotFoundException('Trabalho não encontrado.');
    return work;
  }

  private searchWhere(eventId: string, organizationId: string, field: StationSearchField | null, text: string): Prisma.ScientificSubmissionWhereInput {
    const where: Prisma.ScientificSubmissionWhereInput = { eventId, organizationId, ...publishedWork };
    if (!field || !text) return where;
    if (field === 'TITLE') where.title = { contains: text, mode: 'insensitive' };
    if (field === 'AUTHOR') where.authors = { some: { person: { name: { contains: text, mode: 'insensitive' } } } };
    if (field === 'AREA') where.taxonomyArea = { is: { name: { contains: text, mode: 'insensitive' } } };
    if (field === 'SUBAREA') where.taxonomySubarea = { is: { name: { contains: text, mode: 'insensitive' } } };
    if (field === 'INSTITUTION') where.authors = { some: { person: { institution: { contains: text, mode: 'insensitive' } } } };
    if (field === 'CODE') where.stationPublicCode = Number(text);
    return where;
  }

  private workSelect() {
    return {
      id: true,
      title: true,
      presentationFormatCode: true,
      stationPublicCode: true,
      stationShowAbstract: true,
      stationShowEposter: true,
      keywords: true,
      taxonomyArea: { select: { name: true } },
      taxonomySubarea: { select: { name: true } },
      authors: { orderBy: { sortOrder: 'asc' as const }, select: { person: { select: { name: true, institution: true } } } },
      versions: { orderBy: { versionNumber: 'desc' as const }, take: 1, select: { eposterFileKey: true, secondEposterFileKey: true } },
    };
  }

  private people(work: { authors: Array<{ person: { name: string; institution: string | null } }> }) {
    const authors = work.authors.map((author) => author.person.name);
    const institutions = [...new Set(work.authors.map((author) => author.person.institution?.trim()).filter((item): item is string => Boolean(item)))];
    return { authors, institutions };
  }

  private publicWork(work: ReturnType<ScientificStationService['sampleWork']>) {
    const people = this.people(work);
    return {
      code: work.stationPublicCode,
      formatCode: /^[A-Z0-9_]{2,40}$/u.test(work.presentationFormatCode ?? '') ? work.presentationFormatCode : null,
      title: work.title,
      authors: people.authors,
      institutions: people.institutions,
      area: work.taxonomyArea?.name ?? null,
      subarea: work.taxonomySubarea?.name ?? null,
      showAbstract: work.stationShowAbstract,
      showEposter: work.presentationFormatCode === 'EPOSTER' && work.stationShowEposter && Boolean(currentPosterKey(work.versions[0])),
    };
  }

  private organizerWork(work: ReturnType<ScientificStationService['sampleWork']>) {
    return {
      id: work.id,
      ...this.publicWork(work),
      hasEposter: work.presentationFormatCode === 'EPOSTER' && Boolean(currentPosterKey(work.versions[0])),
    };
  }

  private sampleWork() {
    return null as unknown as {
      id: string;
      title: string;
      presentationFormatCode: string | null;
      stationPublicCode: number | null;
      stationShowAbstract: boolean;
      stationShowEposter: boolean;
      taxonomyArea: { name: string } | null;
      taxonomySubarea: { name: string } | null;
      authors: Array<{ person: { name: string; institution: string | null } }>;
      versions: Array<{ eposterFileKey: string | null; secondEposterFileKey?: string | null }>;
    };
  }
}

function currentPosterKey(version: { eposterFileKey: string | null; secondEposterFileKey?: string | null } | undefined) {
  return version?.secondEposterFileKey || version?.eposterFileKey || null;
}
