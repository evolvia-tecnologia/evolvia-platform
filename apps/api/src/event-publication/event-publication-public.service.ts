import { Injectable } from '@nestjs/common';
import { EventFormat, EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { buildPublicEventDto, PublicEventDto } from './event-publication.public-contract';

export type PublicEventDiscoveryItem = {
  name: string;
  slug: string;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
  shortDescription: string | null;
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

@Injectable()
export class EventPublicationPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async discover(input: {
    query?: string;
    format?: EventFormat;
    page?: number;
    pageSize?: number;
  }): Promise<PublicEventDiscoveryResult> {
    const query = input.query?.trim().slice(0, 120) || undefined;
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(24, positiveInteger(input.pageSize, 12));

    const where = {
      status: EventStatus.PUBLISHED,
      ...(input.format ? { format: input.format } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' as const } },
              { venue: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        select: {
          name: true,
          slug: true,
          format: true,
          startDate: true,
          endDate: true,
          venue: true,
          eventPublication: { select: { shortDescription: true } },
        },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: events.map((event) => ({
        name: event.name,
        slug: event.slug,
        format: event.format,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
        shortDescription: event.eventPublication?.shortDescription ?? null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listForSitemap(): Promise<PublicEventSitemapEntry[]> {
    return this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: 'asc' },
      take: 50_000,
    });
  }

  async findBySlug(slug: string): Promise<PublicEventDto | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return null;

    const event = await this.prisma.event.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        format: true,
        startDate: true,
        endDate: true,
        venue: true,
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

    if (!event) return null;
    return buildPublicEventDto(event, event.eventPublication, event.eventPublicationSections);
  }
}
