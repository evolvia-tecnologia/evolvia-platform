import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventActivityEnrollmentStatus, Prisma, ScientificProgramActivityStatus } from '@prisma/client';
import { ACTIVITY_ENROLLMENT_LIMIT_CODE, readEnrollmentLimit } from './activity-enrollment-limit.policy';
import { ParticipantAreaService } from './participant-area.service';
import {
  classifyAgenda,
  emailMatchesHash,
  enrollmentBlockReason,
  type AgendaSlot,
  type SpeakingSlot,
} from './participant-agenda.policy';
import { PrismaService } from './prisma.service';

const activitySelect = {
  id: true,
  title: true,
  activityType: true,
  startAt: true,
  endAt: true,
  status: true,
  space: { select: { name: true, capacity: true } },
} satisfies Prisma.ScientificProgramActivitySelect;

type Scope = { eventId: string; organizationId: string; reservationId: string };

@Injectable()
export class ParticipantAgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantAreaService,
  ) {}

  async get(slug: string, authorization?: string) {
    const scope = await this.scope(slug, authorization);
    return this.view(scope);
  }

  async enroll(slug: string, authorization: string | undefined, activityId: string) {
    const scope = await this.scope(slug, authorization);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction((tx) => this.enrollOnce(tx, scope, activityId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return this.view(scope);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível reservar a vaga. Tente de novo.');
  }

  async cancel(slug: string, authorization: string | undefined, activityId: string) {
    const scope = await this.scope(slug, authorization);
    const updated = await this.prisma.eventActivityEnrollment.updateMany({
      where: { ...scope, activityId, status: EventActivityEnrollmentStatus.ENROLLED },
      data: { status: EventActivityEnrollmentStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Esta atividade não está na sua agenda.');
    await this.prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: 'participant.activity_enrollment_cancelled',
        entityType: 'EventActivityEnrollment',
        entityId: scope.reservationId,
        metadata: { activityId },
      },
    });
    return this.view(scope);
  }

  private async scope(slug: string, authorization?: string): Promise<Scope> {
    const confirmed = await this.participants.requireConfirmedScope(slug, authorization);
    return {
      eventId: confirmed.eventId,
      organizationId: confirmed.organizationId,
      reservationId: confirmed.reservationId,
    };
  }

  private async enrollOnce(tx: Prisma.TransactionClient, scope: Scope, activityId: string) {
    const activity = await tx.scientificProgramActivity.findFirst({
      where: { id: activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: ScientificProgramActivityStatus.PUBLISHED },
      select: { ...activitySelect, _count: { select: { participants: true } } },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada neste evento.');
    const existing = await tx.eventActivityEnrollment.findUnique({
      where: { reservationId_activityId: { reservationId: scope.reservationId, activityId } },
      select: { id: true, status: true },
    });
    if (existing?.status === EventActivityEnrollmentStatus.ENROLLED) return;

    const [enrolledCount, ownEnrollments, speaking] = await Promise.all([
      tx.eventActivityEnrollment.count({
        where: { activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: EventActivityEnrollmentStatus.ENROLLED },
      }),
      tx.eventActivityEnrollment.findMany({
        where: { reservationId: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId, status: EventActivityEnrollmentStatus.ENROLLED },
        select: { activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.speakingActivities(tx, scope),
    ]);
    if (speaking.some((item) => item.id === activityId)) throw new ConflictException('Você já participa desta atividade.');
    const blocks = [
      ...ownEnrollments.map((item) => item.activity),
      ...speaking.map((item) => ({ id: item.id, startAt: new Date(item.startAt), endAt: new Date(item.endAt) })),
    ];
    const maxPerPerson = await this.enrollmentLimit(tx, scope.eventId);
    const reason = enrollmentBlockReason({
      capacity: activity.space?.capacity ?? null,
      speakers: activity._count.participants,
      enrolled: enrolledCount,
      startAt: activity.startAt,
      endAt: activity.endAt,
      blocks,
      activityId,
      maxPerPerson,
      alreadyEnrolled: ownEnrollments.length,
    });
    if (reason) throw new ConflictException(reason);

    const now = new Date();
    if (existing) {
      const revived = await tx.eventActivityEnrollment.updateMany({
        where: { id: existing.id, status: EventActivityEnrollmentStatus.CANCELLED },
        data: { status: EventActivityEnrollmentStatus.ENROLLED, enrolledAt: now, cancelledAt: null },
      });
      if (revived.count !== 1) throw new ConflictException('Não foi possível reservar a vaga. Tente de novo.');
    } else {
      await tx.eventActivityEnrollment.create({
        data: { ...scope, activityId, status: EventActivityEnrollmentStatus.ENROLLED, enrolledAt: now },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: 'participant.activity_enrolled',
        entityType: 'EventActivityEnrollment',
        entityId: scope.reservationId,
        metadata: { activityId },
      },
    });
  }

  private async view(scope: Scope) {
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
      select: { emailHash: true, event: { select: { timeZone: true } } },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    const [speaking, enrolledRows, catalog, maxPerPerson] = await Promise.all([
      this.speakingActivities(this.prisma, scope, reservation.emailHash),
      this.prisma.eventActivityEnrollment.findMany({
        where: { ...scope, status: EventActivityEnrollmentStatus.ENROLLED },
        select: { activity: { select: activitySelect } },
      }),
      this.prisma.scientificProgramActivity.findMany({
        where: {
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: ScientificProgramActivityStatus.PUBLISHED,
          space: { capacity: { gt: 0 } },
        },
        select: { ...activitySelect, _count: { select: { participants: true } } },
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
      }),
      this.enrollmentLimit(this.prisma, scope.eventId),
    ]);
    const counts = catalog.length === 0 ? [] : await this.prisma.eventActivityEnrollment.groupBy({
      by: ['activityId'],
      where: {
        eventId: scope.eventId,
        organizationId: scope.organizationId,
        status: EventActivityEnrollmentStatus.ENROLLED,
        activityId: { in: catalog.map((item) => item.id) },
      },
      _count: { _all: true },
    });
    const enrolledByActivity = new Map(counts.map((item) => [item.activityId, item._count._all]));
    const enrolled = enrolledRows
      .filter((row) => row.activity.status === ScientificProgramActivityStatus.PUBLISHED)
      .map((row) => slot(row.activity));
    const agenda = classifyAgenda({
      speaking,
      enrolled,
      catalog: catalog.map((item) => ({
        ...slot(item),
        capacity: item.space?.capacity ?? null,
        speakers: item._count.participants,
        enrolledCount: enrolledByActivity.get(item.id) ?? 0,
      })),
      maxPerPerson,
    });
    return { timeZone: reservation.event.timeZone, ...agenda };
  }

  private async speakingActivities(db: PrismaService | Prisma.TransactionClient, scope: Scope, emailHash?: string): Promise<SpeakingSlot[]> {
    const registration = await db.eventRegistrationReservation.findFirst({
      where: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
      select: { emailHash: true, registrationData: true },
    });
    const data = registration?.registrationData;
    const email = data && typeof data === 'object' && !Array.isArray(data) && typeof data.email === 'string'
      ? data.email.trim().toLowerCase() : '';
    const hash = emailHash ?? registration?.emailHash;
    if (!hash || !email || !emailMatchesHash(email, hash)) return [];
    const people = await db.scientificPerson.findMany({
      where: { eventId: scope.eventId, organizationId: scope.organizationId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    const personIds = people.filter((person) => emailMatchesHash(person.email, hash)).map((person) => person.id);
    if (personIds.length === 0) return [];
    const rows = await db.scientificProgramParticipant.findMany({
      where: { eventId: scope.eventId, organizationId: scope.organizationId, personId: { in: personIds } },
      select: {
        participationType: true,
        customRoleLabel: true,
        activity: { select: activitySelect },
      },
    });
    const seen = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      if (seen.has(row.activity.id)) return false;
      seen.add(row.activity.id);
      return true;
    });
    return uniqueRows
      .filter((row) => row.activity.status === ScientificProgramActivityStatus.PUBLISHED)
      .map((row) => ({
        ...slot(row.activity),
        participationType: row.participationType,
        customRoleLabel: row.customRoleLabel,
      }));
  }

  private async enrollmentLimit(db: PrismaService | Prisma.TransactionClient, eventId: string): Promise<number | null> {
    const row = await db.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_ENROLLMENT_LIMIT_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return null;
    return readEnrollmentLimit(row.config);
  }
}

function slot(activity: {
  id: string;
  title: string;
  activityType: string;
  startAt: Date;
  endAt: Date;
  space: { name: string } | null;
}): AgendaSlot {
  return {
    id: activity.id,
    title: activity.title,
    activityType: activity.activityType,
    startAt: activity.startAt.toISOString(),
    endAt: activity.endAt.toISOString(),
    spaceName: activity.space?.name ?? null,
  };
}
