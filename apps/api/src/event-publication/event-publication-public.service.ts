import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { buildPublicEventDto, PublicEventDto } from './event-publication.public-contract';

@Injectable()
export class EventPublicationPublicService {
  constructor(private readonly prisma: PrismaService) {}

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
