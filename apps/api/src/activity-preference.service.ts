import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventActivityEnrollmentStatus, Prisma } from '@prisma/client';
import { preferenceParticipantName } from './activity-preference.policy';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { ParticipantAgendaService } from './participant-agenda.service';
import { PrismaService } from './prisma.service';

const PAGE = 100;

@Injectable()
export class ActivityPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly agenda: ParticipantAgendaService,
  ) {}

  async list(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    return { timeZone: event.timeZone, ...await this.pending(event.id, event.organizationId) };
  }

  async confirm(userId: string, eventId: string, enrollmentId: string) {
    const event = await this.eventFor(userId, eventId);
    await this.decide(event, enrollmentId, userId, 'confirm');
    return { timeZone: event.timeZone, ...await this.pending(event.id, event.organizationId) };
  }

  async decline(userId: string, eventId: string, enrollmentId: string) {
    const event = await this.eventFor(userId, eventId);
    await this.decide(event, enrollmentId, userId, 'decline');
    return { timeZone: event.timeZone, ...await this.pending(event.id, event.organizationId) };
  }

  private async decide(
    event: { id: string; organizationId: string },
    enrollmentId: string,
    userId: string,
    decision: 'confirm' | 'decline',
  ) {
    const scope = { eventId: event.id, organizationId: event.organizationId };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction((tx) => (
          decision === 'confirm'
            ? this.agenda.confirmRequested(tx, scope, enrollmentId, userId)
            : this.agenda.declineRequested(tx, scope, enrollmentId, userId)
        ), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível atualizar a preferência. Tente de novo.');
  }

  private async pending(eventId: string, organizationId: string) {
    const rows = await this.prisma.eventActivityEnrollment.findMany({
      where: { eventId, organizationId, status: EventActivityEnrollmentStatus.REQUESTED },
      select: {
        id: true,
        createdAt: true,
        activity: { select: { title: true, startAt: true, endAt: true, space: { select: { name: true } } } },
        reservation: { select: { registrationData: true } },
      },
      orderBy: [{ activity: { startAt: 'asc' } }, { createdAt: 'asc' }],
      take: PAGE + 1,
    });
    return {
      truncated: rows.length > PAGE,
      preferences: rows.slice(0, PAGE).map((row) => ({
        id: row.id,
        activityTitle: row.activity.title,
        startAt: row.activity.startAt.toISOString(),
        endAt: row.activity.endAt.toISOString(),
        spaceName: row.activity.space?.name ?? null,
        participantName: preferenceParticipantName(row.reservation.registrationData),
        requestedAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, timeZone: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId, timeZone: event.timeZone };
  }
}
