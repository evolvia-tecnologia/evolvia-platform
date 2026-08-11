-- Fase 1 / Divulgação / Lote 2
-- Agregado editorial event-scoped e organization-scoped.
-- Event permanece fonte canônica para nome, slug, formato, datas, local,
-- perfil, modo de inscrição e status.

CREATE TABLE "EventPublication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "publicContactEmail" TEXT,
    "publicContactPhone" TEXT,
    "logoAssetId" TEXT,
    "coverAssetId" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "socialImageAssetId" TEXT,
    "accessibilitySummary" TEXT,
    "themeConfig" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventPublication_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "EventPublicationSection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "canonicalSourceType" TEXT,
    "canonicalSourceId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPublicationSection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventPublicationSection_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "EventPublicationSection_sort_order_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "EventPublicationSection_canonical_source_pair_check" CHECK (
        ("canonicalSourceType" IS NULL AND "canonicalSourceId" IS NULL)
        OR ("canonicalSourceType" IS NOT NULL AND "canonicalSourceId" IS NOT NULL)
    )
);

-- Um único agregado editorial por evento/organização.
CREATE UNIQUE INDEX "EventPublication_eventId_organizationId_key"
ON "EventPublication"("eventId", "organizationId");

-- Necessário para FKs compostas que preservam tenant + evento no relacionamento.
CREATE UNIQUE INDEX "EventPublication_id_eventId_organizationId_key"
ON "EventPublication"("id", "eventId", "organizationId");

CREATE INDEX "EventPublication_organizationId_eventId_updatedAt_idx"
ON "EventPublication"("organizationId", "eventId", "updatedAt");

CREATE UNIQUE INDEX "EventPublicationSection_id_eventId_organizationId_key"
ON "EventPublicationSection"("id", "eventId", "organizationId");

CREATE UNIQUE INDEX "EventPublicationSection_publicationId_sortOrder_key"
ON "EventPublicationSection"("publicationId", "sortOrder");

CREATE INDEX "EventPublicationSection_organizationId_eventId_enabled_sortOrder_idx"
ON "EventPublicationSection"("organizationId", "eventId", "enabled", "sortOrder");

CREATE INDEX "EventPublicationSection_eventId_kind_idx"
ON "EventPublicationSection"("eventId", "kind");

-- O par eventId + organizationId deve existir no Event. Isso bloqueia associação
-- cross-tenant/cross-event no próprio banco, além da ACL da aplicação.
ALTER TABLE "EventPublication"
ADD CONSTRAINT "EventPublication_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId")
REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPublicationSection"
ADD CONSTRAINT "EventPublicationSection_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId")
REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPublicationSection"
ADD CONSTRAINT "EventPublicationSection_publicationId_eventId_organizationId_fkey"
FOREIGN KEY ("publicationId", "eventId", "organizationId")
REFERENCES "EventPublication"("id", "eventId", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;
