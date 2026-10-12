import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventActivityEnrollmentStatus, EventActivityWaitlistStatus, Prisma, RegistrationReservationStatus, ScientificProgramActivityStatus } from '@prisma/client';
import { ACTIVITY_COURTESY_CODE, readCourtesyQuotas } from './activity-courtesy.policy';
import { ACTIVITY_ENROLLMENT_LIMIT_CODE, readEnrollmentRule } from './activity-enrollment-limit.policy';
import { AuthorizationService } from './authorization.service';
import {
  ACTIVITY_ALREADY_ENROLLED,
  ACTIVITY_ALREADY_SPEAKING,
  ACTIVITY_FULL_REASON,
  ACTIVITY_HAS_SEAT_REASON,
  ACTIVITY_NOT_IN_QUEUE,
  ACTIVITY_NOT_WAITING,
  ACTIVITY_WAITLIST_RETRY,
  ActivityWaitlistPolicyError,
  classifyWaitlistJoin,
  normalizeActivityWaitlistId,
  waitlistParticipantName,
} from './activity-waitlist.policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { emailMatchesHash, enrollmentBlockReason, remainingSeats } from './participant-agenda.policy';
import { ParticipantAreaService } from './participant-area.service';
import { PrismaService } from './prisma.service';

const QUEUE_LIMIT = 500;
const CATALOG_LIMIT = 200;
const NAME_LIMIT = 100;

type Scope = { eventId: string; organizationId: string; reservationId: string };
type Block = { id: string; startAt: Date; endAt: Date };
type Db = PrismaService | Prisma.TransactionClient;

const activitySelect = {
  id: true,
  title: true,
  activityType: true,
  startAt: true,
  endAt: true,
  status: true,
  space: { select: { name: true, capacity: true } },
} satisfies Prisma.ScientificProgramActivitySelect;

