import { Injectable, NotFoundException } from '@nestjs/common';
import { EventFormat, EventStatus } from '@prisma/client';
import { AuthorizationService } from '../authorization.service';
import { PrismaService } from '../prisma.service';
import { canMutateEventPublication } from './event-publication.policy';
import { buildPreviewEventDto, PublicEventDto } from './event-publication.public-contract';
import { EventPublicationRepository } from './event-publication.repository';

type PreviewEventScope = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: EventStatus;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
};

@Injectable()
export class EventPublicationPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly repository: EventPublicationRepository,
  ) {}

  async getPreview(userId: string, eventId: string): Promise<PublicEventDto> {
    const event = await this.requireEventScope(eventId);
    const membership = await this.authorization.requireMembership(userId, event.organizationId);

    if (!canMutateEventPublication({
      role: membership.role,
      eventStatus: event.status,
      mutation: 'PREPARE_PREVIEW',
    })) {
      throw new NotFoundException('Evento não encontrado.');
    }

    const publication = await this.repository.findByScope(
      this.prisma,
      event.organizationId,
      event.id,
    );
    const sections = publication
      ? await this.repository.findSectionsByScope(
          this.prisma,
          event.organizationId,
          event.id,
          publication.id,
        )
      : [];

    return buildPreviewEventDto(event, publication, sections);
  }

  private async requireEventScope(eventId: string): Promise<PreviewEventScope> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        status: true,
        format: true,
        startDate: true,
        endDate: true,
        venue: true,
      },
    });

    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    return { ...event, organizationId: event.organizationId };
  }
}
