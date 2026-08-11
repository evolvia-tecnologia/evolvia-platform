import { Injectable } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';

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
  ): Promise<{ status: EventStatus } | null> {
    const rows = await tx.$queryRaw<Array<{ status: EventStatus }>>(Prisma.sql`
      SELECT "status"
      FROM "Event"
      WHERE "id" = ${eventId} AND "organizationId" = ${organizationId}
      FOR UPDATE
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

  private jsonSql(value: Prisma.JsonValue | null): Prisma.Sql {
    if (value === null) return Prisma.sql`NULL`;
    return Prisma.sql`CAST(${JSON.stringify(value)} AS JSONB)`;
  }
}
