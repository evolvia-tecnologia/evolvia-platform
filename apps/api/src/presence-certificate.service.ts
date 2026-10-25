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
        snapshotVersion: true, snapshotEventName: true, snapshotTitle: true, snapshotBody: true,
        snapshotArtKey: true, snapshotArtMime: true, snapshotArtAlt: true,
        code: true,
        displayName: true,
        hours: true,
        issuedAt: true,
        event: { select: { name: true, certificateSetting: { select: { title: true, body: true, artAltText: true, artMimeType: true } } } },
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
          select: { enabled: true, hours: true, title: true, body: true, artStorageKey: true,
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
        select: { enabled: true, hours: true, title: true, body: true, artMimeType: true, artByteSize: true, artAltText: true, revision: true },
      }),
      this.prisma.eventCertificate.count({ where: { eventId: event.id, organizationId: event.organizationId } }),
    ]);
    const hasArt = ART_TYPES.has(setting?.artMimeType ?? '');
    return {
      enabled: setting?.enabled ?? false,
      hours: setting?.hours ?? null,
      title: setting?.title ?? DEFAULT_CERTIFICATE_TITLE,
      body: setting?.body ?? DEFAULT_CERTIFICATE_BODY,
      art: hasArt ? { mimeType: setting?.artMimeType, byteSize: setting?.artByteSize ?? null, altText: setting?.artAltText ?? null } : null,
      revision: setting?.revision ?? 0,
      feeCents: certificateFeeCents(),
      role: 'participation' as const,
      issuedCount,
    };
  }

  async batchPdf(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    const where = { eventId: event.id, organizationId: event.organizationId };
    const [total, rows] = await Promise.all([
      this.prisma.eventCertificate.count({ where }),
      this.prisma.eventCertificate.findMany({
        where,
        select: {
          snapshotVersion: true, snapshotEventName: true, snapshotTitle: true, snapshotBody: true,
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
        artAlt: null,
        hasArt: false,
      });
      return {
        title: view.title,
        body: view.body,
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
        metadata: { count: rows.length, total, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
      },
    });
    return { bytes, feeCents: certificateFeeCents(), count: rows.length, total };
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
                data: { enabled: setting.enabled, hours: setting.hours, title: setting.title, body: setting.body, revision: { increment: 1 } },
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

