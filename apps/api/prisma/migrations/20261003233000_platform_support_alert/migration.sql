-- Internal alerts for the Evolvia care team. Organizer APIs do not read this table.
CREATE TABLE "PlatformSupportAlert" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSupportAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformSupportAlert_kind_createdAt_idx"
  ON "PlatformSupportAlert"("kind", "createdAt");
CREATE INDEX "PlatformSupportAlert_eventId_createdAt_idx"
  ON "PlatformSupportAlert"("eventId", "createdAt");
