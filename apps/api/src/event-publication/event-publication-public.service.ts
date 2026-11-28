import { Injectable, Optional } from '@nestjs/common';
import { EventFormat, EventProfileCode, EventStatus, OrganizationLegalKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { estadosQuePermitem, podeOperar } from '../platform-moderation-enforcement';
import { buildPublicEventDto, PublicEventDto } from './event-publication.public-contract';
import { EventPublicationMediaService } from './event-publication-media.service';
import { recordPublicPageView } from '../event-page-view';
import { discoveryTextWhere, regionWhere, subjectAreaWhere } from './public-discovery.policy';

export type PublicEventDiscoveryItem = {
  name: string;
  slug: string;
  eventType: string;
  profileCode: EventProfileCode | null;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  timeZone: string | null;
  venue: string | null;
  estimatedAudience: number | null;
  shortDescription: string | null;
  cardMedia: { url: string; usage: 'COVER' | 'LOGO' } | null;
};

export type PublicEventDiscoveryResult = {
  items: PublicEventDiscoveryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PublicEventSitemapEntry = {
  slug: string;
  updatedAt: Date;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value as number));
}

function parseDiscoveryDate(value: string | undefined): Date | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return undefined;

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return undefined;
  }

  return date;
}

function latestDate(values: Array<Date | null | undefined>): Date {
  return new Date(Math.max(...values.filter((value): value is Date => value instanceof Date).map((value) => value.getTime())));
}

