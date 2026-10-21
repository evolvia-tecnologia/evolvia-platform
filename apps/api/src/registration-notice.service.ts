import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, RegistrationReservationStatus, ScientificSubmissionStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { eventCalendarDay, presenceDay } from './desk-presence.policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  REGISTRATION_NOTICE_LIMIT,
  RegistrationNoticeInput,
  RegistrationNoticePolicyError,
  noticeMessage,
  normalizeDirectNotice,
  normalizeIdempotencyKey,
  normalizeNotice,
  readDeliveryConfig,
  readRegistrationEmail,
} from './registration-notice.policy';

const ACTION = 'registration.notice_dispatched';
const DIRECT_ACTION = 'registration.notice_directed';

type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

export type DirectNoticeResult = {
  delivered: number;
  failed: number;
  skipped: number;
};

export type NoticeResult = {
  delivered: number;
  failed: number;
  skipped: number;
  remaining: number;
  continuationCursor: string | null;
};

async function postDelivery(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
  try {
    return response.status;
  } finally {
    await response.body?.cancel().catch(() => undefined);
  }
}

function storedDirect(metadata: unknown): DirectNoticeResult | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  const numbers = [row.delivered, row.failed, row.skipped];
  if (!numbers.every((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1)) return null;
  return { delivered: row.delivered as number, failed: row.failed as number, skipped: row.skipped as number };
}

function storedResult(metadata: unknown): NoticeResult | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  const numbers = [row.delivered, row.failed, row.skipped, row.remaining];
  if (!numbers.every((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000)) return null;
  if (row.continuationCursor !== null && typeof row.continuationCursor !== 'string') return null;
  return {
    delivered: row.delivered as number,
    failed: row.failed as number,
    skipped: row.skipped as number,
    remaining: row.remaining as number,
    continuationCursor: row.continuationCursor as string | null,
  };
}

