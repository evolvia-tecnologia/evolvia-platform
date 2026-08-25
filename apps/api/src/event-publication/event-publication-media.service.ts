import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthorizationService } from '../authorization.service';
import { EVENT_EDITOR_ROLES } from '../membership-policy';
import { PrismaService } from '../prisma.service';
import { RemoveEventPublicationMediaDto, UploadEventPublicationMediaDto } from './event-publication.dto';
import { EventPublicationMediaStorage } from './event-publication-media.storage';
import { EventMediaUsageValue, validateEventMedia } from './event-publication-media.policy';
import { canMutateEventPublication } from './event-publication.policy';
import { EventPublicationRepository, EventPublicationRow } from './event-publication.repository';

type MediaRow = {
  id: string;
  organizationId: string;
  eventId: string;
  usage: EventMediaUsageValue;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  altText: string | null;
  decorative: boolean;
  state: 'ACTIVE' | 'REPLACED' | 'REMOVED';
  updatedAt: Date;
};

export type MediaDescriptor = {
  usage: EventMediaUsageValue;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  altText: string | null;
  decorative: boolean;
  updatedAt: Date;
  url?: string;
};

const MEDIA_COLUMNS = Prisma.sql`
  "id", "organizationId", "eventId", "usage", "storageKey", "mimeType",
  "byteSize", "width", "height", "altText", "decorative", "state", "updatedAt"
`;