@Injectable()
export class ActivityWaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantAreaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async view(slug: string, authorization?: string) {
    const scope = await this.scope(slug, authorization);
    return this.participantPayload(scope);
  }

  async join(slug: string, authorization: string | undefined, activityId: string) {
    const scope = await this.scope(slug, authorization);
    const id = this.activityId(activityId);
    await this.serializable((tx) => this.joinOnce(tx, scope, id));
    return this.participantPayload(scope);
  }

  async leave(slug: string, authorization: string | undefined, activityId: string) {
    const scope = await this.scope(slug, authorization);
    const id = this.activityId(activityId);
    const updated = await this.prisma.eventActivityWaitlistEntry.updateMany({
      where: { ...scope, activityId: id, status: EventActivityWaitlistStatus.WAITING },
      data: { status: EventActivityWaitlistStatus.LEFT, leftAt: new Date() },
    });
    if (updated.count !== 1) throw new NotFoundException(ACTIVITY_NOT_WAITING);
    await this.prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: 'participant.activity_waitlist_left',
        entityType: 'EventActivityWaitlistEntry',
        entityId: scope.reservationId,
        metadata: { activityId: id, reason: 'left' },
      },
    });
    return this.participantPayload(scope);
  }

  async organizer(userId: string, eventId: string) {
    const event = await this.eventScope(userId, eventId);
    return this.organizerPayload(event);
  }

  async promote(userId: string, eventId: string, entryId: string) {
    const event = await this.eventScope(userId, eventId);
    const id = this.entryId(entryId);
    await this.serializable((tx) => this.promoteOnce(tx, event, id, userId));
    return this.organizerPayload(event);
  }

  private async scope(slug: string, authorization?: string): Promise<Scope> {
    const confirmed = await this.participants.requireConfirmedScope(slug, authorization);
    return {
      eventId: confirmed.eventId,
      organizationId: confirmed.organizationId,
      reservationId: confirmed.reservationId,
    };
  }

  private async eventScope(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, timeZone: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { eventId: event.id, organizationId: event.organizationId, timeZone: event.timeZone ?? 'America/Sao_Paulo' };
  }

  private async serializable(run: (tx: Prisma.TransactionClient) => Promise<void>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException(ACTIVITY_WAITLIST_RETRY);
  }

  private async joinOnce(tx: Prisma.TransactionClient, scope: Scope, activityId: string) {
    await this.requireConfirmedReservation(tx, scope, scope.reservationId);
    const activity = await tx.scientificProgramActivity.findFirst({
      where: {
        id: activityId,
        eventId: scope.eventId,
        organizationId: scope.organizationId,
        status: ScientificProgramActivityStatus.PUBLISHED,
      },
      select: { ...activitySelect, _count: { select: { participants: true } } },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada neste evento.');
    const enrollment = await tx.eventActivityEnrollment.findUnique({
      where: { reservationId_activityId: { reservationId: scope.reservationId, activityId } },
      select: { status: true },
    });
    if (enrollment?.status === EventActivityEnrollmentStatus.ENROLLED) throw new ConflictException(ACTIVITY_ALREADY_ENROLLED);
    const existing = await tx.eventActivityWaitlistEntry.findUnique({
      where: { reservationId_activityId: { reservationId: scope.reservationId, activityId } },
      select: { id: true, status: true },
    });
    if (existing?.status === EventActivityWaitlistStatus.WAITING) return;
    const blocks = await this.personalBlocks(tx, scope, activityId);
    if (blocks.some((block) => block.id === activityId && block.speaking)) throw new ConflictException(ACTIVITY_ALREADY_SPEAKING);
    const seat = await this.publicSeat(tx, scope, activityId);
    const reason = enrollmentBlockReason({
      capacity: activity.space?.capacity ?? null,
      speakers: activity._count.participants,
      enrolled: seat.enrolled,
      startAt: activity.startAt,
      endAt: activity.endAt,
      blocks,
      activityId,
      maxPerPerson: seat.maxPerPerson,
      alreadyEnrolled: seat.alreadyEnrolled,
      courtesyQuota: seat.courtesyQuota,
    });
    const decision = classifyWaitlistJoin(reason);
    if (decision === 'has-seat') throw new ConflictException(ACTIVITY_HAS_SEAT_REASON);
    if (decision === 'blocked') throw new ConflictException(reason ?? ACTIVITY_FULL_REASON);

    const now = new Date();
    if (existing) {
      const revived = await tx.eventActivityWaitlistEntry.updateMany({
        where: { id: existing.id, status: { in: [EventActivityWaitlistStatus.LEFT, EventActivityWaitlistStatus.PROMOTED] } },
        data: { status: EventActivityWaitlistStatus.WAITING, queuedAt: now, leftAt: null, promotedAt: null },
      });
      if (revived.count !== 1) throw new ConflictException(ACTIVITY_WAITLIST_RETRY);
    } else {
      await tx.eventActivityWaitlistEntry.create({
        data: { ...scope, activityId, status: EventActivityWaitlistStatus.WAITING, queuedAt: now },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: 'participant.activity_waitlist_joined',
        entityType: 'EventActivityWaitlistEntry',
        entityId: scope.reservationId,
        metadata: { activityId, reason: 'joined' },
      },
    });
  }

  private async promoteOnce(tx: Prisma.TransactionClient, event: { eventId: string; organizationId: string }, entryId: string, actorUserId: string) {
    const entry = await tx.eventActivityWaitlistEntry.findFirst({
      where: { id: entryId, eventId: event.eventId, organizationId: event.organizationId, status: EventActivityWaitlistStatus.WAITING },
      select: { id: true, reservationId: true, activityId: true },
    });
    if (!entry) throw new NotFoundException(ACTIVITY_NOT_IN_QUEUE);
    const scope: Scope = { eventId: event.eventId, organizationId: event.organizationId, reservationId: entry.reservationId };
    await this.requireConfirmedReservation(tx, scope, entry.reservationId);
    const activity = await tx.scientificProgramActivity.findFirst({
      where: { id: entry.activityId, eventId: scope.eventId, organizationId: scope.organizationId, status: ScientificProgramActivityStatus.PUBLISHED },
      select: { ...activitySelect, _count: { select: { participants: true } } },
    });
    if (!activity) throw new ConflictException('A atividade não está publicada.');
    const enrollment = await tx.eventActivityEnrollment.findUnique({
      where: { reservationId_activityId: { reservationId: scope.reservationId, activityId: entry.activityId } },
      select: { id: true, status: true },
    });
    if (enrollment?.status !== EventActivityEnrollmentStatus.ENROLLED) {
      const blocks = await this.personalBlocks(tx, scope, entry.activityId);
      if (blocks.some((block) => block.id === entry.activityId && block.speaking)) throw new ConflictException(ACTIVITY_ALREADY_SPEAKING);
      const seat = await this.publicSeat(tx, scope, entry.activityId);
      const reason = enrollmentBlockReason({
        capacity: activity.space?.capacity ?? null,
        speakers: activity._count.participants,
        enrolled: seat.enrolled,
        startAt: activity.startAt,
        endAt: activity.endAt,
        blocks,
        activityId: entry.activityId,
        maxPerPerson: seat.maxPerPerson,
        alreadyEnrolled: seat.alreadyEnrolled,
        courtesyQuota: seat.courtesyQuota,
      });
      if (reason) throw new ConflictException(reason);
      const now = new Date();
      if (enrollment) {
        const revived = await tx.eventActivityEnrollment.updateMany({
          where: {
            id: enrollment.id,
            status: { in: [EventActivityEnrollmentStatus.CANCELLED, EventActivityEnrollmentStatus.REQUESTED] },
          },
          data: { status: EventActivityEnrollmentStatus.ENROLLED, courtesy: false, enrolledAt: now, cancelledAt: null },
        });
        if (revived.count !== 1) throw new ConflictException(ACTIVITY_WAITLIST_RETRY);
      } else {
        await tx.eventActivityEnrollment.create({
          data: { ...scope, activityId: entry.activityId, status: EventActivityEnrollmentStatus.ENROLLED, courtesy: false, enrolledAt: now },
        });
      }
    }
    const promoted = await tx.eventActivityWaitlistEntry.updateMany({
      where: { id: entry.id, status: EventActivityWaitlistStatus.WAITING },
      data: { status: EventActivityWaitlistStatus.PROMOTED, promotedAt: new Date() },
    });
    if (promoted.count !== 1) throw new ConflictException(ACTIVITY_WAITLIST_RETRY);
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        actorUserId,
        action: 'activity.waitlist_promoted',
        entityType: 'EventActivityWaitlistEntry',
        entityId: entry.id,
        metadata: { activityId: entry.activityId, reason: 'promoted' },
      },
    });
  }

  private async personalBlocks(db: Db, scope: Scope, ignoreActivityId: string): Promise<Array<Block & { speaking?: boolean }>> {
    const [enrolled, speaking, waiting] = await Promise.all([
      db.eventActivityEnrollment.findMany({
        where: {
          reservationId: scope.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: { in: [EventActivityEnrollmentStatus.ENROLLED, EventActivityEnrollmentStatus.REQUESTED] },
        },
        select: { activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.speakingBlocks(db, scope),
      db.eventActivityWaitlistEntry.findMany({
        where: {
          reservationId: scope.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: EventActivityWaitlistStatus.WAITING,
          activityId: { not: ignoreActivityId },
        },
        select: { activity: { select: { id: true, startAt: true, endAt: true } } },
        take: 50,
      }),
    ]);
    return [
      ...enrolled.map((item) => item.activity),
      ...speaking,
      ...waiting.map((item) => item.activity),
    ];
  }

  private async speakingBlocks(db: Db, scope: Scope): Promise<Array<Block & { speaking: true }>> {
    const registration = await db.eventRegistrationReservation.findFirst({
      where: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
      select: { emailHash: true, registrationData: true },
    });
    const data = registration?.registrationData;
    const email = data && typeof data === 'object' && !Array.isArray(data) && typeof data.email === 'string'
      ? data.email.trim().toLowerCase()
      : '';
    const hash = registration?.emailHash;
    if (!hash || !email || !emailMatchesHash(email, hash)) return [];
    const people = await db.scientificPerson.findMany({
      where: { eventId: scope.eventId, organizationId: scope.organizationId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    const personIds = people.filter((person) => emailMatchesHash(person.email, hash)).map((person) => person.id);
    if (personIds.length === 0) return [];
    const rows = await db.scientificProgramParticipant.findMany({
      where: { eventId: scope.eventId, organizationId: scope.organizationId, personId: { in: personIds } },
      select: { activity: { select: { id: true, startAt: true, endAt: true, status: true } } },
    });
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (row.activity.status !== ScientificProgramActivityStatus.PUBLISHED || seen.has(row.activity.id)) return [];
      seen.add(row.activity.id);
      return [{ id: row.activity.id, startAt: row.activity.startAt, endAt: row.activity.endAt, speaking: true as const }];
    });
  }

  private async participantPayload(scope: Scope) {
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
      select: { event: { select: { timeZone: true } } },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    const [waitingRows, enrolledRows, requestedRows, speaking, rule, courtesyQuotas, catalog] = await Promise.all([
      this.prisma.eventActivityWaitlistEntry.findMany({
        where: { ...scope, status: EventActivityWaitlistStatus.WAITING },
        select: {
          id: true,
          activityId: true,
          queuedAt: true,
          activity: { select: activitySelect },
        },
        orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
        take: 50,
      }),
      this.prisma.eventActivityEnrollment.findMany({
        where: { ...scope, status: EventActivityEnrollmentStatus.ENROLLED },
        select: { activityId: true, activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.prisma.eventActivityEnrollment.findMany({
        where: { ...scope, status: EventActivityEnrollmentStatus.REQUESTED },
        select: { activityId: true, activity: { select: { id: true, startAt: true, endAt: true } } },
      }),
      this.speakingBlocks(this.prisma, scope),
      this.enrollmentRule(this.prisma, scope.eventId),
      this.courtesyQuotas(this.prisma, scope.eventId),
      this.prisma.scientificProgramActivity.findMany({
        where: {
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: ScientificProgramActivityStatus.PUBLISHED,
          space: { capacity: { gt: 0 } },
        },
        select: { ...activitySelect, _count: { select: { participants: true } } },
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
        take: CATALOG_LIMIT,
      }),
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
    const mine = new Set([
      ...enrolledRows.map((item) => item.activityId),
      ...requestedRows.map((item) => item.activityId),
      ...speaking.map((item) => item.id),
      ...waitingRows.map((item) => item.activityId),
    ]);
    const blocks = [
      ...enrolledRows.map((item) => item.activity),
      ...requestedRows.map((item) => item.activity),
      ...speaking,
      ...waitingRows.map((item) => ({ id: item.activityId, startAt: item.activity.startAt, endAt: item.activity.endAt })),
    ];
    const alreadyEnrolled = enrolledRows.length + requestedRows.length;
    const positions = await this.positions(scope, waitingRows);
    const waiting = waitingRows.map((item) => ({
      activityId: item.activityId,
      title: item.activity.title,
      startAt: item.activity.startAt.toISOString(),
      endAt: item.activity.endAt.toISOString(),
      spaceName: item.activity.space?.name ?? null,
      queuedAt: item.queuedAt.toISOString(),
      position: positions.get(item.activityId) ?? null,
    }));
    const full = catalog.filter((item) => !mine.has(item.id)).flatMap((item) => {
      const reason = enrollmentBlockReason({
        capacity: item.space?.capacity ?? null,
        speakers: item._count.participants,
        enrolled: enrolledByActivity.get(item.id) ?? 0,
        startAt: item.startAt,
        endAt: item.endAt,
        blocks,
        activityId: item.id,
        maxPerPerson: rule.max,
        alreadyEnrolled,
        courtesyQuota: courtesyQuotas.get(item.id) ?? 0,
      });
      if (classifyWaitlistJoin(reason) === 'has-seat') return [];
      return [{
        activityId: item.id,
        title: item.title,
        startAt: item.startAt.toISOString(),
        endAt: item.endAt.toISOString(),
        spaceName: item.space?.name ?? null,
        canJoin: reason === ACTIVITY_FULL_REASON,
        reason: reason === ACTIVITY_FULL_REASON ? null : reason,
      }];
    });
    return { timeZone: reservation.event.timeZone ?? 'America/Sao_Paulo', waiting, full };
  }

  private async positions(scope: Scope, waitingRows: Array<{ id: string; activityId: string; queuedAt: Date }>) {
    const place = new Map<string, number>();
    if (waitingRows.length === 0) return place;
    await Promise.all(waitingRows.map(async (row) => {
      const ahead = await this.prisma.eventActivityWaitlistEntry.count({
        where: {
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          activityId: row.activityId,
          status: EventActivityWaitlistStatus.WAITING,
          OR: [
            { queuedAt: { lt: row.queuedAt } },
            { queuedAt: row.queuedAt, id: { lt: row.id } },
          ],
        },
      });
      place.set(row.activityId, ahead + 1);
    }));
    return place;
  }

  private async organizerPayload(event: { eventId: string; organizationId: string; timeZone: string }) {
    const entries = await this.prisma.eventActivityWaitlistEntry.findMany({
      where: { eventId: event.eventId, organizationId: event.organizationId, status: EventActivityWaitlistStatus.WAITING },
      select: { id: true, activityId: true, reservationId: true, queuedAt: true },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      take: QUEUE_LIMIT,
    });
    if (entries.length === 0) return { timeZone: event.timeZone, truncated: false, activities: [] };
    const activityIds = [...new Set(entries.map((item) => item.activityId))];
    const reservationIds = [...new Set(entries.map((item) => item.reservationId))];
    const [activities, counts, reservations, courtesyQuotas, waitlistCounts] = await Promise.all([
      this.prisma.scientificProgramActivity.findMany({
        where: { id: { in: activityIds }, eventId: event.eventId, organizationId: event.organizationId },
        select: { ...activitySelect, _count: { select: { participants: true } } },
      }),
      this.prisma.eventActivityEnrollment.groupBy({
        by: ['activityId'],
        where: {
          eventId: event.eventId,
          organizationId: event.organizationId,
          status: EventActivityEnrollmentStatus.ENROLLED,
          courtesy: false,
          activityId: { in: activityIds },
        },
        _count: { _all: true },
      }),
      this.prisma.eventRegistrationReservation.findMany({
        where: { id: { in: reservationIds }, eventId: event.eventId, organizationId: event.organizationId },
        select: { id: true, registrationData: true },
      }),
      this.courtesyQuotas(this.prisma, event.eventId),
      this.prisma.eventActivityWaitlistEntry.groupBy({
        by: ['activityId'],
        where: {
          eventId: event.eventId,
          organizationId: event.organizationId,
          status: EventActivityWaitlistStatus.WAITING,
          activityId: { in: activityIds },
        },
        _count: { _all: true },
      }),
    ]);
    const enrolledByActivity = new Map(counts.map((item) => [item.activityId, item._count._all]));
    const waitingByActivity = new Map(waitlistCounts.map((item) => [item.activityId, item._count._all]));
    const names = new Map(reservations.map((item) => [item.id, waitlistParticipantName(item.registrationData)]));
    const byActivity = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byActivity.get(entry.activityId) ?? [];
      list.push(entry);
      byActivity.set(entry.activityId, list);
    }
    const payload = [...byActivity.entries()].flatMap(([activityId, queue]) => {
      const activity = activities.find((item) => item.id === activityId);
      if (!activity) return [];
      const capacity = activity.space?.capacity ?? null;
      const enrolled = enrolledByActivity.get(activityId) ?? 0;
      const courtesyQuota = courtesyQuotas.get(activityId) ?? 0;
      const remaining = capacity == null ? 0 : remainingSeats(capacity - courtesyQuota, activity._count.participants, enrolled);
      const visible = queue.slice(0, NAME_LIMIT);
      const totalWaiting = waitingByActivity.get(activityId) ?? queue.length;
      return [{
        activityId,
        title: activity.title,
        startAt: activity.startAt.toISOString(),
        endAt: activity.endAt.toISOString(),
        spaceName: activity.space?.name ?? null,
        published: activity.status === ScientificProgramActivityStatus.PUBLISHED,
        remaining,
        hiddenCount: Math.max(0, totalWaiting - visible.length),
        people: visible.map((entry, index) => ({
          id: entry.id,
          participantName: names.get(entry.reservationId) ?? 'Inscrição sem nome',
          queuedAt: entry.queuedAt.toISOString(),
          position: index + 1,
        })),
      }];
    });
    payload.sort((left, right) => left.startAt.localeCompare(right.startAt) || left.title.localeCompare(right.title));
    return { timeZone: event.timeZone, truncated: entries.length === QUEUE_LIMIT, activities: payload };
  }

  private async publicSeat(db: Db, scope: Scope, activityId: string) {
    const held = [EventActivityEnrollmentStatus.ENROLLED, EventActivityEnrollmentStatus.REQUESTED];
    const [enrolled, courtesyQuota, rule, alreadyEnrolled] = await Promise.all([
      db.eventActivityEnrollment.count({
        where: {
          activityId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: EventActivityEnrollmentStatus.ENROLLED,
          courtesy: false,
        },
      }),
      this.courtesyQuota(db, scope.eventId, activityId),
      this.enrollmentRule(db, scope.eventId),
      db.eventActivityEnrollment.count({
        where: {
          reservationId: scope.reservationId,
          eventId: scope.eventId,
          organizationId: scope.organizationId,
          status: { in: held },
          activityId: { not: activityId },
        },
      }),
    ]);
    return { enrolled, courtesyQuota, maxPerPerson: rule.max, alreadyEnrolled };
  }

  private async courtesyQuotas(db: Db, eventId: string) {
    const row = await db.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_COURTESY_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return new Map<string, number>();
    return new Map(readCourtesyQuotas(row.config).map((item) => [item.activityId, item.count]));
  }

  private async courtesyQuota(db: Db, eventId: string, activityId: string) {
    const quotas = await this.courtesyQuotas(db, eventId);
    return quotas.get(activityId) ?? 0;
  }

  private async enrollmentRule(db: Db, eventId: string) {
    const row = await db.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: ACTIVITY_ENROLLMENT_LIMIT_CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return { max: null, confirmByOrganization: false };
    return readEnrollmentRule(row.config);
  }

  private async requireConfirmedReservation(db: Db, scope: { eventId: string; organizationId: string }, reservationId: string) {
    const reservation = await db.eventRegistrationReservation.findFirst({
      where: {
        id: reservationId,
        eventId: scope.eventId,
        organizationId: scope.organizationId,
        status: RegistrationReservationStatus.CONFIRMED,
      },
      select: { id: true, status: true },
    });
    if (reservation?.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new ConflictException('A inscrição não está confirmada.');
    }
  }

  private activityId(value: string) {
    return this.parseId(value, 'atividade');
  }

  private entryId(value: string) {
    return this.parseId(value, 'fila');
  }

  private parseId(value: string, label: 'atividade' | 'fila') {
    try {
      return normalizeActivityWaitlistId(value, label);
    } catch (error) {
      throw new BadRequestException(error instanceof ActivityWaitlistPolicyError ? error.message : 'Identificador inválido.');
    }
  }
}
