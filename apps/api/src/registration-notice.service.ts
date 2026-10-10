import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  REGISTRATION_NOTICE_LIMIT,
  RegistrationNoticePolicyError,
  noticeMessage,
  normalizeIdempotencyKey,
  normalizeNotice,
  readDeliveryConfig,
  readRegistrationEmail,
} from './registration-notice.policy';

const ACTION = 'registration.notice_dispatched';

type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

export type NoticeResult = {
  delivered: number;
  failed: number;
  skipped: number;
  remaining: number;
  continuationCursor: string | null;
};

async function postDelivery(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
  return response.status;
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
    const audience = {
      eventId: event.id,
      organizationId: event.organizationId,
      status: RegistrationReservationStatus.CONFIRMED,
      ...(notice.categoryId ? { categoryId: notice.categoryId } : {}),
    };
    if (notice.continuationCursor) {
      const anchor = await this.prisma.eventRegistrationReservation.findFirst({
        where: { ...audience, id: notice.continuationCursor },
        select: { id: true },
      });
      if (!anchor) throw new BadRequestException('A continuação não pertence aos confirmados deste evento.');
    }
    const config = readDeliveryConfig(process.env);
    if (!config) throw new BadRequestException('O envio de avisos ainda não está configurado.');

    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { ...audience, ...(notice.continuationCursor ? { id: { gt: notice.continuationCursor } } : {}) },
      orderBy: { id: 'asc' },
      take: REGISTRATION_NOTICE_LIMIT + 1,
      select: { id: true, registrationData: true },
    });
    const page = rows.slice(0, REGISTRATION_NOTICE_LIMIT);
    const lastId = page.at(-1)?.id ?? notice.continuationCursor;
    const remaining = rows.length > REGISTRATION_NOTICE_LIMIT && lastId
      ? await this.prisma.eventRegistrationReservation.count({ where: { ...audience, id: { gt: lastId } } })
      : 0;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    const contentHash = createHash('sha256').update(`${notice.subject}\n${notice.body}`).digest('hex');
    for (const row of page) {
      const recipient = readRegistrationEmail(row.registrationData);
      if (!recipient) {
        skipped += 1;
        continue;
      }
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
        if (status >= 200 && status < 300) delivered += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    const result: NoticeResult = {
      delivered,
      failed,
      skipped,
      remaining,
      continuationCursor: remaining > 0 ? lastId ?? null : null,
    };
    await this.record(event, keyHash, result);
    return result;
  }

  private async record(
    event: { id: string; organizationId: string },
    keyHash: string,
    result: NoticeResult,
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
          reason: 'attempted',
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId, name: event.name };
  }
}
