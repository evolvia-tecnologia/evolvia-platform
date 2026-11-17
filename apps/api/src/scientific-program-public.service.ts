import { Injectable } from '@nestjs/common';
import { EventProfileCode, EventStatus, ScientificProgramActivityStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { presentPublicProgramActivity, PublicProgram } from './scientific-program-public-policy';

@Injectable()
export class ScientificProgramPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<PublicProgram | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return null;

    const event = await this.prisma.event.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, organizationId: true, slug: true, status: true, profileCode: true, timeZone: true, format: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) return null;
    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) return null;

    const activities = await this.prisma.scientificProgramActivity.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        status: ScientificProgramActivityStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        activityType: true,
        description: true,
        startAt: true,
        endAt: true,
        space: { select: { name: true, kind: true, location: true, active: true } },
        taxonomyArea: { select: { name: true, active: true } },
        submission: {
          select: {
            title: true,
            status: true,
            stationPublicCode: true,
            authors: {
              select: { person: { select: { name: true } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        participants: {
          select: {
            participationType: true,
            customRoleLabel: true,
            person: {
              select: {
                name: true,
                status: true,
                guestProfile: { select: { displayName: true, professionalTitle: true, invitationStatus: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ startAt: 'asc' }, { title: 'asc' }, { id: 'asc' }],
    });

    return {
      event: { slug: event.slug, timeZone: event.timeZone, format: event.format },
      activities: activities.map(presentPublicProgramActivity),
    };
  }
}