@Injectable()
export class RegistrationNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const categories = await this.prisma.eventRegistrationCategory.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: REGISTRATION_NOTICE_LIMIT,
    });
    return {
      configured: readDeliveryConfig(process.env) !== null,
      limit: REGISTRATION_NOTICE_LIMIT,
      categories,
    };
  }

  async send(userId: string, eventId: string, input: unknown, rawKey: unknown, poster: Poster = postDelivery): Promise<NoticeResult> {
    const event = await this.eventFor(userId, eventId);
    let notice: ReturnType<typeof normalizeNotice>;
    let idempotencyKey: string;
    try {
      notice = normalizeNotice(input);
      idempotencyKey = normalizeIdempotencyKey(rawKey);
    } catch (error) {
      if (error instanceof RegistrationNoticePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const prior = await this.prisma.auditLog.findFirst({
      where: {
        organizationId: event.organizationId,
        eventId: event.id,
        action: ACTION,
        entityId: keyHash,
      },
      select: { metadata: true },
    });
    if (prior) {
      const stored = storedResult(prior.metadata);
      if (!stored) throw new ConflictException('Este aviso já foi registrado.');
      return stored;
    }
    if (notice.categoryId) {
      const category = await this.prisma.eventRegistrationCategory.findFirst({
        where: { id: notice.categoryId, eventId: event.id, organizationId: event.organizationId, active: true },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Categoria não encontrada.');
    }
    const day = notice.presence ? this.presenceDayOf(event.timeZone) : null;
    const audience = this.audienceWhere(event, notice, day);
    if (notice.continuationCursor) {
      const anchor = notice.presence === 'PRESENT'
        ? await this.prisma.eventDayPresence.findFirst({
          where: this.presentWhere(event, notice, day!, notice.continuationCursor, true),
          select: { reservationId: true },
        })
        : await this.prisma.eventRegistrationReservation.findFirst({
          where: { ...audience, id: notice.continuationCursor },
          select: { id: true },
        });
      if (!anchor) throw new BadRequestException('A continuação não pertence aos confirmados deste filtro.');
    }
    const config = readDeliveryConfig(process.env);
    if (!config) throw new BadRequestException('O envio de avisos ainda não está configurado.');

    const listed = notice.presence === 'PRESENT'
      ? await this.presentIds(event, notice, day!)
      : await this.confirmedIds(audience, notice.continuationCursor);
    const ids = listed.ids.slice(0, REGISTRATION_NOTICE_LIMIT);
    const lastId = ids.at(-1) ?? notice.continuationCursor;
    const remaining = listed.ids.length > REGISTRATION_NOTICE_LIMIT && lastId
      ? await this.remainingAfter(event, notice, audience, day, lastId)
      : 0;
    const page = await this.loadRegistrations(event, ids);
    const contentHash = createHash('sha256').update(`${notice.subject}\n${notice.body}`).digest('hex');
    const outcomes = await Promise.all(page.map(async (row) => {
      const recipient = readRegistrationEmail(row.registrationData);
      if (!recipient) return 'skipped' as const;
      const body = JSON.stringify(noticeMessage({
        subject: notice.subject,
        body: notice.body,
        sender: config.sender,
        recipient,
        eventName: event.name,
      }));
      try {
        const status = await poster(config.endpoint, body, {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': createHash('sha256').update(`registration-notice:${row.id}:${contentHash}`).digest('hex'),
        });
        return status >= 200 && status < 300 ? 'delivered' as const : 'failed' as const;
      } catch {
        return 'failed' as const;
      }
    }));
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    for (const outcome of outcomes) {
      if (outcome === 'delivered') delivered += 1;
      else if (outcome === 'failed') failed += 1;
      else skipped += 1;
    }
    const result: NoticeResult = {
      delivered,
      failed,
      skipped,
      remaining,
      continuationCursor: remaining > 0 ? lastId ?? null : null,
    };
    await this.record(event, keyHash, result, notice);
    return result;
  }

  async sendDirect(userId: string, eventId: string, input: unknown, rawKey: unknown, poster: Poster = postDelivery): Promise<DirectNoticeResult> {
    const event = await this.eventFor(userId, eventId);
    let notice: ReturnType<typeof normalizeDirectNotice>;
    let idempotencyKey: string;
    try {
      notice = normalizeDirectNotice(input);
      idempotencyKey = normalizeIdempotencyKey(rawKey);
    } catch (error) {
      if (error instanceof RegistrationNoticePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const prior = await this.prisma.auditLog.findFirst({
      where: {
        organizationId: event.organizationId,
        eventId: event.id,
        action: DIRECT_ACTION,
        entityId: keyHash,
      },
      select: { metadata: true },
    });
    if (prior) {
      const stored = storedDirect(prior.metadata);
      if (!stored) throw new ConflictException('Este recado já foi registrado.');
      return stored;
    }
    const row = await this.prisma.eventRegistrationReservation.findFirst({
      where: {
        protocol: notice.protocol,
        eventId: event.id,
        organizationId: event.organizationId,
        status: RegistrationReservationStatus.CONFIRMED,
      },
      select: { id: true, registrationData: true },
    });
    if (!row) throw new NotFoundException('Inscrição confirmada não encontrada neste evento.');
    const config = readDeliveryConfig(process.env);
    if (!config) throw new BadRequestException('O envio de avisos ainda não está configurado.');
    const recipient = readRegistrationEmail(row.registrationData);
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    if (!recipient) skipped = 1;
    else {
      const contentHash = createHash('sha256').update(`${notice.subject}\n${notice.body}`).digest('hex');
      const body = JSON.stringify(noticeMessage({
        subject: notice.subject,
        body: notice.body,
        sender: config.sender,
        recipient,
        eventName: event.name,
      }));
      try {
        const status = await poster(config.endpoint, body, {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': createHash('sha256').update(`registration-notice:${row.id}:${contentHash}`).digest('hex'),
        });
        if (status >= 200 && status < 300) delivered = 1;
        else failed = 1;
      } catch {
        failed = 1;
      }
    }
    const result: DirectNoticeResult = { delivered, failed, skipped };
    await this.recordDirected(event, keyHash, result);
    return result;
  }

  private presenceDayOf(timeZone: string | null): Date {
    const zone = timeZone?.trim() ?? '';
    if (!zone) throw new BadRequestException('Defina o fuso horário do evento antes de filtrar a presença do dia.');
    try {
      return presenceDay(eventCalendarDay(zone));
    } catch {
      throw new BadRequestException('O fuso horário do evento não permite filtrar a presença do dia.');
    }
  }

  private audienceWhere(
    event: { id: string; organizationId: string },
    notice: RegistrationNoticeInput,
    day: Date | null,
  ): Prisma.EventRegistrationReservationWhereInput {
    return {
      eventId: event.id,
      organizationId: event.organizationId,
      status: RegistrationReservationStatus.CONFIRMED,
      ...(notice.categoryId ? { categoryId: notice.categoryId } : {}),
      ...(notice.presence === 'ABSENT' && day ? {
        dayPresences: {
          none: { day, reversedAt: null, eventId: event.id, organizationId: event.organizationId },
        },
      } : {}),
      ...(notice.scientificResult ? {
        authorSubmissions: {
          some: {
            eventId: event.id,
            organizationId: event.organizationId,
            status: notice.scientificResult as ScientificSubmissionStatus,
          },
        },
      } : {}),
    };
  }

  private presentWhere(
    event: { id: string; organizationId: string },
    notice: RegistrationNoticeInput,
    day: Date,
    cursor: string | null,
    exact: boolean,
  ): Prisma.EventDayPresenceWhereInput {
    return {
      eventId: event.id,
      organizationId: event.organizationId,
      day,
      reversedAt: null,
      ...(cursor ? { reservationId: exact ? cursor : { gt: cursor } } : {}),
      reservation: {
        status: RegistrationReservationStatus.CONFIRMED,
        ...(notice.categoryId ? { categoryId: notice.categoryId } : {}),
        ...(notice.scientificResult ? {
          authorSubmissions: {
            some: {
              eventId: event.id,
              organizationId: event.organizationId,
              status: notice.scientificResult as ScientificSubmissionStatus,
            },
          },
        } : {}),
      },
    };
  }

  private async confirmedIds(
    audience: Prisma.EventRegistrationReservationWhereInput,
    cursor: string | null,
  ) {
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { ...audience, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: REGISTRATION_NOTICE_LIMIT + 1,
      select: { id: true },
    });
    return { ids: rows.map((row) => row.id) };
  }

  private async presentIds(
    event: { id: string; organizationId: string },
    notice: RegistrationNoticeInput,
    day: Date,
  ) {
    const rows = await this.prisma.eventDayPresence.findMany({
      where: this.presentWhere(event, notice, day, notice.continuationCursor, false),
      orderBy: { reservationId: 'asc' },
      take: REGISTRATION_NOTICE_LIMIT + 1,
      select: { reservationId: true },
    });
    return { ids: rows.map((row) => row.reservationId) };
  }

  private async remainingAfter(
    event: { id: string; organizationId: string },
    notice: RegistrationNoticeInput,
    audience: Prisma.EventRegistrationReservationWhereInput,
    day: Date | null,
    lastId: string,
  ) {
    if (notice.presence === 'PRESENT') {
      return this.prisma.eventDayPresence.count({
        where: this.presentWhere(event, notice, day!, lastId, false),
      });
    }
    return this.prisma.eventRegistrationReservation.count({
      where: { ...audience, id: { gt: lastId } },
    });
  }

  private async loadRegistrations(
    event: { id: string; organizationId: string },
    ids: string[],
  ) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: {
        id: { in: ids },
        eventId: event.id,
        organizationId: event.organizationId,
        status: RegistrationReservationStatus.CONFIRMED,
      },
      select: { id: true, registrationData: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  private async recordDirected(
    event: { id: string; organizationId: string },
    keyHash: string,
    result: DirectNoticeResult,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        action: DIRECT_ACTION,
        entityType: 'Event',
        entityId: keyHash,
        metadata: {
          delivered: result.delivered,
          failed: result.failed,
          skipped: result.skipped,
          reason: 'attempted',
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async record(
    event: { id: string; organizationId: string },
    keyHash: string,
    result: NoticeResult,
    notice: RegistrationNoticeInput,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        action: ACTION,
        entityType: 'Event',
        entityId: keyHash,
        metadata: {
          delivered: result.delivered,
          failed: result.failed,
          skipped: result.skipped,
          remaining: result.remaining,
          continuationCursor: result.continuationCursor,
          presence: notice.presence,
          scientificResult: notice.scientificResult,
          reason: 'attempted',
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true, timeZone: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId, name: event.name, timeZone: event.timeZone };
  }
}