@Injectable()
export class EventPublicationMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly publicationRepository: EventPublicationRepository,
    private readonly storage: EventPublicationMediaStorage,
  ) {}

  async listCurrent(organizationId: string, eventId: string, publication: EventPublicationRow | null): Promise<MediaDescriptor[]> {
    const ids = this.linkedIds(publication);
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<MediaRow[]>(Prisma.sql`
      SELECT ${MEDIA_COLUMNS}
      FROM "EventMediaAsset"
      WHERE "organizationId" = ${organizationId} AND "eventId" = ${eventId}
        AND "id" IN (${Prisma.join(ids)}) AND "state" = 'ACTIVE'::"EventMediaAssetState"
      ORDER BY "usage" ASC
    `);
    return rows.map((row) => this.descriptor(row));
  }

  async listAdmin(userId: string, eventId: string): Promise<MediaDescriptor[]> {
    const event = await this.requireEvent(eventId);
    await this.authorization.requireMembership(userId, event.organizationId);
    const publication = await this.publicationRepository.findByScope(this.prisma, event.organizationId, event.id);
    return this.listCurrent(event.organizationId, event.id, publication);
  }

  async previewDescriptors(organizationId: string, eventId: string, publication: EventPublicationRow | null): Promise<Array<MediaDescriptor & { url: string }>> {
    const media = await this.listCurrent(organizationId, eventId, publication);
    return media.map((item) => ({ ...item, url: `/api/events/${encodeURIComponent(eventId)}/publication/media/${item.usage}` }));
  }

  async upload(userId: string, eventId: string, dto: UploadEventPublicationMediaDto) {
    const scope = await this.requireEditableScope(userId, eventId);
    const validated = validateEventMedia(dto);
    const assetId = randomUUID();
    const storageKey = `${scope.organizationId}/${scope.id}/${assetId}.${validated.extension}`;
    await this.storage.write(storageKey, validated.bytes);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await this.publicationRepository.lockEventScope(tx, scope.organizationId, scope.id);
        if (!event) throw new NotFoundException('Evento não encontrado.');
        this.requireEditable(scope.role, event.status);

        let publication = await this.publicationRepository.findByScope(tx, scope.organizationId, scope.id);
        if (!publication && dto.publicationRevision !== 0) throw this.stale();
        if (publication && publication.revision !== dto.publicationRevision) throw this.stale();
        if (!publication) {
          publication = await this.publicationRepository.create(tx, scope.organizationId, scope.id, {
            shortDescription: null,
            fullDescription: null,
            publicContactEmail: null,
            publicContactPhone: null,
            seoTitle: null,
            seoDescription: null,
            accessibilitySummary: null,
            themeConfig: null,
          });
        }

        const previousId = this.linkedId(publication, dto.usage);
        await tx.eventMediaAsset.create({
          data: {
            id: assetId,
            organizationId: scope.organizationId,
            eventId: scope.id,
            usage: dto.usage,
            storageKey,
            mimeType: validated.mimeType,
            byteSize: validated.bytes.length,
            width: validated.width,
            height: validated.height,
            checksumSha256: validated.checksumSha256,
            altText: validated.altText,
            decorative: validated.decorative,
            createdByUserId: userId,
          },
        });

        const updated = await this.linkAsset(tx, publication, dto.usage, assetId);
        if (!updated) throw this.stale();
        if (previousId) {
          await tx.eventMediaAsset.updateMany({
            where: { id: previousId, eventId: scope.id, organizationId: scope.organizationId, state: 'ACTIVE' },
            data: { state: 'REPLACED', replacedAt: new Date() },
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            actorUserId: userId,
            eventId: scope.id,
            action: previousId ? 'event.publication.media_replaced' : 'event.publication.media_added',
            entityType: 'EventMediaAsset',
            entityId: assetId,
            metadata: {
              usage: dto.usage,
              mimeType: validated.mimeType,
              byteSize: validated.bytes.length,
              width: validated.width,
              height: validated.height,
              decorative: validated.decorative,
              publicationRevision: updated.revision,
            },
          },
        });

        return { publicationRevision: updated.revision, media: this.descriptor({
          id: assetId,
          organizationId: scope.organizationId,
          eventId: scope.id,
          usage: dto.usage,
          storageKey,
          mimeType: validated.mimeType,
          byteSize: validated.bytes.length,
          width: validated.width,
          height: validated.height,
          altText: validated.altText,
          decorative: validated.decorative,
          state: 'ACTIVE',
          updatedAt: new Date(),
        }) };
      });
    } catch (error) {
      await this.storage.rollbackNewWrite(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async remove(userId: string, eventId: string, usage: EventMediaUsageValue, dto: RemoveEventPublicationMediaDto) {
    const scope = await this.requireEditableScope(userId, eventId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.publicationRepository.lockEventScope(tx, scope.organizationId, scope.id);
      if (!event) throw new NotFoundException('Evento não encontrado.');
      this.requireEditable(scope.role, event.status);
      const publication = await this.publicationRepository.findByScope(tx, scope.organizationId, scope.id);
      if (!publication || publication.revision !== dto.publicationRevision) throw this.stale();
      const currentId = this.linkedId(publication, usage);
      if (!currentId) return { publicationRevision: publication.revision, removed: false };

      const updated = await this.linkAsset(tx, publication, usage, null);
      if (!updated) throw this.stale();
      await tx.eventMediaAsset.updateMany({
        where: { id: currentId, eventId: scope.id, organizationId: scope.organizationId, state: 'ACTIVE' },
        data: { state: 'REMOVED', removedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          actorUserId: userId,
          eventId: scope.id,
          action: 'event.publication.media_removed',
          entityType: 'EventMediaAsset',
          entityId: currentId,
          metadata: { usage, publicationRevision: updated.revision },
        },
      });
      return { publicationRevision: updated.revision, removed: true };
    });
  }

  async readAdmin(userId: string, eventId: string, usage: EventMediaUsageValue) {
    const event = await this.requireEvent(eventId);
    await this.authorization.requireMembership(userId, event.organizationId);
    const row = await this.findLinkedByScope(event.organizationId, event.id, usage);
    if (!row) throw new NotFoundException('Mídia não encontrada.');
    return { row, bytes: await this.storage.read(row.storageKey), cacheControl: 'private, no-store' };
  }

  async readPublic(slug: string, usage: EventMediaUsageValue) {
    const rows = await this.prisma.$queryRaw<MediaRow[]>(Prisma.sql`
      SELECT m.${Prisma.raw('"id"')}, m.${Prisma.raw('"organizationId"')}, m.${Prisma.raw('"eventId"')},
        m.${Prisma.raw('"usage"')}, m.${Prisma.raw('"storageKey"')}, m.${Prisma.raw('"mimeType"')},
        m.${Prisma.raw('"byteSize"')}, m.${Prisma.raw('"width"')}, m.${Prisma.raw('"height"')},
        m.${Prisma.raw('"altText"')}, m.${Prisma.raw('"decorative"')}, m.${Prisma.raw('"state"')}, m.${Prisma.raw('"updatedAt"')}
      FROM "Event" e
      JOIN "EventPublication" p ON p."eventId" = e."id" AND p."organizationId" = e."organizationId"
      JOIN "EventMediaAsset" m ON m."id" = CASE
        WHEN ${usage} = 'LOGO' THEN p."logoAssetId"
        WHEN ${usage} = 'COVER' THEN p."coverAssetId"
        ELSE p."socialImageAssetId" END
        AND m."eventId" = e."id" AND m."organizationId" = e."organizationId"
      WHERE e."slug" = ${slug.trim().toLowerCase()} AND e."status" = 'PUBLISHED'::"EventStatus"
        AND m."usage" = ${usage}::"EventMediaUsage" AND m."state" = 'ACTIVE'::"EventMediaAssetState"
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Mídia não encontrada.');
    return { row, bytes: await this.storage.read(row.storageKey), cacheControl: 'public, max-age=3600, stale-while-revalidate=86400' };
  }

  async publicDescriptors(eventId: string, organizationId: string, slug: string, publication: EventPublicationRow | null): Promise<Array<MediaDescriptor & { url: string }>> {
    const media = await this.listCurrent(organizationId, eventId, publication);
    return media.map((item) => ({ ...item, url: `/api/public/events/${encodeURIComponent(slug)}/media/${item.usage}` }));
  }

  private async requireEditableScope(userId: string, eventId: string) {
    const event = await this.requireEvent(eventId);
    const membership = await this.authorization.requireMembership(userId, event.organizationId);
    if (!EVENT_EDITOR_ROLES.includes(membership.role)) throw new NotFoundException('Evento não encontrado.');
    this.requireEditable(membership.role, event.status);
    return { ...event, role: membership.role };
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, status: true } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    return { ...event, organizationId: event.organizationId };
  }

  private requireEditable(role: MembershipRole, status: EventStatus): void {
    if (!canMutateEventPublication({ role, eventStatus: status, mutation: 'UPDATE_EDITORIAL' })) {
      throw new ConflictException('A mídia da Divulgação está congelada neste estado do evento.');
    }
  }

  private stale(): ConflictException {
    return new ConflictException('A Divulgação foi alterada em outra sessão. Recarregue antes de enviar a mídia.');
  }

  private linkedIds(publication: EventPublicationRow | null): string[] {
    return publication ? [publication.logoAssetId, publication.coverAssetId, publication.socialImageAssetId].filter((id): id is string => Boolean(id)) : [];
  }

  private linkedId(publication: EventPublicationRow, usage: EventMediaUsageValue): string | null {
    if (usage === 'LOGO') return publication.logoAssetId;
    if (usage === 'COVER') return publication.coverAssetId;
    return publication.socialImageAssetId;
  }

  private async linkAsset(tx: Prisma.TransactionClient, publication: EventPublicationRow, usage: EventMediaUsageValue, assetId: string | null) {
    const assignment = usage === 'LOGO'
      ? Prisma.sql`"logoAssetId" = ${assetId}`
      : usage === 'COVER'
        ? Prisma.sql`"coverAssetId" = ${assetId}`
        : Prisma.sql`"socialImageAssetId" = ${assetId}`;
    const rows = await tx.$queryRaw<EventPublicationRow[]>(Prisma.sql`
      UPDATE "EventPublication" SET ${assignment}, "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${publication.id} AND "organizationId" = ${publication.organizationId}
        AND "eventId" = ${publication.eventId} AND "revision" = ${publication.revision}
      RETURNING *
    `);
    return rows[0] ?? null;
  }

  private async findLinkedByScope(organizationId: string, eventId: string, usage: EventMediaUsageValue): Promise<MediaRow | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>(Prisma.sql`
      SELECT m.${Prisma.raw('"id"')}, m.${Prisma.raw('"organizationId"')}, m.${Prisma.raw('"eventId"')},
        m.${Prisma.raw('"usage"')}, m.${Prisma.raw('"storageKey"')}, m.${Prisma.raw('"mimeType"')},
        m.${Prisma.raw('"byteSize"')}, m.${Prisma.raw('"width"')}, m.${Prisma.raw('"height"')},
        m.${Prisma.raw('"altText"')}, m.${Prisma.raw('"decorative"')}, m.${Prisma.raw('"state"')}, m.${Prisma.raw('"updatedAt"')}
      FROM "EventPublication" p
      JOIN "EventMediaAsset" m ON m."id" = CASE
        WHEN ${usage} = 'LOGO' THEN p."logoAssetId"
        WHEN ${usage} = 'COVER' THEN p."coverAssetId"
        ELSE p."socialImageAssetId" END
        AND m."eventId" = p."eventId" AND m."organizationId" = p."organizationId"
      WHERE p."organizationId" = ${organizationId} AND p."eventId" = ${eventId}
        AND m."usage" = ${usage}::"EventMediaUsage" AND m."state" = 'ACTIVE'::"EventMediaAssetState"
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private descriptor(row: MediaRow): MediaDescriptor {
    return {
      usage: row.usage,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
      altText: row.altText,
      decorative: row.decorative,
      updatedAt: row.updatedAt,
    };
  }
}
