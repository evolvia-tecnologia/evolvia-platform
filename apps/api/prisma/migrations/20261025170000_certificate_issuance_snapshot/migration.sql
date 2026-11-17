-- Additive: legacy certificates deliberately remain without a historical snapshot.
-- Application rollback preserves these columns and all issued documents/assets.
ALTER TABLE "EventCertificate"
  ADD COLUMN "snapshotVersion" INTEGER,
  ADD COLUMN "snapshotEventName" TEXT,
  ADD COLUMN "snapshotTitle" VARCHAR(240),
  ADD COLUMN "snapshotBody" VARCHAR(4000),
  ADD COLUMN "snapshotArtKey" VARCHAR(180),
  ADD COLUMN "snapshotArtMime" VARCHAR(32),
  ADD COLUMN "snapshotArtAlt" VARCHAR(180);
ALTER TABLE "EventRoleCertificate"
  ADD COLUMN "snapshotVersion" INTEGER,
  ADD COLUMN "snapshotEventName" TEXT,
  ADD COLUMN "snapshotTitle" VARCHAR(240),
  ADD COLUMN "snapshotBody" VARCHAR(4000);
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_snapshot_complete" CHECK (
  ("snapshotVersion" IS NULL AND "snapshotEventName" IS NULL AND "snapshotTitle" IS NULL AND "snapshotBody" IS NULL AND "snapshotArtKey" IS NULL AND "snapshotArtMime" IS NULL AND "snapshotArtAlt" IS NULL)
  OR ("snapshotVersion" IS NOT NULL AND "snapshotVersion" = 1 AND "snapshotEventName" IS NOT NULL AND "snapshotTitle" IS NOT NULL AND "snapshotBody" IS NOT NULL
    AND (("snapshotArtKey" IS NULL AND "snapshotArtMime" IS NULL AND "snapshotArtAlt" IS NULL)
      OR ("snapshotArtKey" IS NOT NULL AND "snapshotArtMime" IS NOT NULL AND "snapshotArtMime" IN ('image/png', 'image/jpeg', 'image/webp') AND left("snapshotArtKey", length("organizationId" || '/' || "eventId" || '/')) = "organizationId" || '/' || "eventId" || '/')))
);
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_snapshot_complete" CHECK (
  ("snapshotVersion" IS NULL AND "snapshotEventName" IS NULL AND "snapshotTitle" IS NULL AND "snapshotBody" IS NULL)
  OR ("snapshotVersion" IS NOT NULL AND "snapshotVersion" = 1 AND "snapshotEventName" IS NOT NULL AND "snapshotTitle" IS NOT NULL AND "snapshotBody" IS NOT NULL)
);
