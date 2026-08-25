import { Injectable } from '@nestjs/common';
import { EventFormat, EventStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';

export type EventPublicationLockedEvent = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: EventStatus;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  timeZone: string | null;
  venue: string | null;
  updatedAt: Date;
};

export type EventPublicationRow = {
  id: string;
  organizationId: string;
  eventId: string;
  shortDescription: string | null;
  fullDescription: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  logoAssetId: string | null;
  coverAssetId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageAssetId: string | null;
  accessibilitySummary: string | null;
  themeConfig: Prisma.JsonValue | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EventPublicationSectionRow = {
  id: string;
  organizationId: string;
  eventId: string;
  publicationId: string;
  kind: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  content: Prisma.JsonValue;
  canonicalSourceType: string | null;
  canonicalSourceId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EventPublicationEditable = Pick<
  EventPublicationRow,
  | 'shortDescription'
  | 'fullDescription'
  | 'publicContactEmail'
  | 'publicContactPhone'
  | 'seoTitle'
  | 'seoDescription'
  | 'accessibilitySummary'
  | 'themeConfig'
>;

export type EventPublicationSectionEditable = Pick<
  EventPublicationSectionRow,
  | 'kind'
  | 'title'
  | 'enabled'
  | 'sortOrder'
  | 'content'
  | 'canonicalSourceType'
  | 'canonicalSourceId'
>;

type QueryClient = PrismaService | Prisma.TransactionClient;

const PUBLICATION_COLUMNS = Prisma.sql`
  "id",
  "organizationId",
  "eventId",
  "shortDescription",
  "fullDescription",
  "publicContactEmail",
  "publicContactPhone",
  "logoAssetId",
  "coverAssetId",
  "seoTitle",
  "seoDescription",
  "socialImageAssetId",
  "accessibilitySummary",
  "themeConfig",
  "revision",
  "createdAt",
  "updatedAt"
`;

const SECTION_COLUMNS = Prisma.sql`
  "id",
  "organizationId",
  "eventId",
  "publicationId",
  "kind",
  "title",
  "enabled",
  "sortOrder",
  "content",
  "canonicalSourceType",
  "canonicalSourceId",
  "revision",
  "createdAt",
  "updatedAt"
`;

@Injectable()
export class EventPublicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockEventScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
  ): Promise<EventPublicationLockedEvent | null> {
    const rows = await tx.$queryRaw<EventPublicationLockedEvent[]>(Prisma.sql`
      SELECT
        "id",
        "organizationId",
        "name",
        "slug",
        "status",
        "format",
        "startDate",
        "endDate",
        "timeZone",
        "venue",
        "updatedAt"
      FROM "Event"
      WHERE "id" = ${eventId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `);
    return rows[0] ?? null;
  }

  async transitionEventStatus(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    fromStatus: EventStatus,
    toStatus: EventStatus,
  ): Promise<{ status: EventStatus; updatedAt: Date } | null> {
    const rows = await tx.$queryRaw<Array<{ status: EventStatus; updatedAt: Date }>>(Prisma.sql`
      UPDATE "Event"
      SET "status" = ${toStatus}::"EventStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${eventId}
        AND "organizationId" = ${organizationId}
        AND "status" = ${fromStatus}::"EventStatus"
      RETURNING "status", "updatedAt"
    `);
    return rows[0] ?? null;
  }

  async findByScope(
    client: QueryClient,
    organizationId: string,
    eventId: string,
  ): Promise<EventPublicationRow | null> {
    const rows = await client.$queryRaw<EventPublicationRow[]>(Prisma.sql`
      SELECT ${PUBLICATION_COLUMNS}
      FROM "EventPublication"
      WHERE "eventId" = ${eventId} AND "organizationId" = ${organizationId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async findSectionsByScope(
    client: QueryClient,
    organizationId: string,
    eventId: string,
    publicationId: string,
  ): Promise<EventPublicationSectionRow[]> {
    return client.$queryRaw<EventPublicationSectionRow[]>(Prisma.sql`
      SELECT ${SECTION_COLUMNS}
      FROM "EventPublicationSection"
      WHERE
        "organizationId" = ${organizationId}
        AND "eventId" = ${eventId}
        AND "publicationId" = ${publicationId}
      ORDER BY "sortOrder" ASC, "id" ASC
    `);
  }

  async findSectionByScope(
    client: QueryClient,
    organizationId: string,
    eventId: string,
    publicationId: string,
    sectionId: string,
  ): Promise<EventPublicationSectionRow | null> {
    const rows = await client.$queryRaw<EventPublicationSectionRow[]>(Prisma.sql`
      SELECT ${SECTION_COLUMNS}
      FROM "EventPublicationSection"
      WHERE
        "id" = ${sectionId}
        AND "organizationId" = ${organizationId}
        AND "eventId" = ${eventId}
        AND "publicationId" = ${publicationId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async create(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    editable: EventPublicationEditable,
  ): Promise<EventPublicationRow> {
    const id = randomUUID();
    const themeConfigSql = this.jsonSql(editable.themeConfig);
    const rows = await tx.$queryRaw<EventPublicationRow[]>(Prisma.sql`
      INSERT INTO "EventPublication" (
        "id",
        "organizationId",
        "eventId",
        "shortDescription",
        "fullDescription",
        "publicContactEmail",
        "publicContactPhone",
        "seoTitle",
        "seoDescription",
        "accessibilitySummary",
        "themeConfig",
        "revision",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${organizationId},
        ${eventId},
        ${editable.shortDescription},
        ${editable.fullDescription},
        ${editable.publicContactEmail},
        ${editable.publicContactPhone},
        ${editable.seoTitle},
        ${editable.seoDescription},
        ${editable.accessibilitySummary},
        ${themeConfigSql},
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING ${PUBLICATION_COLUMNS}
    `);
    return rows[0];
  }

  async updateIfRevision(
    tx: Prisma.TransactionClient,
    current: EventPublicationRow,
    expectedRevision: number,
    editable: EventPublicationEditable,
  ): Promise<EventPublicationRow | null> {
    const themeConfigSql = this.jsonSql(editable.themeConfig);
    const rows = await tx.$queryRaw<EventPublicationRow[]>(Prisma.sql`
      UPDATE "EventPublication"
      SET
        "shortDescription" = ${editable.shortDescription},
        "fullDescription" = ${editable.fullDescription},
        "publicContactEmail" = ${editable.publicContactEmail},
        "publicContactPhone" = ${editable.publicContactPhone},
        "seoTitle" = ${editable.seoTitle},
        "seoDescription" = ${editable.seoDescription},
        "accessibilitySummary" = ${editable.accessibilitySummary},
        "themeConfig" = ${themeConfigSql},
        "revision" = "revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${current.id}
        AND "eventId" = ${current.eventId}
        AND "organizationId" = ${current.organizationId}
        AND "revision" = ${expectedRevision}
      RETURNING ${PUBLICATION_COLUMNS}
    `);
    return rows[0] ?? null;
  }

  async createSection(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    publicationId: string,
    editable: EventPublicationSectionEditable,
  ): Promise<EventPublicationSectionRow> {
    const id = randomUUID();
    const contentSql = this.jsonSql(editable.content);
    const rows = await tx.$queryRaw<EventPublicationSectionRow[]>(Prisma.sql`
      INSERT INTO "EventPublicationSection" (
        "id",
        "organizationId",
        "eventId",
        "publicationId",
        "kind",
        "title",
        "enabled",
        "sortOrder",
        "content",
        "canonicalSourceType",
        "canonicalSourceId",
        "revision",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${organizationId},
        ${eventId},
        ${publicationId},
        ${editable.kind},
        ${editable.title},
        ${editable.enabled},
        ${editable.sortOrder},
        ${contentSql},
        ${editable.canonicalSourceType},
        ${editable.canonicalSourceId},
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING ${SECTION_COLUMNS}
    `);
    return rows[0];
  }

  async updateSectionIfRevision(
    tx: Prisma.TransactionClient,
    current: EventPublicationSectionRow,
    expectedRevision: number,
    editable: EventPublicationSectionEditable,
  ): Promise<EventPublicationSectionRow | null> {
    const contentSql = this.jsonSql(editable.content);
    const rows = await tx.$queryRaw<EventPublicationSectionRow[]>(Prisma.sql`
      UPDATE "EventPublicationSection"
      SET
        "kind" = ${editable.kind},
        "title" = ${editable.title},
        "enabled" = ${editable.enabled},
        "sortOrder" = ${editable.sortOrder},
        "content" = ${contentSql},
        "canonicalSourceType" = ${editable.canonicalSourceType},
        "canonicalSourceId" = ${editable.canonicalSourceId},
        "revision" = "revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${current.id}
        AND "organizationId" = ${current.organizationId}
        AND "eventId" = ${current.eventId}
        AND "publicationId" = ${current.publicationId}
        AND "revision" = ${expectedRevision}
      RETURNING ${SECTION_COLUMNS}
    `);
    return rows[0] ?? null;
  }

  async removeSectionIfRevision(
    tx: Prisma.TransactionClient,
    current: EventPublicationSectionRow,
    expectedRevision: number,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM "EventPublicationSection"
      WHERE
        "id" = ${current.id}
        AND "organizationId" = ${current.organizationId}
        AND "eventId" = ${current.eventId}
        AND "publicationId" = ${current.publicationId}
        AND "revision" = ${expectedRevision}
      RETURNING "id"
    `);
    return rows.length === 1;
  }

  async reorderSections(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    publicationId: string,
    orderedSections: Array<{ id: string; revision: number }>,
  ): Promise<boolean> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "EventPublicationSection"
      SET "sortOrder" = "sortOrder" + 1000000
      WHERE
        "organizationId" = ${organizationId}
        AND "eventId" = ${eventId}
        AND "publicationId" = ${publicationId}
    `);

    for (let index = 0; index < orderedSections.length; index += 1) {
      const section = orderedSections[index];
      const affected = await tx.$executeRaw(Prisma.sql`
        UPDATE "EventPublicationSection"
        SET
          "sortOrder" = ${index},
          "revision" = "revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE
          "id" = ${section.id}
          AND "organizationId" = ${organizationId}
          AND "eventId" = ${eventId}
          AND "publicationId" = ${publicationId}
          AND "revision" = ${section.revision}
      `);
      if (affected !== 1) return false;
    }
    return true;
  }

  private jsonSql(value: Prisma.JsonValue | null): Prisma.Sql {
    if (value === null) return Prisma.sql`NULL`;
    return Prisma.sql`CAST(${JSON.stringify(value)} AS JSONB)`;
  }
}
