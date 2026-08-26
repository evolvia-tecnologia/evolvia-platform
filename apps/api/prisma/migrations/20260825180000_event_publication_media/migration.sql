-- Additive public-media foundation. Existing publication rows remain valid because
-- every link is nullable and no existing value is rewritten.
CREATE TYPE "EventMediaUsage" AS ENUM ('LOGO', 'COVER', 'SOCIAL_SHARE');
CREATE TYPE "EventMediaAssetState" AS ENUM ('ACTIVE', 'REPLACED', 'REMOVED');

CREATE TABLE "EventMediaAsset" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "usage" "EventMediaUsage" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "altText" TEXT,
  "decorative" BOOLEAN NOT NULL DEFAULT false,
  "state" "EventMediaAssetState" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "replacedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventMediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventMediaAsset_storageKey_key" ON "EventMediaAsset"("storageKey");
CREATE UNIQUE INDEX "EventMediaAsset_id_eventId_organizationId_key" ON "EventMediaAsset"("id", "eventId", "organizationId");
CREATE INDEX "EventMediaAsset_organizationId_eventId_usage_state_idx" ON "EventMediaAsset"("organizationId", "eventId", "usage", "state");
CREATE INDEX "EventMediaAsset_createdAt_idx" ON "EventMediaAsset"("createdAt");

ALTER TABLE "EventMediaAsset"
  ADD CONSTRAINT "EventMediaAsset_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPublication"
  ADD CONSTRAINT "EventPublication_logoAssetId_eventId_organizationId_fkey"
  FOREIGN KEY ("logoAssetId", "eventId", "organizationId")
  REFERENCES "EventMediaAsset"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EventPublication_coverAssetId_eventId_organizationId_fkey"
  FOREIGN KEY ("coverAssetId", "eventId", "organizationId")
  REFERENCES "EventMediaAsset"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EventPublication_socialImageAssetId_eventId_organizationId_fkey"
  FOREIGN KEY ("socialImageAssetId", "eventId", "organizationId")
  REFERENCES "EventMediaAsset"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
