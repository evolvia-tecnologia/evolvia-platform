import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EventPublicationMediaStorage } from './event-publication/event-publication-media.storage';
import { PrismaService } from './prisma.service';
import { certificatePdf, CertificateTextUnsupportedError, CERTIFICATE_BATCH_MAX, type CertificatePdfPage } from './presence-certificate-pdf';
import {
  PresenceCertificatePolicyError,
  DEFAULT_CERTIFICATE_BODY,
  DEFAULT_CERTIFICATE_TITLE,
  canIssuePresenceCertificate,
  certificateDisplayName,
  certificateFeeCents,
  normalizeCertificateArtRemoval,
  normalizeCertificateArtUpload,
  normalizeCertificateCode,
  normalizeCertificateSetting,
  normalizeCertificateBatch,
  publicCertificateView,
} from './presence-certificate.policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const UNAVAILABLE = 'O certificado só é emitido para inscrição confirmada com presença registrada, quando a organização libera.';
const STALE = 'A liberação do certificado foi alterada. Recarregue antes de salvar.';
const ART_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ART_KEY = /^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-f0-9-]+\.(png|jpg|webp)$/u;
const ARCHIVE_KEY = /^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-f0-9]{64}\.(png|jpg|webp)$/u;

type IssueInput = {
  eventId: string;
  organizationId: string;
  reservationId: string;
  status: string;
  checkedIn: boolean;
  registrationData: unknown;
};

type OfferInput = {
  eventId: string;
  organizationId: string;
  reservationId: string;
  status: string;
  checkedIn: boolean;
};

type EventScope = { id: string; organizationId: string };