@Injectable()
export class EventPublicationPublicService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media?: EventPublicationMediaService,
  ) {}

  /**
   * Os eventos que a moderação tira da listagem pública.
   *
   * Consulta separada, e não um join, porque `platform-moderation.prisma`
   * declara as tabelas SEM relação com `Event` — decisão do corte, já que
   * `schema.prisma` é compartilhado e o Work coordena. Sem relação não há
   * `where` aninhado possível.
   *
   * O recorte é pequeno por natureza: só existe linha para evento que já foi
   * moderado alguma vez, então o `notIn` recebe poucos ids e não cresce com o
   * catálogo.
   *
   * A formulação é NEGATIVA de propósito — "tudo que não está entre os
   * permitidos" — porque falha fechado: um estado novo na política some da
   * vitrine até alguém decidir que ele pode aparecer, em vez de aparecer até
   * alguém lembrar de escondê-lo.
   */
  private async eventosForaDaListagem(): Promise<string[]> {
    const permitidos = estadosQuePermitem('listagem_publica');
    const linhas = await this.prisma.platformEventModeration.findMany({
      where: { NOT: { state: { in: permitidos } } },
      select: { eventId: true },
    });
    return linhas.map((linha) => linha.eventId);
  }

  async discover(input: {
    query?: string;
    format?: EventFormat;
    profileCode?: EventProfileCode;
    area?: string;
    region?: string;
    from?: string;
    until?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PublicEventDiscoveryResult> {
    const query = input.query?.trim().slice(0, 120) || undefined;
    const from = parseDiscoveryDate(input.from);
    const until = parseDiscoveryDate(input.until);
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(24, positiveInteger(input.pageSize, 12));

    const conditions: Prisma.EventWhereInput[] = [];
    if (from) {
      conditions.push({
        OR: [
          { endDate: { gte: from } },
          { endDate: null },
        ],
      });
    }
    if (until) conditions.push({ endDate: { lt: until } });
    const text = discoveryTextWhere(query);
    const area = subjectAreaWhere(input.area);
    const region = regionWhere(input.region);
    if (text) conditions.push(text);
    if (area) conditions.push(area);
    if (region) conditions.push(region);

    // Lido ANTES do `where` para que a contagem e a página usem o mesmo recorte:
    // total e conteúdo divergirem é pior que qualquer dos dois estar velho.
    const ocultos = await this.eventosForaDaListagem();

    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      ...(ocultos.length > 0 ? { id: { notIn: ocultos } } : {}),
      ...(input.format ? { format: input.format } : {}),
      ...(input.profileCode ? { profileCode: input.profileCode } : {}),
      ...(conditions.length > 0 ? { AND: conditions } : {}),
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        select: {
          name: true,
          slug: true,
          eventType: true,
          profileCode: true,
          format: true,
          startDate: true,
          endDate: true,
          timeZone: true,
          venue: true,
          estimatedAudience: true,
          eventPublication: { select: { shortDescription: true, coverAssetId: true, logoAssetId: true } },
        },
        orderBy: [{ startDate: from && !until ? 'asc' : 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: events.map((event) => ({
        name: event.name,
        slug: event.slug,
        eventType: event.eventType,
        profileCode: event.profileCode,
        format: event.format,
        startDate: event.startDate,
        endDate: event.endDate,
        timeZone: event.timeZone,
        venue: event.venue,
        estimatedAudience: event.estimatedAudience,
        shortDescription: event.eventPublication?.shortDescription ?? null,
        cardMedia: event.eventPublication?.coverAssetId
          ? { url: `/api/public/events/${encodeURIComponent(event.slug)}/media/COVER`, usage: 'COVER' as const }
          : event.eventPublication?.logoAssetId
            ? { url: `/api/public/events/${encodeURIComponent(event.slug)}/media/LOGO`, usage: 'LOGO' as const }
            : null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listForSitemap(): Promise<PublicEventSitemapEntry[]> {
    // O sitemap é listagem pública como qualquer outra: deixar o evento
    // removido aqui o devolveria aos buscadores pela porta dos fundos.
    const ocultos = await this.eventosForaDaListagem();

    const events = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        ...(ocultos.length > 0 ? { id: { notIn: ocultos } } : {}),
      },
      select: {
        slug: true,
        updatedAt: true,
        eventPublication: { select: { updatedAt: true } },
        eventPublicationSections: {
          where: { enabled: true },
          select: { updatedAt: true },
        },
      },
      orderBy: { slug: 'asc' },
      take: 50_000,
    });

    return events.map((event) => ({
      slug: event.slug,
      updatedAt: latestDate([
        event.updatedAt,
        event.eventPublication?.updatedAt,
        ...event.eventPublicationSections.map((section) => section.updatedAt),
      ]),
    }));
  }

  recordVisit(slug: string) {
    return recordPublicPageView(this.prisma, slug);
  }

  async findBySlug(slug: string): Promise<(PublicEventDto & {
    organizer: { legalName: string; taxId: string } | null;
  }) | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return null;

    const event = await this.prisma.event.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        status: true,
        eventType: true,
        profileCode: true,
        format: true,
        startDate: true,
        endDate: true,
        timeZone: true,
        venue: true,
        estimatedAudience: true,
        eventPublication: {
          select: {
            shortDescription: true,
            fullDescription: true,
            publicContactEmail: true,
            publicContactPhone: true,
            seoTitle: true,
            seoDescription: true,
            accessibilitySummary: true,
            themeConfig: true,
            logoAssetId: true,
            coverAssetId: true,
            socialImageAssetId: true,
            id: true,
            organizationId: true,
            eventId: true,
            revision: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        eventPublicationSections: {
          select: {
            kind: true,
            title: true,
            enabled: true,
            sortOrder: true,
            content: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) return null;

    // A moderação entra DEPOIS do status e devolve o MESMO `null`, que o
    // controller transforma em 404. De propósito: a apresentação pública nunca
    // conta que há moderação em curso, nem a classificação, o motivo ou a
    // referência do caso. Uma resposta diferente para evento suspenso já seria a
    // acusação pública que o corte evita.
    const moderacao = await this.prisma.platformEventModeration.findUnique({
      where: { eventId: event.id },
      select: { state: true },
    });
    if (!podeOperar(moderacao, 'divulgacao_publica').permitido) return null;

    const media = this.media
      ? await this.media.publicDescriptors(event.id, event.organizationId, event.slug, event.eventPublication)
      : [];
    const presented = buildPublicEventDto(event, event.eventPublication, event.eventPublicationSections, media);
    if (!presented) return null;
    const profile = await this.prisma.organizationLegalProfile.findUnique({
      where: { organizationId: event.organizationId },
      select: { kind: true, legalName: true, taxId: true },
    });
    const organizer = profile?.kind === OrganizationLegalKind.COMPANY && profile.legalName && profile.taxId
      ? { legalName: profile.legalName, taxId: profile.taxId }
      : null;
    return { ...presented, organizer };
  }
}
