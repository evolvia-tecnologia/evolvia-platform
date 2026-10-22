import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventActivityEnrollmentStatus, Prisma, RegistrationReservationStatus, ScientificProgramActivityStatus } from '@prisma/client';
import { ACTIVITY_COURTESY_CODE, readCourtesyQuotas } from './activity-courtesy.policy';
import { ACTIVITY_ENROLLMENT_LIMIT_CODE, readEnrollmentRule, type ActivityEnrollmentLimit } from './activity-enrollment-limit.policy';
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')) {
          if (attempt < 2) continue;
          throw new ConflictException('Não foi possível reservar a vaga. Tente de novo.');
        }
        throw error;
      }
    }
    throw new ConflictException('Não foi possível reservar a vaga. Tente de novo.');
  }

  async cancel(slug: string, authorization: string | undefined, activityId: string) {
    const scope = await this.scope(slug, authorization);
    const current = await this.prisma.eventActivityEnrollment.findFirst({
      where: {
        ...scope,
        activityId,
        status: { in: [EventActivityEnrollmentStatus.ENROLLED, EventActivityEnrollmentStatus.REQUESTED] },
      },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Esta atividade não está na sua agenda.');
    const updated = await this.prisma.eventActivityEnrollment.updateMany({
      where: { id: current.id, status: current.status },
      data: { status: EventActivityEnrollmentStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException('Esta atividade não está na sua agenda.');
    await this.prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: current.status === EventActivityEnrollmentStatus.REQUESTED
          ? 'participant.activity_preference_withdrawn'
          : 'participant.activity_enrollment_cancelled',
        entityType: 'EventActivityEnrollment',
        entityId: scope.reservationId,
        metadata: { activityId },
      },
    });
    return this.view(scope);
  }

  async confirmRequested(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string },
    enrollmentId: string,
    actorUserId: string,
    courtesy = false,
  ) {
    const row = await this.requestedRow(tx, scope, enrollmentId);
    await this.requireConfirmedReservation(tx, scope, row.reservationId);
    const activity = await tx.scientificProgramActivity.findFirst({
      where: { id: row.activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: ScientificProgramActivityStatus.PUBLISHED },
      select: { ...activitySelect, _count: { select: { participants: true } } },
    });
    if (!activity) throw new ConflictException('Esta atividade não está publicada.');
    const personScope = { ...scope, reservationId: row.reservationId };
    const [enrolledCount, courtesyUsed, ownConfirmed, speaking, courtesyQuota, rule, heldByPerson] = await Promise.all([
      tx.eventActivityEnrollment.count({
        where: { activityId: row.activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: EventActivityEnrollmentStatus.ENROLLED, courtesy: false },
      }),
      tx.eventActivityEnrollment.count({
        where: { activityId: row.activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: EventActivityEnrollmentStatus.ENROLLED, courtesy: true },
      }),
      tx.eventActivityEnrollment.findMany({
        where: {
          reservationId: row.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: EventActivityEnrollmentStatus.ENROLLED,
          activityId: { not: row.activityId },
          activity: { status: ScientificProgramActivityStatus.PUBLISHED },
        },
        select: { activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.speakingActivities(tx, personScope),
      this.courtesyQuota(tx, scope.eventId, row.activityId),
      this.enrollmentRule(tx, scope.eventId),
      tx.eventActivityEnrollment.count({
        where: {
          reservationId: row.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: { in: [EventActivityEnrollmentStatus.ENROLLED, EventActivityEnrollmentStatus.REQUESTED] },
          activityId: { not: row.activityId },
          activity: { status: ScientificProgramActivityStatus.PUBLISHED },
        },
      }),
    ]);
    if (courtesy && courtesyUsed >= courtesyQuota) throw new ConflictException('Não há cortesia restante nesta atividade.');
    const blocks = [
      ...ownConfirmed.map((item) => item.activity),
      ...speaking.map((item) => ({ id: item.id, startAt: new Date(item.startAt), endAt: new Date(item.endAt) })),
    ];
    const reason = enrollmentBlockReason({
      capacity: activity.space?.capacity ?? null,
      speakers: activity._count.participants,
      enrolled: enrolledCount,
      startAt: activity.startAt,
      endAt: activity.endAt,
      blocks,
      activityId: row.activityId,
      courtesyQuota: courtesy ? 0 : courtesyQuota,
      maxPerPerson: rule.max,
      alreadyEnrolled: heldByPerson,
    });
    if (!courtesy && reason) throw new ConflictException(reason);
    if (courtesy && reason && reason !== 'Não há vaga restante nesta atividade.') throw new ConflictException(reason);
    const confirmed = await tx.eventActivityEnrollment.updateMany({
      where: { id: row.id, status: EventActivityEnrollmentStatus.REQUESTED },
      data: { status: EventActivityEnrollmentStatus.ENROLLED, courtesy, enrolledAt: new Date(), cancelledAt: null },
    });
    if (confirmed.count !== 1) throw new ConflictException('Não foi possível confirmar a preferência. Tente de novo.');
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        actorUserId,
        action: 'activity.preference_confirmed',
        entityType: 'EventActivityEnrollment',
        entityId: row.id,
        metadata: { activityId: row.activityId, courtesy, reason: 'confirmed' },
      },
    });
  }

  async declineRequested(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string },
    enrollmentId: string,
    actorUserId: string,
  ) {
    const row = await this.requestedRow(tx, scope, enrollmentId);
    const declined = await tx.eventActivityEnrollment.updateMany({
      where: { id: row.id, status: EventActivityEnrollmentStatus.REQUESTED },
      data: { status: EventActivityEnrollmentStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (declined.count !== 1) throw new ConflictException('Não foi possível recusar a preferência. Tente de novo.');
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        actorUserId,
        action: 'activity.preference_declined',
        entityType: 'EventActivityEnrollment',
        entityId: row.id,
        metadata: { activityId: row.activityId, reason: 'declined' },
      },
    });
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
    await this.requireConfirmedReservation(tx, scope, scope.reservationId);
    const activity = await tx.scientificProgramActivity.findFirst({
      where: { id: activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: ScientificProgramActivityStatus.PUBLISHED },
      select: { ...activitySelect, _count: { select: { participants: true } } },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada neste evento.');
    const existing = await tx.eventActivityEnrollment.findUnique({
      where: { reservationId_activityId: { reservationId: scope.reservationId, activityId } },
      select: { id: true, status: true },
    });
    if (existing?.status === EventActivityEnrollmentStatus.ENROLLED || existing?.status === EventActivityEnrollmentStatus.REQUESTED) return;

    const held = [EventActivityEnrollmentStatus.ENROLLED, EventActivityEnrollmentStatus.REQUESTED];
    const [enrolledCount, ownEnrollments, speaking, rule, courtesyQuota] = await Promise.all([
      tx.eventActivityEnrollment.count({
        where: { activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: EventActivityEnrollmentStatus.ENROLLED, courtesy: false },
      }),
      tx.eventActivityEnrollment.findMany({
        where: {
          reservationId: scope.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: { in: held },
          activity: { status: ScientificProgramActivityStatus.PUBLISHED },
        },
        select: { activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.speakingActivities(tx, scope),
      this.enrollmentRule(tx, scope.eventId),
      this.courtesyQuota(tx, scope.eventId, activityId),
    ]);
    if (speaking.some((item) => item.id === activityId)) throw new ConflictException('Você já participa desta atividade.');
    const blocks = [
      ...ownEnrollments.map((item) => item.activity),
      ...speaking.map((item) => ({ id: item.id, startAt: new Date(item.startAt), endAt: new Date(item.endAt) })),
    ];
    const reason = enrollmentBlockReason({
      capacity: activity.space?.capacity ?? null,
      speakers: activity._count.participants,
      enrolled: enrolledCount,
      startAt: activity.startAt,
      endAt: activity.endAt,
      blocks,
      activityId,
      maxPerPerson: rule.max,
      alreadyEnrolled: ownEnrollments.length,
      courtesyQuota,
    });
    if (reason) throw new ConflictException(reason);

    const now = new Date();
    const nextStatus = rule.confirmByOrganization ? EventActivityEnrollmentStatus.REQUESTED : EventActivityEnrollmentStatus.ENROLLED;
    if (existing) {
      const revived = await tx.eventActivityEnrollment.updateMany({
        where: { id: existing.id, status: EventActivityEnrollmentStatus.CANCELLED },
        data: { status: nextStatus, courtesy: false, enrolledAt: now, cancelledAt: null },
      });
      if (revived.count !== 1) throw new ConflictException('Não foi possível reservar a vaga. Tente de novo.');
    } else {
      await tx.eventActivityEnrollment.create({
        data: { ...scope, activityId, status: nextStatus, courtesy: false, enrolledAt: now },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: rule.confirmByOrganization ? 'participant.activity_preference_recorded' : 'participant.activity_enrolled',
        entityType: 'EventActivityEnrollment',
        entityId: scope.reservationId,
        metadata: { activityId },
      },
    });
  }

  private async view(scope: Scope) {
    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { emailHash: true, registrationData: true, event: { select: { timeZone: true } } },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    const [speaking, enrolledRows, requestedRows, catalog, rule, courtesyQuotas] = await Promise.all([
      this.speakingActivities(this.prisma, scope, reservation.emailHash, reservation.registrationData),
      this.prisma.eventActivityEnrollment.findMany({
        where: { ...scope, status: EventActivityEnrollmentStatus.ENROLLED },
        select: { activity: { select: activitySelect } },
      }),
      this.prisma.eventActivityEnrollment.findMany({
        where: { ...scope, status: EventActivityEnrollmentStatus.REQUESTED },
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
      this.enrollmentRule(this.prisma, scope.eventId),
      this.courtesyQuotas(this.prisma, scope.eventId),
    ]);
    const counts = catalog.length === 0 ? [] : await this.prisma.eventActivityEnrollment.groupBy({
      by: ['activityId'],
      where: {
        eventId: scope.eventId,
        organizationId: scope.organizationId,
        status: EventActivityEnrollmentStatus.ENROLLED,
        courtesy: false,
        activityId: { in: catalog.map((item) => item.id) },
      },
      _count: { _all: true },
    });
    const enrolledByActivity = new Map(counts.map((item) => [item.activityId, item._count._all]));
    const published = (row: { activity: { status: ScientificProgramActivityStatus } }) => row.activity.status === ScientificProgramActivityStatus.PUBLISHED;
    const enrolled = enrolledRows.filter(published).map((row) => slot(row.activity));
    const requested = requestedRows.filter(published).map((row) => slot(row.activity));
    const agenda = classifyAgenda({
      speaking,
      enrolled,
      requested,
      catalog: catalog.map((item) => ({
        ...slot(item),
        capacity: item.space?.capacity ?? null,
        speakers: item._count.participants,
        enrolledCount: enrolledByActivity.get(item.id) ?? 0,
        courtesyQuota: courtesyQuotas.get(item.id) ?? 0,
      })),
      maxPerPerson: rule.max,
    });
    return { timeZone: reservation.event.timeZone, confirmationRequired: rule.confirmByOrganization, ...agenda };
  }

  private async speakingActivities(db: PrismaService | Prisma.TransactionClient, scope: Scope, emailHash?: string | null, registrationData?: unknown): Promise<SpeakingSlot[]> {
    let hash = emailHash;
    let data = registrationData;
    if (registrationData === undefined) {
      const registration = await db.eventRegistrationReservation.findUnique({
        where: { id_eventId_organizationId: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
        select: { emailHash: true, registrationData: true },
      });
      hash = emailHash ?? registration?.emailHash;
      data = registration?.registrationData;
    }
    const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    const rawEmail = record && typeof record.email === 'string' ? record.email : '';
    const email = rawEmail.trim().toLowerCase();
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

  private async courtesyQuotas(db: PrismaService | Prisma.TransactionClient, eventId: string) {
    const row = await db.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_COURTESY_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return new Map<string, number>();
    return new Map(readCourtesyQuotas(row.config).map((item) => [item.activityId, item.count]));
  }

  private async courtesyQuota(db: PrismaService | Prisma.TransactionClient, eventId: string, activityId: string) {
    const quotas = await this.courtesyQuotas(db, eventId);
    return quotas.get(activityId) ?? 0;
  }

  private async enrollmentRule(db: PrismaService | Prisma.TransactionClient, eventId: string): Promise<ActivityEnrollmentLimit> {
    const row = await db.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_ENROLLMENT_LIMIT_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return { max: null, confirmByOrganization: false };
    return readEnrollmentRule(row.config);
  }

  private async requireConfirmedReservation(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string },
    reservationId: string,
  ) {
    const reservation = await tx.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: reservationId, eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { id: true, status: true },
    });
    if (reservation?.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new ConflictException('A inscrição não está confirmada.');
    }
  }

  private async requestedRow(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string },
    enrollmentId: string,
  ) {
    const row = await tx.eventActivityEnrollment.findUnique({
      where: { id_eventId_organizationId: { id: enrollmentId, eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { id: true, reservationId: true, activityId: true, status: true },
    });
    if (!row || row.status !== EventActivityEnrollmentStatus.REQUESTED) throw new NotFoundException('Preferência não encontrada.');
    return row;
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

