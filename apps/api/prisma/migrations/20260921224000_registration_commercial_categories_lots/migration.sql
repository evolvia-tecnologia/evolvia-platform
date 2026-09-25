CREATE TYPE "RegistrationProofRequirement" AS ENUM ('NONE', 'REQUIRED_BEFORE_PAYMENT');

CREATE TABLE "EventRegistrationCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRegistrationCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "proofRequirement" "RegistrationProofRequirement" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRegistrationLot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRegistrationCatalog_eventId_organizationId_key"
ON "EventRegistrationCatalog"("eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationCatalog_id_eventId_organizationId_key"
ON "EventRegistrationCatalog"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationCatalog_organizationId_eventId_idx"
ON "EventRegistrationCatalog"("organizationId", "eventId");

CREATE UNIQUE INDEX "EventRegistrationCategory_id_eventId_organizationId_key"
ON "EventRegistrationCategory"("id", "eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationCategory_eventId_code_key"
ON "EventRegistrationCategory"("eventId", "code");
CREATE INDEX "EventRegistrationCategory_organizationId_eventId_active_idx"
ON "EventRegistrationCategory"("organizationId", "eventId", "active");
CREATE INDEX "EventRegistrationCategory_catalogId_sortOrder_idx"
ON "EventRegistrationCategory"("catalogId", "sortOrder");

CREATE UNIQUE INDEX "EventRegistrationLot_categoryId_code_key"
ON "EventRegistrationLot"("categoryId", "code");
CREATE INDEX "EventRegistrationLot_organizationId_eventId_active_idx"
ON "EventRegistrationLot"("organizationId", "eventId", "active");
CREATE INDEX "EventRegistrationLot_categoryId_sortOrder_idx"
ON "EventRegistrationLot"("categoryId", "sortOrder");
CREATE INDEX "EventRegistrationLot_categoryId_startsAt_endsAt_idx"
ON "EventRegistrationLot"("categoryId", "startsAt", "endsAt");

ALTER TABLE "EventRegistrationCatalog"
ADD CONSTRAINT "EventRegistrationCatalog_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationCategory"
ADD CONSTRAINT "EventRegistrationCategory_catalogId_eventId_organizationId_fkey"
FOREIGN KEY ("catalogId", "eventId", "organizationId")
REFERENCES "EventRegistrationCatalog"("id", "eventId", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationLot"
ADD CONSTRAINT "EventRegistrationLot_categoryId_eventId_organizationId_fkey"
FOREIGN KEY ("categoryId", "eventId", "organizationId")
REFERENCES "EventRegistrationCategory"("id", "eventId", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;