@Injectable()
export class PresenceCertificateService {
  private readonly artArchivesInFlight = new Map<string, Promise<string>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly storage: EventPublicationMediaStorage,
  ) {}

  async publicView(rawCode: string) {
    const code = this.codeOrReject(rawCode);
    const row = await this.prisma.eventCertificate.findUnique({
      where: { code },
      select: {
        snapshotVersion: true, snapshotEventName: true, snapshotTitle: true, snapshotBody: true, snapshotBackBody: true,
        snapshotArtKey: true, snapshotArtMime: true, snapshotArtAlt: true,
        code: true,
        displayName: true,
        hours: true,
        issuedAt: true,
        event: { select: { name: true, certificateSetting: { select: { title: true, body: true, backBody: true, artAltText: true, artMimeType: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    const setting = row.event.certificateSetting;
    const historical = row.snapshotVersion === 1;
    const hasArt = historical ? !!row.snapshotArtKey && ART_TYPES.has(row.snapshotArtMime ?? '') : ART_TYPES.has(setting?.artMimeType ?? '');
    return { ...publicCertificateView({
      eventName: row.snapshotEventName ?? row.event.name,
      displayName: row.displayName,
      hours: row.hours,
      issuedAt: row.issuedAt.toISOString(),
      code: row.code,
      title: row.snapshotTitle ?? setting?.title ?? DEFAULT_CERTIFICATE_TITLE,
      body: row.snapshotBody ?? setting?.body ?? DEFAULT_CERTIFICATE_BODY,
      back: row.snapshotVersion === 1 ? row.snapshotBackBody ?? null : null,
      artAlt: hasArt ? (historical ? row.snapshotArtAlt : setting?.artAltText) ?? null : null,
      hasArt,
    }), originalSnapshot: historical };
  }

  async publicArt(rawCode: string) {
    const code = this.codeOrReject(rawCode);
    const certificate = await this.prisma.eventCertificate.findUnique({
      where: { code },
      select: { eventId: true, organizationId: true, snapshotVersion: true, snapshotArtKey: true, snapshotArtMime: true },
    });
    if (!certificate) throw new NotFoundException('Certificado não encontrado.');
    if (certificate.snapshotVersion === 1) {
      const key = certificate.snapshotArtKey;
      if (!key || !ARCHIVE_KEY.test(key) || !key.startsWith(`${certificate.organizationId}/${certificate.eventId}/`) || !ART_TYPES.has(certificate.snapshotArtMime ?? '')) {
        throw new NotFoundException('A emissão original não possui arte.');
      }
      return { bytes: await this.storage.read(key), mimeType: certificate.snapshotArtMime! };
    }
    return this.artBytes(certificate.eventId, certificate.organizationId);
  }

  async publicPdf(rawCode: string) {
    const view = await this.publicView(rawCode);
    return {
      bytes: this.renderPdf([{
        title: view.title,
        body: view.body,
        back: view.back,
        displayName: view.displayName,
        eventName: view.eventName,
        hours: view.hours,
        issuedAt: view.issuedAt,
        code: this.codeOrReject(rawCode),
      }], 'A página deste certificado mostra o texto completo e pode ser impressa.'),
      feeCents: certificateFeeCents(),
    };
  }

  async offer(input: OfferInput) {
    const setting = await this.prisma.eventCertificateSetting.findFirst({
      where: { eventId: input.eventId, organizationId: input.organizationId },
      select: { enabled: true },
    });
    const eligible = canIssuePresenceCertificate({
      enabled: setting?.enabled === true,
      status: input.status,
      checkedIn: input.checkedIn,
    });
    if (!eligible) return { eligible: false as const, code: null, hours: null, issuedAt: null, feeCents: certificateFeeCents() };
    const existing = await this.prisma.eventCertificate.findFirst({
      where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
      select: { code: true, hours: true, issuedAt: true },
    });
    return {
      eligible: true as const,
      code: existing?.code ?? null,
      hours: existing?.hours ?? null,
      issuedAt: existing?.issuedAt.toISOString() ?? null,
      feeCents: certificateFeeCents(),
    };
  }

  async issue(input: IssueInput) {
    let displayName: string;
    try { displayName = certificateDisplayName(input.registrationData); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const setting = await tx.eventCertificateSetting.findFirst({
          where: { eventId: input.eventId, organizationId: input.organizationId },
          select: { enabled: true, hours: true, title: true, body: true, backBody: true, artStorageKey: true,
            artMimeType: true, artAltText: true, event: { select: { name: true } } },
        });
        if (!setting || !canIssuePresenceCertificate({ enabled: setting.enabled, status: input.status, checkedIn: input.checkedIn })) {
          throw new ForbiddenException(UNAVAILABLE);
        }
        const existing = await tx.eventCertificate.findFirst({
          where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
          select: { code: true, hours: true, issuedAt: true },
        });
        if (existing) return this.participantCopy(existing);
        const archivedArtKey = await this.archiveArt(input, setting);
        const created = await tx.eventCertificate.create({
          data: {
            organizationId: input.organizationId,
            eventId: input.eventId,
            reservationId: input.reservationId,
            code: randomBytes(16).toString('hex'),
            displayName,
            hours: setting.hours,
            snapshotVersion: 1,
            snapshotEventName: setting.event.name,
            snapshotTitle: setting.title,
            snapshotBody: setting.body,
            snapshotBackBody: setting.backBody,
            snapshotArtKey: archivedArtKey,
            snapshotArtMime: setting.artMimeType,
            snapshotArtAlt: setting.artAltText,
          },
          select: { id: true, code: true, hours: true, issuedAt: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            eventId: input.eventId,
            action: 'certificate.issued',
            entityType: 'EventCertificate',
            entityId: created.id,
            metadata: { role: 'participation', hours: created.hours, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
        return this.participantCopy(created);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.eventCertificate.findFirst({
          where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
          select: { code: true, hours: true, issuedAt: true },
        });
        if (existing) return this.participantCopy(existing);
      }
      throw error;
    }
  }

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    const [setting, issuedCount] = await Promise.all([
      this.prisma.eventCertificateSetting.findFirst({
        where: { eventId: event.id, organizationId: event.organizationId },
        select: { enabled: true, hours: true, title: true, body: true, backBody: true, artMimeType: true, artByteSize: true, artAltText: true, revision: true },
      }),
      this.prisma.eventCertificate.count({ where: { eventId: event.id, organizationId: event.organizationId } }),
    ]);
    const hasArt = ART_TYPES.has(setting?.artMimeType ?? '');
    return {
      enabled: setting?.enabled ?? false,
      hours: setting?.hours ?? null,
      title: setting?.title ?? DEFAULT_CERTIFICATE_TITLE,
      body: setting?.body ?? DEFAULT_CERTIFICATE_BODY,
      back: setting?.backBody ?? null,
      art: hasArt ? { mimeType: setting?.artMimeType, byteSize: setting?.artByteSize ?? null, altText: setting?.artAltText ?? null } : null,
      revision: setting?.revision ?? 0,
      feeCents: certificateFeeCents(),
      role: 'participation' as const,
      issuedCount,
    };
  }

  async listBatches(userId: string, eventId: string, beforeId?: unknown) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    const scope = { eventId: event.id, organizationId: event.organizationId, issuedCount: { gt: 0 } };
    let cursor: { id: string; createdAt: Date } | null = null;
    if (beforeId !== undefined) {
      if (typeof beforeId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(beforeId)) throw new BadRequestException('Cursor de pacote inválido.');
      cursor = await this.prisma.eventCertificateBatch.findFirst({ where: { ...scope, id: beforeId }, select: { id: true, createdAt: true } });
      if (!cursor) throw new NotFoundException('Pacote não encontrado.');
    }
    const rows = await this.prisma.eventCertificateBatch.findMany({
      where: { ...scope, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
      select: { id: true, issuedCount: true, hours: true, createdAt: true },
    });
    return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async batchPdf(userId: string, eventId: string, batchId?: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    if (batchId && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(batchId)) throw new BadRequestException('Pacote inválido.');
    const where = { eventId: event.id, organizationId: event.organizationId, ...(batchId ? { batchId } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.eventCertificate.count({ where }),
      this.prisma.eventCertificate.findMany({
        where,
        select: {
          snapshotVersion: true, snapshotEventName: true, snapshotTitle: true, snapshotBody: true, snapshotBackBody: true,
          code: true,
          displayName: true,
          hours: true,
          issuedAt: true,
          event: { select: { name: true, certificateSetting: { select: { title: true, body: true } } } },
        },
        orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
        take: CERTIFICATE_BATCH_MAX,
      }),
    ]);
    if (!rows.length) throw new NotFoundException('Ainda não há certificados emitidos neste evento.');
    const note = total > rows.length
      ? `Este lote mostra ${rows.length} de ${total}. As demais segundas vias continuam na consulta pelo código.`
      : null;
    const bytes = this.renderPdf(rows.map((row, index) => {
      const setting = row.event.certificateSetting;
      const view = publicCertificateView({
        eventName: row.snapshotEventName ?? row.event.name,
        displayName: row.displayName,
        hours: row.hours,
        issuedAt: row.issuedAt.toISOString(),
        code: row.code,
        title: row.snapshotTitle ?? setting?.title ?? DEFAULT_CERTIFICATE_TITLE,
        body: row.snapshotBody ?? setting?.body ?? DEFAULT_CERTIFICATE_BODY,
      back: row.snapshotVersion === 1 ? row.snapshotBackBody ?? null : null,
        artAlt: null,
        hasArt: false,
      });
      return {
        title: view.title,
        body: view.body,
        back: view.back,
        displayName: view.displayName,
        eventName: view.eventName,
        hours: view.hours,
        issuedAt: view.issuedAt,
        code: row.code,
        note: index === rows.length - 1 ? note : null,
      };
    }), 'Baixe essas segundas vias pela página de cada certificado, que mostra o texto completo.');
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: userId,
        action: 'certificate.batch_downloaded',
        entityType: 'Event',
        entityId: event.id,
        metadata: { count: rows.length, total, ...(batchId ? { batchId } : {}), feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
      },
    });
    return { bytes, feeCents: certificateFeeCents(), count: rows.length, total };
  }

  async issueBatch(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const command = this.policyOrReject(input, normalizeCertificateBatch);
    const requestHash = createHash('sha256').update(JSON.stringify({ afterId: command.afterId, revision: command.expectedRevision })).digest('hex');
    const scope = { eventId: event.id, organizationId: event.organizationId };
    const toResult = async (tx: Prisma.TransactionClient, batch: { id: string; issuedCount: number; scannedCount: number; skippedCount: number; nextAfterId: string | null; hours: number | null; requestHash: string }) => {
      if (batch.requestHash !== requestHash) throw new ConflictException('Este pedido de lote já foi usado com outra seleção.');
      return { batchId: batch.id, issuedCount: batch.issuedCount, scannedCount: batch.scannedCount, skippedCount: batch.skippedCount, nextAfterId: batch.nextAfterId, pending: batch.nextAfterId !== null, hours: batch.hours, feeCents: certificateFeeCents(), totalIssued: await tx.eventCertificate.count({ where: scope }) };
    };
    try {
      return await this.prisma.$transaction(async tx => {
        // Serializes batch commands across instances. A retry returns its persisted result.
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} AND "organizationId" = ${event.organizationId} FOR UPDATE`;
        const previous = await tx.eventCertificateBatch.findFirst({ where: { id: command.requestId, ...scope } });
        if (previous) return toResult(tx, previous);
        const setting = await tx.eventCertificateSetting.findFirst({ where: scope, select: { enabled: true, hours: true, revision: true, title: true, body: true, backBody: true, artStorageKey: true, artMimeType: true, artAltText: true, event: { select: { name: true } } } });
        if (!setting?.enabled) throw new ForbiddenException('Libere o certificado de participação antes de emitir o lote.');
        if (setting.revision !== command.expectedRevision) throw new ConflictException(STALE);
        if (command.afterId && !await tx.eventRegistrationReservation.findFirst({ where: { id: command.afterId, ...scope }, select: { id: true } })) throw new BadRequestException('Continuação não pertence a este evento.');
        const rows = await tx.eventRegistrationReservation.findMany({ where: { ...scope, status: 'CONFIRMED', certificate: { is: null }, checkIn: { is: { reversedAt: null } }, ...(command.afterId ? { id: { gt: command.afterId } } : {}) }, orderBy: { id: 'asc' }, take: 401, select: { id: true, registrationData: true } });
        let scannedCount = 0, skippedCount = 0;
        const ready: { id: string; displayName: string }[] = [];
        for (const row of rows.slice(0, 400)) {
          scannedCount++;
          try { ready.push({ id: row.id, displayName: certificateDisplayName(row.registrationData) }); }
          catch (error) { if (!(error instanceof PresenceCertificatePolicyError)) throw error; skippedCount++; }
          if (ready.length === CERTIFICATE_BATCH_MAX) break;
        }
        // Advance past invalid names too, so an invalid first window cannot starve later entries.
        const nextAfterId = rows.length > scannedCount ? rows[scannedCount - 1]!.id : null;
        if (ready.length) {
          // Cancellation and presence reversal serialize against these locks; recheck eligibility after waiting.
          const ids = ready.map(row => row.id);
          await tx.$queryRaw`SELECT r."id" FROM "EventRegistrationReservation" r JOIN "EventRegistrationCheckIn" c ON c."reservationId" = r."id" AND c."eventId" = r."eventId" AND c."organizationId" = r."organizationId" WHERE r."eventId" = ${event.id} AND r."organizationId" = ${event.organizationId} AND r."id" IN (${Prisma.join(ids)}) ORDER BY r."id" FOR UPDATE OF r, c`;
          const fresh = await tx.eventRegistrationReservation.findMany({ where: { ...scope, id: { in: ids }, status: 'CONFIRMED', certificate: { is: null }, checkIn: { is: { reversedAt: null } } }, select: { id: true, registrationData: true } });
          ready.splice(0, ready.length);
          for (const row of fresh) {
            try { ready.push({ id: row.id, displayName: certificateDisplayName(row.registrationData) }); }
            catch (error) { if (!(error instanceof PresenceCertificatePolicyError)) throw error; }
          }
          skippedCount = scannedCount - ready.length;
        }
        const archivedArtKey = ready.length ? await this.archiveArt(scope, setting) : null;
        const batch = await tx.eventCertificateBatch.create({ data: { id: command.requestId, ...scope, requestHash, issuedCount: ready.length, scannedCount, skippedCount, nextAfterId, hours: setting.hours, createdByUserId: userId } });
        if (ready.length) {
          await tx.eventCertificate.createMany({ data: ready.map(row => ({ ...scope, reservationId: row.id, batchId: batch.id, code: randomBytes(16).toString('hex'), displayName: row.displayName, hours: setting.hours, snapshotVersion: 1, snapshotEventName: setting.event.name, snapshotTitle: setting.title, snapshotBody: setting.body, snapshotBackBody: setting.backBody, snapshotArtKey: archivedArtKey, snapshotArtMime: setting.artMimeType, snapshotArtAlt: setting.artAltText })) });
          await tx.auditLog.create({ data: { ...scope, actorUserId: userId, action: 'certificate.batch_issued', entityType: 'EventCertificateBatch', entityId: batch.id, metadata: { role: 'participation', issuedCount: ready.length, scannedCount, skippedCount, hours: setting.hours, feeCents: certificateFeeCents() } } });
        }
        return toResult(tx, batch);
      }, { timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Houve uma emissão simultânea. Tente novamente com o mesmo pedido; nenhum lote parcial foi gravado.');
      throw error;
    }
  }

  private renderPdf(pages: CertificatePdfPage[], fallback: string) {
    try {
      return certificatePdf(pages);
    } catch (error) {
      if (error instanceof CertificateTextUnsupportedError) {
        throw new UnprocessableEntityException(`O PDF ainda não desenha estes caracteres: ${error.characters.join(' ')}. Nada foi trocado no certificado. ${fallback}`);
      }
      throw error;
    }
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const setting = this.policyOrReject(input, normalizeCertificateSetting);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventCertificateSetting.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId },
          select: { revision: true },
        });
        if ((current?.revision ?? 0) !== setting.expectedRevision) throw new ConflictException(STALE);
        const saved = current
          ? await (async () => {
              const advanced = await tx.eventCertificateSetting.updateMany({
                where: { eventId: event.id, organizationId: event.organizationId, revision: setting.expectedRevision },
                data: { enabled: setting.enabled, hours: setting.hours, title: setting.title, body: setting.body, backBody: setting.back, revision: { increment: 1 } },
              });
              if (advanced.count !== 1) throw new ConflictException(STALE);
              return tx.eventCertificateSetting.findFirstOrThrow({
                where: { eventId: event.id, organizationId: event.organizationId },
                select: { revision: true },
              });
            })()
          : await tx.eventCertificateSetting.create({
              data: {
                eventId: event.id,
                organizationId: event.organizationId,
                enabled: setting.enabled,
                hours: setting.hours,
                title: setting.title,
                body: setting.body,
                backBody: setting.back,
              },
              select: { revision: true },
            });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'certificate.setting_saved',
            entityType: 'EventCertificateSetting',
            entityId: event.id,
            metadata: { enabled: setting.enabled, hours: setting.hours, revision: saved.revision, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(STALE);
      throw error;
    }
    return this.get(userId, eventId);
  }

  async saveArt(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const art = this.policyOrReject(input, normalizeCertificateArtUpload);
    const storageKey = `${event.organizationId}/${event.id}/${randomUUID()}.${art.extension}`;
    await this.storage.write(storageKey, art.bytes);
    let previousKey: string | null = null;
    try {
      previousKey = await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventCertificateSetting.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId },
          select: { revision: true, artStorageKey: true },
        });
        if ((current?.revision ?? 0) !== art.expectedRevision) throw new ConflictException(STALE);
        if (current) {
          const advanced = await tx.eventCertificateSetting.updateMany({
            where: { eventId: event.id, organizationId: event.organizationId, revision: art.expectedRevision },
            data: {
              artStorageKey: storageKey,
              artMimeType: art.mimeType,
              artByteSize: art.bytes.length,
              artAltText: art.altText,
              revision: { increment: 1 },
            },
          });
          if (advanced.count !== 1) throw new ConflictException(STALE);
        } else {
          await tx.eventCertificateSetting.create({
            data: {
              eventId: event.id,
              organizationId: event.organizationId,
              artStorageKey: storageKey,
              artMimeType: art.mimeType,
              artByteSize: art.bytes.length,
              artAltText: art.altText,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'certificate.art_saved',
            entityType: 'EventCertificateSetting',
            entityId: event.id,
            metadata: { mimeType: art.mimeType, byteSize: art.bytes.length, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
        return current?.artStorageKey ?? null;
      });
    } catch (error) {
      await this.storage.rollbackNewWrite(storageKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(STALE);
      throw error;
    }
    if (previousKey && previousKey !== storageKey) {
      try { await this.storage.rollbackNewWrite(previousKey); } catch { /* a arte anterior já não está no disco */ }
    }
    return this.get(userId, eventId);
  }

  async removeArt(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const removal = this.policyOrReject(input, normalizeCertificateArtRemoval);
    let previousKey: string | null = null;
    try {
      previousKey = await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventCertificateSetting.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId },
          select: { revision: true, artStorageKey: true },
        });
        if ((current?.revision ?? 0) !== removal.expectedRevision) throw new ConflictException(STALE);
        if (!current?.artStorageKey) return null;
        const advanced = await tx.eventCertificateSetting.updateMany({
          where: { eventId: event.id, organizationId: event.organizationId, revision: removal.expectedRevision },
          data: { artStorageKey: null, artMimeType: null, artByteSize: null, artAltText: null, revision: { increment: 1 } },
        });
        if (advanced.count !== 1) throw new ConflictException(STALE);
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'certificate.art_removed',
            entityType: 'EventCertificateSetting',
            entityId: event.id,
            metadata: { feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
        return current.artStorageKey;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(STALE);
      throw error;
    }
    if (previousKey) {
      try { await this.storage.rollbackNewWrite(previousKey); } catch { /* a arte anterior já não está no disco */ }
    }
    return this.get(userId, eventId);
  }

  async readArt(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    return this.artBytes(event.id, event.organizationId);
  }

  private async artBytes(eventId: string, organizationId: string) {
    const setting = await this.prisma.eventCertificateSetting.findFirst({
      where: { eventId, organizationId },
      select: { artStorageKey: true, artMimeType: true },
    });
    if (!setting?.artStorageKey || !setting.artMimeType || !ART_TYPES.has(setting.artMimeType)) {
      throw new NotFoundException('A arte do certificado não foi publicada.');
    }
    try {
      return { bytes: await this.storage.read(setting.artStorageKey), mimeType: setting.artMimeType };
    } catch {
      throw new NotFoundException('A arte do certificado não foi publicada.');
    }
  }

  private async archiveArt(scope: { organizationId: string; eventId: string }, setting: { artStorageKey: string | null; artMimeType: string | null }) {
    if (!setting.artStorageKey) return null;
    const prefix = `${scope.organizationId}/${scope.eventId}/`;
    const extension = setting.artMimeType === 'image/png' ? 'png' : setting.artMimeType === 'image/jpeg' ? 'jpg' : setting.artMimeType === 'image/webp' ? 'webp' : null;
    if (!ART_KEY.test(setting.artStorageKey) || !setting.artStorageKey.startsWith(prefix) || !extension) {
      throw new ConflictException('A arte do certificado precisa ser revisada antes da emissão.');
    }
    // Coalesce concurrent work only. Never reuse a stale success after completion
    // or share keys across tenants. Bound bookkeeping during bursts.
    const operationKey = `${setting.artStorageKey}:${setting.artMimeType}`;
    const pending = this.artArchivesInFlight.get(operationKey);
    if (pending) return pending;
    const task = this.archiveArtOnce(prefix, setting.artStorageKey, extension);
    if (this.artArchivesInFlight.size >= 64) return task;
    this.artArchivesInFlight.set(operationKey, task);
    try { return await task; }
    finally { this.artArchivesInFlight.delete(operationKey); }
  }

  private async archiveArtOnce(prefix: string, sourceKey: string, extension: string) {
    const bytes = await this.storage.read(sourceKey);
    // One archive per content/event, not per participant. Current template keys
    // use UUIDs; this separate hash key survives replacement and old-app rollback.
    const key = `${prefix}${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    try {
      const existing = await this.storage.read(key);
      if (!existing.equals(bytes)) throw new ConflictException('A arte arquivada precisa ser verificada antes da emissão.');
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      try { await this.storage.write(key, bytes); }
      catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        // EEXIST concerns the temporary file, not necessarily the final archive.
        // Proceed only if another worker has published the complete matching bytes.
        try {
          const existing = await this.storage.read(key);
          if (!existing.equals(bytes)) throw new ConflictException('A arte arquivada precisa ser verificada antes da emissão.');
        } catch (readError) {
          if (!(readError instanceof NotFoundException)) throw readError;
          throw new ConflictException('Outra emissão está arquivando a arte. Tente novamente.');
        }
      }
    }
    // A shared archive must survive DB rollback; orphan cleanup needs retention
    // rules and cannot remove objects that another transaction may reference.
    return key;
  }

  private participantCopy(row: { code: string; hours: number | null; issuedAt: Date }) {
    return { code: row.code, hours: row.hours, issuedAt: row.issuedAt.toISOString(), feeCents: certificateFeeCents() };
  }

  private codeOrReject(rawCode: string): string {
    try { return normalizeCertificateCode(rawCode); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private policyOrReject<T>(input: unknown, normalize: (value: unknown) => T): T {
    try { return normalize(input); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async eventFor(userId: string, eventId: string, roles: readonly MembershipRole[]): Promise<EventScope> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, roles);
    return { id: event.id, organizationId: event.organizationId };
  }
}

