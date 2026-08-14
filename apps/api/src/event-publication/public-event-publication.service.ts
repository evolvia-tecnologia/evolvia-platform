import { Injectable } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { buildPublicEventDto, PublicEventDto } from './event-publication.public-contract';

@Injectable()
export class PublicEventPublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string): Promise<PublicEventDto | null> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
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
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            kind: true,
            title: true,
            enabled: true,
            sortOrder: true,
            content: true,
          },
        },
      },
    });

    if (!event || event.status !== EventStatus.PUBLISHED) return null;

    return buildPublicEventDto(event, event.eventPublication, event.eventPublicationSections);
  }
}
